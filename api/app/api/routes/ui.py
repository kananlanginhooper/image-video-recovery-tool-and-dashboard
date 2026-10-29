"""The built Angular UI. Registered last, so every /api/ route wins."""

import html
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

from app.core.config import settings

router = APIRouter(include_in_schema=False)


@router.get("/{path:path}")
def ui(path: str):
    """Built files as they are (hashed names cached for good); anything else is index.html with <base href> = UI_BASE_PATH."""
    if path.startswith("api/"):
        raise HTTPException(404)
    root = os.path.abspath(settings.media_ui_dir)
    f = os.path.normpath(os.path.join(root, path))
    if path and f.startswith(root + os.sep) and os.path.isfile(f):
        return FileResponse(f, headers={"Cache-Control": "public, max-age=31536000, immutable"})
    index = os.path.join(root, "index.html")
    if not os.path.isfile(index):
        raise HTTPException(503, "UI not built (ui/dist/media/browser)")
    with open(index, encoding="utf-8") as fh:
        page = fh.read().replace('<base href="/">', f'<base href="{html.escape(settings.base_path)}">', 1)
    return HTMLResponse(page, headers={"Cache-Control": "no-store"})
