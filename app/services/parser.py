from app.db import CATEGORY_METRICS, delete_row, get_rows, insert_row, update_row


def get_category_value_columns(category):
    return CATEGORY_METRICS.get(category, [])


def read_category_rows(category, period="month"):
    return get_rows(category, period)


def append_category_row(category, date_value, value_key, value):
    return insert_row(category, date_value, value_key, value)


def update_category_entry(category, date_value, value_key, value):
    return update_row(category, date_value, value_key, value)


def delete_category_entry(category, date_value):
    return delete_row(category, date_value)
