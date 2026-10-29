"""The UI's runtime config."""

from fastapi import APIRouter

from app.core.config import settings
from app.schemas.config import Login, RuntimeConfig

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config", response_model=RuntimeConfig)
def runtime_config():
    """Loaded by the UI before it starts: nothing about hosts, ports or paths is compiled into it."""
    return RuntimeConfig(
        apiBase=settings.base_path + "api/",
        basePath=settings.base_path,
        publicUrl=settings.public_url,
        frameParents=settings.frame_parents,
        login=Login(enabled=settings.login == "on", issuer=settings.oidc_issuer, clientId=settings.oidc_client_id),
    )
