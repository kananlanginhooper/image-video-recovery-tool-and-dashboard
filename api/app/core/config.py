"""Settings: the only place the environment is read. Same variable names as .env.example."""

from functools import cached_property
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]  # api/
REPO_DIR = API_DIR.parent


class Settings(BaseSettings):
    # a local run (uvicorn outside Docker) also reads the repo's .env; in Docker, compose passes the variables
    model_config = SettingsConfigDict(env_file=REPO_DIR / ".env", extra="ignore")

    # Database: DB_* settings; with DB_USER empty, a MySQL client config file instead
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_user: str = ""
    db_password: str = ""
    db_name: str = ""
    media_db_cnf: str = "~/.my.cnf"
    # connections per database: DB_POOL_SIZE kept open, up to DB_MAX_OVERFLOW more under load (MySQL max_connections is shared)
    db_pool_size: int = 5
    db_max_overflow: int = 15

    # Files: the cache for generated images, where the host's / is visible (Docker: /host), or an instance to stream from
    media_cache: str = str(REPO_DIR / "cache")
    media_files_root: str = ""
    media_files_upstream: str = ""
    media_ui_dir: str = str(REPO_DIR / "ui" / "dist" / "media" / "browser")
    media_plugin_dir: str = str(API_DIR / "private")
    # value written to decided_by when you answer a review question
    media_reviewer: str = "owner"

    # Hosting: nothing about host, port or path is compiled into the UI (DEV-STANDARD "subdomain-ready")
    ui_base_path: str = "/"
    public_url: str = ""
    frame_ancestors: str = "http://localhost:8097"  # space-separated wrapper origins allowed to frame the app
    login: str = "off"
    oidc_issuer: str = ""
    oidc_client_id: str = ""

    @cached_property
    def base_path(self) -> str:
        """UI_BASE_PATH as '/' or '/<prefix>/'"""
        b = self.ui_base_path.strip("/")
        return f"/{b}/" if b else "/"

    @cached_property
    def frame_parents(self) -> list[str]:
        return self.frame_ancestors.split()

    @cached_property
    def files_root(self) -> str:
        return self.media_files_root.rstrip("/")

    @cached_property
    def files_upstream(self) -> str:
        return self.media_files_upstream.rstrip("/")


settings = Settings()
