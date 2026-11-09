"""Browse, Folders, one item, Counts, health."""

from typing import Literal

from fastapi import APIRouter, Query

from app.schemas.catalog import BrowsePage, FolderList, Health, Item, Meta, Stats
from app.services import catalog, files

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/meta", response_model=Meta)
def meta():
    return catalog.meta()


@router.get("/browse", response_model=BrowsePage)
def browse(
    grp: Literal["image", "video", "all", ""] = "",
    cls: str = Query("", alias="class"),
    status: str = "",
    folder: str = "",
    date_from: str = Query("", alias="from"),
    date_to: str = Query("", alias="to"),
    q: str = Query("", description="OCR text search (boolean mode)"),
    sig: str = Query("", description="an image signal from meta.signals, e.g. product"),
    sort: Literal["new", "old", ""] = "",
    after: str = Query("", pattern=r"^(|[0-9: -]*\|[0-9a-f]{64})$", description="`next` from the previous answer"),
):
    """120 at a time, newest first; `next` in the answer continues the list, `ctx` is this list for the viewer's previous/next."""
    p = {"grp": grp, "class": cls, "status": status, "folder": folder, "from": date_from, "to": date_to, "q": q, "sig": sig, "sort": sort}
    page = catalog.browse({**{k: v for k, v in p.items() if v}, "after": after})
    files.warm([t["hash"] for t in page["items"]])
    return page


@router.get("/folders", response_model=FolderList)
def folders(prefix: str = ""):
    return catalog.folders(prefix)


@router.get("/item/{h}", response_model=Item)
def item(h: str, ctx: str = ""):
    return catalog.item(h, ctx)


@router.get("/stats", response_model=Stats)
def stats():
    return catalog.stats()


@router.get("/health", response_model=Health)
def health():
    return catalog.health()
