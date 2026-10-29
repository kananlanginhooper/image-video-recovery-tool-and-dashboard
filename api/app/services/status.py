"""The seams a plugin hooks into (api/private/*.py, register(core)). Off by default."""

from collections.abc import Callable


class STATUS:
    """Optional per-item status from a plugin (e.g. a content scan). Off by default: every item is 'none', nothing hidden."""

    join = ""  # SQL joined to media_browse b, e.g. "LEFT JOIN scan s ON s.hash=b.hash"
    expr = "'none'"  # SQL for the status of b
    values: list[str] = []  # statuses offered as a Browse filter
    hidden: tuple[str, ...] = ()  # statuses blurred until clicked
    label = "status"


# ctx prefix -> fn(ctx, hash) -> (prev, next): previous/next for lists a plugin owns
NEIGHBORS: dict[str, Callable[[str, str], tuple[str | None, str | None]]] = {}
# fn(hash, row) -> [{"label": ..., "text": ..., ...}]: extra lines in the item details
ITEM_EXTRAS: list[Callable[[str, dict], list[dict]]] = []
