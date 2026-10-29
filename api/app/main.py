"""Media library API + UI host. create_app(): routers, middleware, plugins, then the static UI last."""

import glob
import importlib.util
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import plugin_api
from app.api.routes import catalog, config, media, subtypes, ui
from app.core.config import settings
from app.core.errors import BadRequest, NotFound, Unsupported
from app.core.middleware import add_middleware


def load_plugins(app: FastAPI) -> None:
    """Every *.py in MEDIA_PLUGIN_DIR gets register(core) with core = app.plugin_api (before the UI route, so its routes win)."""
    plugin_api.app = app
    for f in sorted(glob.glob(os.path.join(settings.media_plugin_dir, "*.py"))):
        spec = importlib.util.spec_from_file_location("media_plugin_" + os.path.basename(f)[:-3], f)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        mod.register(plugin_api)
        print(f"plugin loaded: {os.path.basename(f)}", flush=True)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Media library",
        version="1.0",
        description="Browse a recovered photo and video library and answer the classifier's questions about it.",
    )

    @app.exception_handler(NotFound)
    async def not_found(_: Request, e: NotFound):
        return JSONResponse({"detail": str(e) or "not found"}, status_code=404)

    @app.exception_handler(BadRequest)
    async def bad_request(_: Request, e: BadRequest):
        return JSONResponse({"detail": str(e) or "bad request"}, status_code=400)

    @app.exception_handler(Unsupported)
    async def unsupported(_: Request, e: Unsupported):
        return JSONResponse({"detail": str(e)}, status_code=415)

    for r in (config.router, catalog.router, subtypes.router, media.router):
        app.include_router(r)
    load_plugins(app)
    app.include_router(ui.router)
    add_middleware(app)
    return app


app = create_app()
