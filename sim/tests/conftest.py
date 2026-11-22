"""Isolate EDSL's import-time configuration during offline tests."""

from contextlib import ExitStack
from tempfile import TemporaryDirectory
from unittest.mock import patch


def pytest_configure(config):
    stack = ExitStack()
    config.add_cleanup(stack.close)
    directory = stack.enter_context(TemporaryDirectory(prefix="atlas-edsl-test-"))
    stack.enter_context(patch("platformdirs.user_cache_dir", return_value=directory))
    stack.enter_context(patch("platformdirs.user_data_dir", return_value=directory))
    stack.enter_context(patch("dotenv.find_dotenv", return_value=""))
    stack.enter_context(patch("dotenv.load_dotenv", return_value=False))
    stack.enter_context(patch.dict("os.environ", {"EDSL_FETCH_TOKEN_PRICES": "False"}))
