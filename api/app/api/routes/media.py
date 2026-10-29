"""Thumbnails, viewer images, originals (Range, so videos seek) and video frames."""

from fastapi import APIRouter
from fastapi.responses import FileResponse, Response

from app.services import files
from app.services.files import Media

router = APIRouter(prefix="/api", tags=["media"])

PLACEHOLDER = (
    "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><rect width='100%' height='100%' fill='#8883'/>"
    "<text x='50%' y='50%' fill='#888' font-family='sans-serif' font-size='22' text-anchor='middle'>{}</text></svg>"
)
IMAGE = {200: {"content": {"image/jpeg": {}, "image/svg+xml": {}}, "description": "the image, or a placeholder drawing"}}


def media_response(m: Media) -> Response:
    """A file (Range requests work), or the placeholder drawing."""
    if m.placeholder:
        return Response(PLACEHOLDER.format(m.placeholder), media_type="image/svg+xml")
    headers = {"Cache-Control": "max-age=86400"} if m.cache else None
    return FileResponse(m.path, media_type=m.media_type, filename=m.filename, headers=headers)


@router.get("/thumb/{h}", response_class=Response, responses=IMAGE)
def thumb(h: str):
    return media_response(files.thumb(h))


@router.get("/view/{h}", response_class=Response, responses=IMAGE)
def view(h: str):
    return media_response(files.view(h))


@router.get("/file/{h}", response_class=Response, responses={200: {"description": "the original file"}})
def original(h: str):
    return media_response(files.original(h))


@router.get("/frame/{h}/{t}", response_class=Response, responses=IMAGE)
def frame(h: str, t: int):
    return media_response(files.video_frame(h, t))
