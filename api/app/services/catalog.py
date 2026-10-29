"""The catalogue: Browse, Folders, Subtypes, Counts and one item, read from media_browse and friends."""

import json
import urllib.parse
from datetime import datetime

from app.core.config import settings
from app.core.errors import BadRequest, NotFound
from app.db import execute, q, qc
from app.services.status import ITEM_EXTRAS, NEIGHBORS, STATUS

PAGE = 120
CLASSES = ["camera", "screenshot", "screenshot_probable", "unknown", "unclassified", "asset"]
BROWSER_IMAGE = {"jpeg", "png", "gif", "webp"}
BROWSER_VIDEO = {"mp4", "m4v", "webm", "mov"}
SUBTYPES = {"web_game_asset": "Web / game assets", "ios_messages": "iOS Messages"}
NO_DATE = "1000-01-01 00:00:00"  # undated items sort as oldest


def where_from(p: dict) -> tuple[str, list]:
    """SQL WHERE for the Browse filters (grp, class, status, folder, from, to, q)."""
    w, a = ["1=1"], []
    if p.get("grp") in ("image", "video"):
        w.append("b.grp=%s")
        a.append(p["grp"])
    if p.get("class") in CLASSES:
        w.append("b.class=%s")
        a.append(p["class"])
    if p.get("status") in STATUS.values:
        w.append(f"{STATUS.expr}=%s")
        a.append(p["status"])
    if p.get("folder"):
        w.append("(b.folder=%s OR b.folder LIKE %s)")
        a += [p["folder"], p["folder"].rstrip("/") + "/%"]
    if p.get("from"):
        w.append("b.taken>=%s")
        a.append(p["from"])
    if p.get("to"):
        w.append("b.taken<DATE_ADD(%s, INTERVAL 1 DAY)")
        a.append(p["to"])
    if p.get("q"):
        w.append("b.hash IN (SELECT hash FROM ocr_result WHERE error IS NULL AND MATCH(text) AGAINST (%s IN BOOLEAN MODE))")
        a.append(p["q"])
    return " AND ".join(w), a


def tile_json(r: dict) -> dict:
    st = r.get("st") or "none"
    return {
        "hash": r["hash"],
        "grp": r.get("grp"),
        "kind": r.get("kind"),
        "taken": r.get("taken"),
        "class": r.get("class"),
        "path": r.get("path"),
        "st": st,
        "hidden": st in STATUS.hidden,
    }


def row(h: str) -> dict:
    r = q(f"SELECT b.*, {STATUS.expr} st FROM media_browse b {STATUS.join} WHERE b.hash=%s", (h,))
    if not r:
        raise NotFound(h)
    return r[0]


def meta() -> dict:
    return {
        "classes": CLASSES,
        "page_size": PAGE,
        "subtypes": SUBTYPES,
        "status": {"label": STATUS.label, "values": STATUS.values, "hidden": list(STATUS.hidden)},
        "class_counts": {r["class"]: r["n"] for r in qc("SELECT class, COUNT(*) n FROM media_browse GROUP BY class")},
    }


def browse(p: dict) -> dict:
    """120 per page, newest first (sort=old for oldest), with the list's ctx for the viewer."""
    pg = max(1, int(p.get("page") or 1))
    order = "ASC" if p.get("sort") == "old" else "DESC"
    w, a = where_from(p)
    base = f"FROM media_browse b {STATUS.join} WHERE {w}"
    rows = q(
        f"SELECT b.hash, b.grp, b.kind, b.taken, b.class, b.path, {STATUS.expr} st {base} ORDER BY b.taken {order}, b.hash {order}"
        " LIMIT %s OFFSET %s",
        a + [PAGE, (pg - 1) * PAGE],
    )
    cbase = base if p.get("status") in STATUS.values else f"FROM media_browse b WHERE {w}"
    total = qc(f"SELECT COUNT(*) n {cbase}", a)[0]["n"]
    ctx = "b:" + urllib.parse.urlencode({k: v for k, v in p.items() if k != "page" and v not in (None, "", "all")})
    return {"items": [tile_json(r) for r in rows], "total": total, "page": pg, "pages": max(1, (total + PAGE - 1) // PAGE), "ctx": ctx}


def folders(prefix: str) -> dict:
    """One level of the folder tree under prefix."""
    prefix = prefix.rstrip("/")
    depth = prefix.count("/") + 1 if prefix else 1
    rows = q(
        "SELECT SUBSTRING_INDEX(folder,'/',%s) f, COUNT(*) n, SUM(grp='video') v FROM media_browse"
        " WHERE folder=%s OR folder LIKE %s GROUP BY f ORDER BY f",
        (depth + 1, prefix, (prefix + "/%") if prefix else "/%"),
    )
    here = q("SELECT COUNT(*) n FROM media_browse WHERE folder=%s", (prefix,))[0]["n"] if prefix else 0
    return {
        "prefix": prefix,
        "here": here,
        "folders": [
            {"path": r["f"], "name": r["f"][len(prefix) :].lstrip("/"), "n": r["n"], "v": int(r["v"] or 0)}
            for r in rows
            if r["f"] and r["f"] != prefix
        ],
    }


def browse_neighbors(ctx: str, h: str, cur: dict) -> tuple[str | None, str | None]:
    """(previous, next) in the Browse list ctx = "b:<query>" (same order as browse()); None at either end."""
    p = {k: v[0] for k, v in urllib.parse.parse_qs(ctx[2:]).items()}
    w, a = where_from(p)
    desc = p.get("sort") != "old"
    base = f"FROM media_browse b {STATUS.join} WHERE {w}"
    key = f"COALESCE(b.taken,'{NO_DATE}')"
    curkey = str(cur["taken"]) if cur.get("taken") else NO_DATE

    def step(after: bool) -> str | None:
        fwd = after == desc  # moving to smaller keys when the list is DESC and we go "after"
        op, d = ("<", "DESC") if fwd else (">", "ASC")
        r = q(f"SELECT b.hash {base} AND ({key}, b.hash) {op} (%s, %s) ORDER BY {key} {d}, b.hash {d} LIMIT 1", a + [curkey, h])
        return r[0]["hash"] if r else None

    return step(False), step(True)


def neighbors(ctx: str, h: str, cur: dict) -> tuple[str | None, str | None]:
    try:
        if ctx.startswith("b:"):
            return browse_neighbors(ctx, h, cur)
        fn = NEIGHBORS.get(ctx.split(":", 1)[0])
        if fn:
            return fn(ctx, h)
    except Exception:
        pass
    return None, None


def item(h: str, ctx: str) -> dict:
    """Everything the viewer shows for one item, plus its neighbours in the list it was opened from (ctx)."""
    r = row(h)
    prev_h, next_h = neighbors(ctx, h, r) if ctx else (None, None)
    ocr = q("SELECT text, mean_conf FROM ocr_result WHERE hash=%s AND error IS NULL ORDER BY id DESC LIMIT 1", (h,))
    return {
        "hash": h,
        "grp": r["grp"],
        "kind": r["kind"],
        "class": r["class"],
        "taken": r["taken"],
        "taken_source": r["taken_source"],
        "size": r["size"],
        "width": r["width"],
        "height": r["height"],
        "duration": r["duration"],
        "folder": r["folder"],
        "st": r["st"],
        "hidden": r["st"] in STATUS.hidden,
        "playable": r["grp"] == "image" or r["kind"] in BROWSER_VIDEO,
        "prev": prev_h,
        "next": next_h,
        "extras": [x for fn in ITEM_EXTRAS for x in fn(h, r)],
        "copies": [
            {"path": c["p"], "size": c["size"]}
            for c in q("SELECT path_text p, size FROM files WHERE hash=%s AND removed_at IS NULL ORDER BY path_text", (h,))
        ],
        "derived": [
            {"derivation": d["derivation"], "path": d["dst_path"]}
            for d in q("SELECT derivation, dst_path FROM derived_file WHERE (src_hash=%s OR dst_hash=%s) AND error IS NULL", (h, h))
        ],
        "ocr": {"text": ocr[0]["text"], "conf": ocr[0]["mean_conf"]} if ocr else None,
    }


def stats() -> dict:
    return {
        "rows": qc(f"SELECT b.grp, b.class, {STATUS.expr} st, COUNT(*) n FROM media_browse b {STATUS.join} GROUP BY 1,2,3 ORDER BY 1,2,3")
    }


def health() -> dict:
    return {"ok": True, "items": q("SELECT COUNT(*) n FROM media_browse")[0]["n"], "at": datetime.now().isoformat(timespec="seconds")}


# ---- screenshot subtypes ----


def subtypes(type: str, status: str, label: str, sample: str) -> dict:
    sub = type if type in SUBTYPES else "web_game_asset"
    st = status if status in ("match", "borderline", "no") else "match"
    lab = label if label in ("icon_sprite", "product_photo") else None
    order = "RAND()" if sample else "ss.confidence DESC, ss.hash"
    rows = q(
        "SELECT b.hash, b.grp, b.kind, b.taken, b.class, b.path, ss.confidence conf, ss.decided_by ss_by, ss.signals sig,"
        f" {STATUS.expr} st FROM screenshot_subtype ss JOIN media_browse b ON b.hash=ss.hash {STATUS.join}"
        " WHERE ss.subtype=%s AND ss.status=%s"
        + (" AND JSON_UNQUOTE(JSON_EXTRACT(ss.signals,'$.label'))=%s" if lab else "")
        + f" ORDER BY {order} LIMIT 120",
        (sub, st, lab) if lab else (sub, st),
    )
    counts = {
        r["status"]: r["n"]
        for r in qc("SELECT subtype, status, COUNT(*) n FROM screenshot_subtype GROUP BY subtype, status")
        if r["subtype"] == sub
    }
    return {
        "type": sub,
        "status": st,
        "label": lab,
        "counts": counts,
        "items": [
            {
                **tile_json(r),
                "conf": float(r["conf"]),
                "label": (json.loads(r["sig"]) if r.get("sig") else {}).get("label"),
                "by_you": r["ss_by"] == settings.media_reviewer,
            }
            for r in rows
        ],
    }


def answer_subtype(h: str, sub: str, verdict: str) -> None:
    if verdict not in ("match", "no") or sub not in SUBTYPES or len(h) != 64:
        raise BadRequest(f"{sub}/{verdict}")
    execute(
        "UPDATE screenshot_subtype SET status=%s, decided_by=%s, reviewed_at=NOW() WHERE hash=%s AND subtype=%s",
        (verdict, settings.media_reviewer, h, sub),
    )
