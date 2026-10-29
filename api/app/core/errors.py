"""Errors the services raise (no HTTP objects there); main.py maps them to status codes."""


class NotFound(Exception):
    """404"""


class BadRequest(Exception):
    """400"""


class Unsupported(Exception):
    """415: a file this app can't convert"""
