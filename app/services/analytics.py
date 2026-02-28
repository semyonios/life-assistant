from app.db import get_rows, get_stats


def get_category_data(category, period="month"):
    return get_rows(category, period)


def calculate_category_stats(category, period="month", metric_key=None):
    return get_stats(category, period, metric_key)
