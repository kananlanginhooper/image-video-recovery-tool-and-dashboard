"""Tests run without a database or media files: the DB helpers are replaced with canned answers."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("MEDIA_PLUGIN_DIR", "/nonexistent")  # the public app only
os.environ.setdefault("FRAME_ANCESTORS", "http://wrapper.test:8097")
os.environ.setdefault("MEDIA_UI_DIR", "/nonexistent")
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app
from app.services import catalog
from app.services.status import ITEM_EXTRAS, NEIGHBORS, STATUS

H = "a" * 64  # the one item in the fake catalogue
ROW = {
    "hash": H,
    "grp": "image",
    "kind": "jpeg",
    "taken": datetime(2024, 5, 1, 12, 0),
    "class": "camera",
    "path": "/library/photos/IMG_0001.jpg",
}
# the rest of its media_browse row, for row(h)
DETAIL = {"taken_source": "exif", "size": 1234, "width": 640, "height": 480, "duration": None, "folder": "/library/photos"}


class FakeDb:
    """Records every query in .sql and every write in .writes. The status is STATUS.expr when that is a constant
    ('none' by default, or a test plugin's value), the way MySQL would evaluate it."""

    def __init__(self):
        self.sql: list[str] = []
        self.writes: list[tuple] = []

    def q(self, sql, args=(), database=None):
        self.sql.append(sql)
        st = STATUS.expr.strip("'")
        if "COUNT(*) n FROM media_browse b" in sql or "COUNT(*) n FROM media_browse WHERE" in sql:
            return [{"n": 1}]
        if sql.startswith("SELECT b.hash, b.grp"):
            return [{**ROW, "st": st}]
        if sql.startswith("SELECT b.*") and args and args[0] == H:
            return [{**ROW, **DETAIL, "st": st}]
        return []

    def execute(self, sql, args=(), database=None):
        self.writes.append((sql, tuple(args)))
        return 1


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(catalog, "q", fake.q)
    monkeypatch.setattr(catalog, "qc", fake.q)
    monkeypatch.setattr(catalog, "execute", fake.execute)
    return fake


@pytest.fixture
def client(db):
    return TestClient(create_app())


PLUGIN = """
def register(core):
    core.STATUS.join = "LEFT JOIN scan s ON s.hash=b.hash"
    core.STATUS.expr = "'flagged'"
    core.STATUS.values = ["flagged"]
    core.STATUS.hidden = ("flagged",)
    core.STATUS.label = "scan"
    core.ITEM_EXTRAS.append(lambda h, r: [{"label": "scan", "text": "flagged", "review": h[:8]}])
    core.NEIGHBORS["r"] = lambda ctx, h: ("p" * 64, None)

    @core.app.get("/api/plugin-ping")
    def ping():
        return {"ok": True}
"""


@pytest.fixture
def plugin_client(db, monkeypatch, tmp_path):
    """The app with a test plugin loaded; the hooks it sets are put back afterwards."""
    (tmp_path / "test_plugin.py").write_text(PLUGIN, encoding="utf-8")
    monkeypatch.setattr(settings, "media_plugin_dir", str(tmp_path))
    for k in ("join", "expr", "values", "hidden", "label"):
        monkeypatch.setattr(STATUS, k, getattr(STATUS, k))
    extras, neighbors = list(ITEM_EXTRAS), dict(NEIGHBORS)
    yield TestClient(create_app())
    ITEM_EXTRAS[:] = extras
    NEIGHBORS.clear()
    NEIGHBORS.update(neighbors)
