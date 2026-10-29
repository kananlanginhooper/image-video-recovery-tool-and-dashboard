"""HTTP middleware: frame-ancestors CSP, UI_BASE_PATH routing, and media streamed from another instance."""

import re
import urllib.error
import urllib.request

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response, StreamingResponse

from app.core.config import settings

# A machine without the files (e.g. a laptop) streams media from an instance that has them (MEDIA_FILES_UPSTREAM).
# Lists, details and answers stay local; only these media routes are passed through (with Range).
MEDIA_ROUTE = re.compile(r"^/api/(thumb|view|file|frame|pro/frame)/")
PASS_HEADERS = ("content-type", "content-length", "content-range", "accept-ranges", "cache-control", "content-disposition")


def _upstream_media(path: str, rng: str | None) -> Response:
    req = urllib.request.Request(settings.files_upstream + path, headers={"Range": rng} if rng else {})
    try:
        r = urllib.request.urlopen(req, timeout=150)
    except urllib.error.HTTPError as e:
        r = e
    except OSError:
        return Response("media upstream unreachable", status_code=502)

    def body():
        with r:
            while chunk := r.read(256 * 1024):
                yield chunk

    return StreamingResponse(body(), status_code=r.status, headers={k: v for k, v in r.headers.items() if k.lower() in PASS_HEADERS})


def add_middleware(app: FastAPI) -> None:
    """Order matters: the last one added runs first (base path, then upstream media, then the CSP header)."""

    @app.middleware("http")
    async def frame_policy(request: Request, call_next):
        """Only this app and the configured wrapper origins may show it in an iframe."""
        r = await call_next(request)
        r.headers["Content-Security-Policy"] = "frame-ancestors " + " ".join(["'self'", *settings.frame_parents])
        return r

    @app.middleware("http")
    async def media_from_upstream(request: Request, call_next):
        if settings.files_upstream and MEDIA_ROUTE.match(request.url.path):
            return await run_in_threadpool(_upstream_media, request.url.path, request.headers.get("range"))
        return await call_next(request)

    @app.middleware("http")
    async def strip_base_path(request: Request, call_next):
        """Under UI_BASE_PATH (e.g. /media/), route /media/api/... and /media/main-x.js as /api/... and /main-x.js."""
        base = settings.base_path
        if base != "/" and (request.url.path + "/").startswith(base):
            rest = request.url.path[len(base) - 1 :] or "/"
            request.scope["path"] = rest
            request.scope["raw_path"] = rest.encode()
        return await call_next(request)
