from datetime import datetime
import json

from flask import Blueprint, jsonify, render_template, request

from app.db import (
    CATEGORY_METRICS,
    create_goal,
    delete_row,
    get_rows,
    get_stats,
    insert_row,
    list_goals,
    update_row,
)

# Blueprint для основных страниц и API.
bp = Blueprint("main", __name__)
ALLOWED_CATEGORIES = set(CATEGORY_METRICS.keys())


def _validate_category(category):
    # Поддерживаем только известные категории.
    if category not in ALLOWED_CATEGORIES:
        return jsonify({"error": f"Неизвестная категория: {category}"}), 400
    return None


def _parse_date(date_value):
    # Проверяем формат даты YYYY-MM-DD.
    try:
        datetime.strptime(date_value, "%Y-%m-%d")
    except ValueError:
        return False
    return True


def _get_period():
    # Доступные фильтры времени для графика и статистики.
    period = (request.args.get("period") or "month").strip().lower()
    if period not in {"week", "month", "year"}:
        return None
    return period


def _period_error_response():
    return jsonify({"error": "Некорректный период. Используйте week, month или year"}), 400


def _build_export_payload(category, period):
    data = get_rows(category, period)
    stats = get_stats(category, period)
    return {
        "category": category,
        "period": period,
        "generated_at": f"{datetime.utcnow().isoformat(timespec='seconds')}Z",
        "data": data,
        "stats": stats,
    }


def _extract_numeric_value(row):
    # В записи хранится одна активная метрика, поэтому берем первое числовое значение.
    for key, raw_value in row.items():
        if key == "date":
            continue
        try:
            return float(raw_value)
        except (TypeError, ValueError):
            continue
    return None


def _calculate_insights(category, period):
    rows = get_rows(category, period)
    points = []

    for row in rows:
        date_value = (row.get("date") or "").strip()
        try:
            parsed_date = datetime.strptime(date_value, "%Y-%m-%d").date()
        except ValueError:
            continue

        numeric_value = _extract_numeric_value(row)
        if numeric_value is None:
            continue

        points.append({"date": parsed_date, "date_str": date_value, "value": numeric_value})

    if not points:
        return {
            "category": category,
            "period": period,
            "trend": "stable",
            "percent_change": 0.0,
            "streak": 0,
            "average_per_day": 0.0,
            "max_day": None,
            "min_day": None,
        }

    points.sort(key=lambda item: item["date"])
    first_value = points[0]["value"]
    last_value = points[-1]["value"]

    if last_value > first_value:
        trend = "up"
    elif last_value < first_value:
        trend = "down"
    else:
        trend = "stable"

    percent_change = 0.0
    if first_value != 0:
        percent_change = ((last_value - first_value) / abs(first_value)) * 100

    # longest streak: максимальное количество подряд идущих дней с данными.
    longest_streak = 1
    current_streak = 1
    for i in range(1, len(points)):
        delta_days = (points[i]["date"] - points[i - 1]["date"]).days
        if delta_days == 1:
            current_streak += 1
        else:
            current_streak = 1
        if current_streak > longest_streak:
            longest_streak = current_streak

    average_per_day = sum(point["value"] for point in points) / len(points)
    max_point = max(points, key=lambda item: item["value"])
    min_point = min(points, key=lambda item: item["value"])

    return {
        "category": category,
        "period": period,
        "trend": trend,
        "percent_change": round(percent_change, 2),
        "streak": longest_streak,
        "average_per_day": round(average_per_day, 2),
        "max_day": max_point["date_str"],
        "min_day": min_point["date_str"],
    }


def _calculate_goal_status(goal):
    rows = get_rows(goal["category"], goal["period"])
    values = []
    for row in rows:
        numeric = _extract_numeric_value(row)
        if numeric is not None:
            values.append(numeric)

    actual = 0.0
    if values:
        actual = sum(values) / len(values)

    target = float(goal["target_value"])
    progress = 0
    if target > 0:
        progress = int(round((actual / target) * 100))

    if progress >= 100:
        status = "success"
    elif progress >= 70:
        status = "warning"
    else:
        status = "fail"

    return {
        "category": goal["category"],
        "target": target,
        "actual": round(actual, 2),
        "status": status,
        "progress": progress,
    }


@bp.route("/")
def index():
    # Отдаем главную страницу.
    return render_template("index.html")


@bp.route("/api/<category>")
def api_category(category):
    validation_error = _validate_category(category)
    if validation_error:
        return validation_error

    period = _get_period()
    if not period:
        return _period_error_response()

    rows = get_rows(category, period)
    return jsonify(rows)


@bp.route("/api/<category>", methods=["POST"])
def api_category_add(category):
    validation_error = _validate_category(category)
    if validation_error:
        return validation_error

    payload = request.get_json(silent=True) or {}
    date_value = (payload.get("date") or "").strip()
    numeric_value = payload.get("value")

    if not _parse_date(date_value):
        return jsonify({"error": "Некорректная дата. Используйте формат YYYY-MM-DD"}), 400

    # Проверяем, что значение числовое.
    try:
        value = float(numeric_value)
    except (TypeError, ValueError):
        return jsonify({"error": "Некорректное числовое значение"}), 400

    value_columns = CATEGORY_METRICS[category]
    if not value_columns:
        return jsonify({"error": "В категории нет колонки для числового значения"}), 400

    # Фронтенд может явно передать выбранную колонку; иначе берем первую.
    value_key = (payload.get("value_key") or "").strip() or value_columns[0]
    if value_key not in value_columns:
        return jsonify({"error": f"Колонка '{value_key}' не найдена"}), 400

    inserted = insert_row(category, date_value, value_key, value)
    if not inserted:
        return jsonify({"error": f"Запись с датой {date_value} уже существует"}), 409

    return jsonify({"ok": True})


@bp.route("/api/<category>", methods=["PUT"])
def api_category_edit(category):
    validation_error = _validate_category(category)
    if validation_error:
        return validation_error

    payload = request.get_json(silent=True) or {}
    date_value = (payload.get("date") or "").strip()
    numeric_value = payload.get("value")
    value_key = (payload.get("value_key") or "").strip()

    if not _parse_date(date_value):
        return jsonify({"error": "Некорректная дата. Используйте формат YYYY-MM-DD"}), 400

    if value_key not in CATEGORY_METRICS[category]:
        return jsonify({"error": f"Колонка '{value_key}' не найдена"}), 400

    try:
        value = float(numeric_value)
    except (TypeError, ValueError):
        return jsonify({"error": "Некорректное числовое значение"}), 400

    updated = update_row(category, date_value, value_key, value)
    if not updated:
        return jsonify({"error": f"Запись с датой {date_value} не найдена"}), 404

    return jsonify({"ok": True})


@bp.route("/api/<category>", methods=["DELETE"])
def api_category_delete(category):
    validation_error = _validate_category(category)
    if validation_error:
        return validation_error

    payload = request.get_json(silent=True) or {}
    date_value = (payload.get("date") or "").strip()

    if not _parse_date(date_value):
        return jsonify({"error": "Некорректная дата. Используйте формат YYYY-MM-DD"}), 400

    deleted = delete_row(category, date_value)
    if not deleted:
        return jsonify({"error": f"Запись с датой {date_value} не найдена"}), 404

    return jsonify({"ok": True})


@bp.route("/api/<category>/stats")
def api_category_stats(category):
    validation_error = _validate_category(category)
    if validation_error:
        return validation_error

    period = _get_period()
    if not period:
        return _period_error_response()

    metric_key = (request.args.get("metric_key") or "").strip()
    if metric_key and metric_key not in CATEGORY_METRICS[category]:
        return jsonify({"error": f"Колонка '{metric_key}' не найдена"}), 400

    stats = get_stats(category, period, metric_key or None)
    return jsonify(stats)


@bp.route("/api/export")
def api_export():
    category = (request.args.get("category") or "").strip()
    if not category:
        return jsonify({"error": "Параметр category обязателен"}), 400

    validation_error = _validate_category(category)
    if validation_error:
        return validation_error

    period = _get_period()
    if not period:
        return _period_error_response()

    return jsonify(_build_export_payload(category, period))


@bp.route("/api/ai-prompt")
def api_ai_prompt():
    category = (request.args.get("category") or "").strip()
    if not category:
        return jsonify({"error": "Параметр category обязателен"}), 400

    validation_error = _validate_category(category)
    if validation_error:
        return validation_error

    period = _get_period()
    if not period:
        return _period_error_response()

    export_payload = _build_export_payload(category, period)
    export_json = json.dumps(export_payload, ensure_ascii=False, indent=2)

    prompt = (
        "Ты мой персональный аналитик.\n"
        f"Проанализируй мои данные за {period}:\n\n"
        f"{export_json}\n\n"
        "Скажи:\n\n"
        "слабые места\n\n"
        "сильные стороны\n\n"
        "приоритеты на месяц\n\n"
        "конкретные шаги"
    )

    return jsonify({"prompt": prompt})


@bp.route("/api/insights")
def api_insights():
    category = (request.args.get("category") or "").strip()
    if not category:
        return jsonify({"error": "Параметр category обязателен"}), 400

    validation_error = _validate_category(category)
    if validation_error:
        return validation_error

    period = _get_period()
    if not period:
        return _period_error_response()

    insights = _calculate_insights(category, period)
    return jsonify(insights)


@bp.route("/api/goals", methods=["POST"])
def api_goals_create():
    payload = request.get_json(silent=True) or {}
    category = (payload.get("category") or "").strip()
    target_raw = payload.get("target")
    period = (payload.get("period") or "").strip().lower()

    if not category:
        return jsonify({"error": "Параметр category обязателен"}), 400
    if category not in ALLOWED_CATEGORIES:
        return jsonify({"error": f"Неизвестная категория: {category}"}), 400

    try:
        target = float(target_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "Параметр target должен быть числом"}), 400
    if target <= 0:
        return jsonify({"error": "Параметр target должен быть больше 0"}), 400

    if period not in {"day", "week", "month"}:
        return jsonify({"error": "Параметр period должен быть day, week или month"}), 400

    goal_id = create_goal(category, target, period)
    return jsonify({"ok": True, "id": goal_id})


@bp.route("/api/goals")
def api_goals_list():
    goals = list_goals()
    result = []
    for goal in goals:
        result.append(
            {
                "id": goal["id"],
                "category": goal["category"],
                "target": goal["target_value"],
                "period": goal["period"],
                "created_at": goal["created_at"],
            }
        )
    return jsonify(result)


@bp.route("/api/goals/status")
def api_goals_status():
    goals = list_goals()
    statuses = [_calculate_goal_status(goal) for goal in goals]
    return jsonify(statuses)
