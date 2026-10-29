import pytest
from conftest import H


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
        "hash": H,
        "grp": "image",
        "kind": "jpeg",
        "taken": "2024-05-01T12:00:00",
        "class": "camera",
        "path": "/library/photos/IMG_0001.jpg",
        "st": "none",
        "hidden": False,
    }


def test_item(client):
    d = client.get(f"/api/item/{H}").json()
    assert (d["hash"], d["folder"], d["st"], d["hidden"], d["playable"], d["extras"]) == (H, "/library/photos", "none", False, True, [])
    assert (d["prev"], d["next"]) == (None, None)


def test_unknown_item_is_404(client):
    assert client.get("/api/item/" + "b" * 64).status_code == 404


def test_unknown_api_path_is_404(client):
    assert client.get("/api/nothing-here").status_code == 404


@pytest.mark.parametrize(
    "params",
    [{"grp": "audio"}, {"sort": "random"}, {"page": 0}, {"page": "x"}],
)
def test_bad_browse_params_are_422(client, params):
    assert client.get("/api/browse", params=params).status_code == 422


def test_subtype_answer_is_saved_as_the_reviewer(client, db):
    r = client.post(f"/api/subtype/{H}/web_game_asset", json={"verdict": "no"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    [(sql, args)] = db.writes
    assert sql.startswith("UPDATE screenshot_subtype SET status=%s, decided_by=%s")
    assert args == ("no", "owner", H, "web_game_asset")


def test_bad_subtype_answer_is_422(client, db):
    assert client.post(f"/api/subtype/{H}/web_game_asset", json={"verdict": "maybe"}).status_code == 422
    assert db.writes == []


@pytest.mark.parametrize("path", [f"/api/subtype/{H}/no_such_subtype", "/api/subtype/abc/web_game_asset"])
def test_subtype_answer_for_unknown_subtype_or_hash_is_400(client, db, path):
    assert client.post(path, json={"verdict": "match"}).status_code == 400
    assert db.writes == []


def test_public_app_has_no_status(client, db):
    m = client.get("/api/meta").json()
    assert m["status"] == {"label": "status", "values": [], "hidden": []}
    # a status filter the app doesn't offer is ignored, so no plugin SQL ends up in the query
    client.get("/api/browse", params={"status": "flagged"})
    assert not any("scan" in s for s in db.sql)


def test_plugin_status_hides_items_and_joins_its_table(plugin_client, db):
    m = plugin_client.get("/api/meta").json()
    assert m["status"] == {"label": "scan", "values": ["flagged"], "hidden": ["flagged"]}

    tile = plugin_client.get("/api/browse", params={"status": "flagged"}).json()["items"][0]
    assert (tile["st"], tile["hidden"]) == ("flagged", True)
    # the filter and the count both go through the plugin's join
    assert sum("LEFT JOIN scan s ON s.hash=b.hash" in s and "'flagged'=%s" in s for s in db.sql) == 2

    d = plugin_client.get(f"/api/item/{H}").json()
    assert (d["st"], d["hidden"]) == ("flagged", True)


def test_plugin_hooks(plugin_client):
    d = plugin_client.get(f"/api/item/{H}", params={"ctx": "r:flagged"}).json()
    assert d["extras"] == [{"label": "scan", "text": "flagged", "review": H[:8]}]
    assert (d["prev"], d["next"]) == ("p" * 64, None)
    assert plugin_client.get("/api/plugin-ping").json() == {"ok": True}


def test_plugin_hooks_are_put_back(client):
    """Runs after the plugin tests: the public app is back to no status, extras or neighbors."""
    d = client.get(f"/api/item/{H}", params={"ctx": "r:flagged"}).json()
    assert (d["st"], d["hidden"], d["extras"], d["prev"]) == ("none", False, [], None)


def test_openapi_has_response_models(client):
    spec = client.get("/openapi.json").json()
    for path in ("/api/config", "/api/meta", "/api/browse", "/api/folders", "/api/item/{h}", "/api/stats", "/api/subtypes"):
        ok = spec["paths"][path]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        assert "$ref" in ok, path
