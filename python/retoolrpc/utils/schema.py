from typing import Any, Dict, List, Tuple

from retoolrpc.utils.errors import InvalidArgumentsError
from retoolrpc.utils.helpers import (
    is_boolean_string,
    is_falsy_argument_value,
    is_json_value,
    is_number_string,
)
from retoolrpc.utils.types import Arguments, ArgumentType


class ArgumentParser:
    def __init__(self, schema: Arguments):
        self.schema = schema

    def parse(
        self, arguments_to_parse: Dict[str, Any]
    ) -> Tuple[Dict[str, Any], List[str]]:
        parsed_arguments = arguments_to_parse.copy()
        parsed_errors = []

        for arg_name, arg_definition in self.schema.items():
            arg_value = arguments_to_parse.get(arg_name)
            falsy_arg_value = is_falsy_argument_value(arg_value)

            if falsy_arg_value and arg_definition["required"]:
                parsed_errors.append(f'Argument "{arg_name}" is required but missing.')
                continue

            if not falsy_arg_value:
                if arg_definition["array"]:
                    if not isinstance(arg_value, list):
                        parsed_errors.append(
                            f'Argument "{arg_name}" should be an array.'
                        )
                        continue

                    parse_value_type_items = [
                        self.parse_value_type(item, arg_definition["type"])
                        for item in arg_value
                    ]
                    if not all(item[0] for item in parse_value_type_items):
                        parsed_errors.append(
                            f'Argument "{arg_name}" should be an array of type '
                            f'"{arg_definition["type"]}".'
                        )

                    parsed_arguments[arg_name] = [
                        item[1] for item in parse_value_type_items
                    ]
                else:
                    is_valid_type, parsed_value = self.parse_value_type(
                        arg_value, arg_definition["type"]
                    )
                    if not is_valid_type:
                        parsed_errors.append(
                            f'Argument "{arg_name}" should be of type '
                            f'"{arg_definition["type"]}".'
                        )

                    parsed_arguments[arg_name] = parsed_value

        return parsed_arguments, parsed_errors

    def parse_value_type(
        self, value: Any, expected_type: ArgumentType
    ) -> Tuple[bool, Any]:
        if expected_type == "string":
            return True, str(value)
        elif expected_type == "boolean":
            if isinstance(value, bool):
                return True, value
            elif is_boolean_string(value):
                return True, value.lower() == "true"
            else:
                return False, value
        elif expected_type == "number":
            if isinstance(value, (int, float)):
                return True, value
            elif is_number_string(value):
                return True, float(value)
            else:
                return False, value
        elif expected_type == "dict":
            if isinstance(value, dict):
                return True, value
            else:
                return False, value
        elif expected_type == "json":
            if is_json_value(value):
                return True, value
            else:
                return False, value
        else:
            raise ValueError(f"Unknown argument type '{expected_type}'.")


def parse_function_arguments(args: Any, schema: Arguments) -> Dict[str, Any]:
    if not isinstance(args, dict):
        raise ValueError("The given arguments are invalid.")

    argument_parser = ArgumentParser(schema)
    parsed_arguments, parsed_errors = argument_parser.parse(args)

    if parsed_errors:
        error_message = "\n".join(["Invalid parameter(s) found:"] + parsed_errors)
        raise InvalidArgumentsError(error_message)

    return {k: v for k, v in parsed_arguments.items() if k in schema.keys()}
