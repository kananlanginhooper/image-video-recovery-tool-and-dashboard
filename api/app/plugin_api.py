"""What a plugin's register(core) receives: this module. Everything a plugin may use, in one place.

A plugin (MEDIA_PLUGIN_DIR/*.py, default api/private, not in git) can add routes to `app`, set a per-item STATUS,
add list contexts to NEIGHBORS and detail lines to ITEM_EXTRAS, read with q/qc and write with execute.
"""

from fastapi import FastAPI

from app.api.routes.media import media_response
from app.core.config import settings
from app.db import clear_cache, execute, q, qc
from app.services.catalog import BROWSER_IMAGE, tile_json
from app.services.files import video_frame
from app.services.status import ITEM_EXTRAS, NEIGHBORS, STATUS

app: FastAPI | None = None  # set by load_plugins()
REVIEWER = settings.media_reviewer  # value for decided_by when you answer a review question

__all__ = [
    "app",
    "REVIEWER",
    "STATUS",
    "NEIGHBORS",
    "ITEM_EXTRAS",
    "q",
    "qc",
    "execute",
    "clear_cache",
    "tile_json",
    "BROWSER_IMAGE",
    "video_frame",
    "media_response",
]
