"""Screenshot subtype review: lists and your answers."""

from typing import Literal

from pydantic import BaseModel

from app.schemas.catalog import Tile


class SubtypeItem(Tile):
    conf: float
    label: str | None
    by_you: bool


class SubtypePage(BaseModel):
    type: str
    status: str
    label: str | None
    counts: dict[str, int]
    items: list[SubtypeItem]


class SubtypeAnswer(BaseModel):
    verdict: Literal["match", "no"]


class Ok(BaseModel):
    ok: bool = True
