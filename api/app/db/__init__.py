"""MySQL access: one pooled SQLAlchemy engine per database, running the catalogue's SQL as written (pymysql %s parameters).

The app owns no tables yet (its own database is a proposal in design/media-library-db.md), so there are no ORM models or
Alembic migrations here; they arrive with the first table the app owns.
"""

import os
from datetime import datetime

from sqlalchemy import URL, Engine, create_engine

from app.core.config import settings

_engines: dict[str, Engine] = {}


def engine(database: str | None = None) -> Engine:
    """The engine for `database` (default: DB_NAME, or the one named in the config file)."""
    name = database or settings.db_name or None
    key = name or ""
    if key not in _engines:
        if settings.db_user:
            url = URL.create(
                "mysql+pymysql",
                username=settings.db_user,
                password=settings.db_password,
                host=settings.db_host,
                port=settings.db_port,
                database=name,
            )
            args = {"charset": "utf8mb4"}
        else:
            url = URL.create("mysql+pymysql", database=name)
            args = {"charset": "utf8mb4", "read_default_file": os.path.expanduser(settings.media_db_cnf)}
        # one list page loads ~120 images at once, so up to 40 connections stay open; pre_ping reconnects after a database restart
        _engines[key] = create_engine(url, connect_args=args, pool_size=10, max_overflow=30, pool_pre_ping=True, pool_recycle=3600)
    return _engines[key]


def q(sql: str, args=(), database: str | None = None) -> list[dict]:
    """Rows as dicts."""
    with engine(database).connect() as c:
        return [dict(r) for r in c.exec_driver_sql(sql, tuple(args)).mappings()]


def execute(sql: str, args=(), database: str | None = None) -> int:
    """A write, committed; returns the affected row count. Clears the cached counts."""
    with engine(database).begin() as c:
        n = c.exec_driver_sql(sql, tuple(args)).rowcount
    clear_cache()
    return n


_QC: dict = {}


def qc(sql: str, args=(), ttl: int = 300) -> list[dict]:
    """Cached q() for heavy COUNT/GROUP BY queries: counts may be up to ttl seconds old. A saved answer clears it."""
    k = (sql, tuple(args))
    hit = _QC.get(k)
    if hit and hit[0] > datetime.now().timestamp():
        return hit[1]
    r = q(sql, args)
    _QC[k] = (datetime.now().timestamp() + ttl, r)
    return r


def clear_cache() -> None:
    _QC.clear()
