"""The UI's runtime config (GET /api/config): group-standard shape, DEV-STANDARD section 5."""

from pydantic import BaseModel


class Login(BaseModel):
    enabled: bool
    issuer: str
    clientId: str


class RuntimeConfig(BaseModel):
    apiBase: str
    basePath: str
    publicUrl: str
    frameParents: list[str]
    login: Login
