import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "database.db"

# Список категорий и доступных метрик (колонок) для фронтенда.
CATEGORY_METRICS = {
    "health": ["sleep_hours", "steps"],
    "study": ["study_hours"],
    "sport": ["training_minutes"],
    "work": ["focus_hours"],
}


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _now_iso():
    return datetime.utcnow().isoformat(timespec="seconds")


def _filter_by_period(records, period):
    if not records:
        return []

    parsed = []
    for record in records:
        try:
            parsed.append((datetime.strptime(record["date"], "%Y-%m-%d").date(), record))
        except ValueError:
            continue

    if not parsed:
        return []

    parsed.sort(key=lambda item: item[0])
    latest_date = parsed[-1][0]

    if period == "day":
        start_date = latest_date
    elif period == "week":
        start_date = latest_date - timedelta(days=6)
    elif period == "month":
        start_date = latest_date - timedelta(days=29)
    else:  # year
        start_date = latest_date - timedelta(days=364)

    return [record for row_date, record in parsed if row_date >= start_date]


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        for category in CATEGORY_METRICS:
            conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {category} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT UNIQUE,
                    value_key TEXT,
                    value REAL,
                    created_at TEXT,
                    updated_at TEXT
                )
                """
            )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                target_value REAL NOT NULL,
                period TEXT NOT NULL CHECK(period IN ('day','week','month')),
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def get_rows(category, period="month"):
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT date, value_key, value FROM {category} ORDER BY date ASC"
        ).fetchall()

    records = [dict(row) for row in rows]
    records = _filter_by_period(records, period)

    value_columns = CATEGORY_METRICS[category]
    result = []
    for record in records:
        item = {"date": record["date"]}
        for column in value_columns:
            item[column] = ""
        key = record["value_key"]
        if key in value_columns:
            item[key] = record["value"]
        result.append(item)
    return result


def insert_row(category, date_value, value_key, value):
    now = _now_iso()
    try:
        with _connect() as conn:
            conn.execute(
                f"""
                INSERT INTO {category} (date, value_key, value, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (date_value, value_key, value, now, now),
            )
            conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def update_row(category, date_value, value_key, value):
    with _connect() as conn:
        cursor = conn.execute(
            f"""
            UPDATE {category}
            SET value_key = ?, value = ?, updated_at = ?
            WHERE date = ?
            """,
            (value_key, value, _now_iso(), date_value),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_row(category, date_value):
    with _connect() as conn:
        cursor = conn.execute(f"DELETE FROM {category} WHERE date = ?", (date_value,))
        conn.commit()
        return cursor.rowcount > 0


def get_stats(category, period="month", metric_key=None):
    rows = get_rows(category, period)
    value_columns = CATEGORY_METRICS[category]

    if metric_key is None:
        # Берем первую колонку, в которой есть хотя бы одно числовое значение.
        for column in value_columns:
            has_value = False
            for row in rows:
                try:
                    float(row.get(column, ""))
                    has_value = True
                    break
                except (TypeError, ValueError):
                    continue
            if has_value:
                metric_key = column
                break

    if metric_key is None:
        return {
            "count": len(rows),
            "value_key": None,
            "average": None,
            "max": None,
            "min": None,
            "change_from_previous_day": None,
            "period": period,
        }

    values = []
    for row in rows:
        try:
            values.append(float(row.get(metric_key, "")))
        except (TypeError, ValueError):
            continue

    if not values:
        return {
            "count": len(rows),
            "value_key": metric_key,
            "average": None,
            "max": None,
            "min": None,
            "change_from_previous_day": None,
            "period": period,
        }

    change = None
    if len(values) >= 2:
        change = values[-1] - values[-2]

    return {
        "count": len(rows),
        "value_key": metric_key,
        "average": sum(values) / len(values),
        "max": max(values),
        "min": min(values),
        "change_from_previous_day": change,
        "period": period,
    }


def create_goal(category, target_value, period):
    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO goals (category, target_value, period, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (category, target_value, period, _now_iso()),
        )
        conn.commit()
        return cursor.lastrowid


def list_goals():
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, category, target_value, period, created_at
            FROM goals
            ORDER BY id DESC
            """
        ).fetchall()
    return [dict(row) for row in rows]
