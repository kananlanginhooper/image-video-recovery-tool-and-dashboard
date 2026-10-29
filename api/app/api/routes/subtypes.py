"""Screenshot subtype review."""

from fastapi import APIRouter

from app.schemas.subtypes import Ok, SubtypeAnswer, SubtypePage
from app.services import catalog

router = APIRouter(prefix="/api", tags=["subtypes"])


@router.get("/subtypes", response_model=SubtypePage)
def subtypes(type: str = "web_game_asset", status: str = "match", label: str = "", sample: str = ""):
    return catalog.subtypes(type, status, label, sample)


@router.post("/subtype/{h}/{sub}", response_model=Ok)
def answer(h: str, sub: str, body: SubtypeAnswer):
    catalog.answer_subtype(h, sub, body.verdict)
    return Ok()
