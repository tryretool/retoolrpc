import re
from typing import Any


def is_json_value(data):
    """
    Validate if a given value is JSON-like
    (string, boolean, number, list, dictionary, or None).
    """
    if isinstance(data, (str, bool, type(None), int, float)):
        return True
    elif isinstance(data, list):
        return all(is_json_value(item) for item in data)
    elif isinstance(data, dict):
        for key, value in data.items():
            if not isinstance(key, str) or not is_json_value(value):
                return False
        return True
    return False


def is_falsy_argument_value(value: Any) -> bool:
    """
    Check if the given value is considered falsy.
    """
    return value in (None, "")


def is_boolean_string(value: Any) -> bool:
    """
    Check if the given value is a string that can be interpreted as a boolean.
    """
    if isinstance(value, str):
        return value.lower() in ("true", "false")
    return False


def is_number_string(value: Any) -> bool:
    """
    Check if the given value is a string that can be interpreted as a number.
    """
    if isinstance(value, str):
        return bool(re.match(r"^-?\d+(\.\d+)?$", value))
    return False


def is_client_error(status: int) -> bool:
    """
    Check if the given HTTP status code indicates a client error.
    """
    return 400 <= status < 500
