from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services import catalog

ROW = {
    "hash": "a" * 64,
    "grp": "image",
    "kind": "jpeg",
    "taken": datetime(2024, 5, 1, 12, 0),
    "class": "camera",
    "path": "/library/photos/IMG_0001.jpg",
    "st": "none",
}


@pytest.fixture
def client(monkeypatch):
    def fake_q(sql, args=(), database=None):
        if "COUNT(*) n FROM media_browse b" in sql or "COUNT(*) n FROM media_browse WHERE" in sql:
            return [{"n": 1}]
        if sql.startswith("SELECT b.hash, b.grp"):
            return [ROW]
        return []

    monkeypatch.setattr(catalog, "q", fake_q)
    monkeypatch.setattr(catalog, "qc", fake_q)
    return TestClient(create_app())


def test_config_and_frame_policy(client):
    r = client.get("/api/config")
    assert r.status_code == 200
    assert r.json() == {
        "apiBase": "/api/",
        "basePath": "/",
        "publicUrl": "",
        "frameParents": ["http://wrapper.test:8097"],
        "login": {"enabled": False, "issuer": "", "clientId": ""},
    }
    assert r.headers["content-security-policy"] == "frame-ancestors 'self' http://wrapper.test:8097"


def test_browse_shape_and_ctx(client):
    r = client.get("/api/browse", params={"class": "camera", "page": 1})
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 1 and d["pages"] == 1 and d["ctx"] == "b:class=camera"
    assert d["items"][0] == {
        "hash": "a" * 64,
        "grp": "image",
        "kind": "jpeg",
        "taken": "2024-05-01T12:00:00",
        "class": "camera",
        "path": "/library/photos/IMG_0001.jpg",
        "st": "none",
        "hidden": False,
    }


def test_unknown_item_is_404(client):
    assert client.get("/api/item/" + "b" * 64).status_code == 404


def test_bad_subtype_answer_is_422(client):
    assert client.post(f"/api/subtype/{'a' * 64}/web_game_asset", json={"verdict": "maybe"}).status_code == 422


def test_openapi_has_response_models(client):
    spec = client.get("/openapi.json").json()
    for path in ("/api/config", "/api/meta", "/api/browse", "/api/folders", "/api/item/{h}", "/api/stats", "/api/subtypes"):
        ok = spec["paths"][path]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        assert "$ref" in ok, path
