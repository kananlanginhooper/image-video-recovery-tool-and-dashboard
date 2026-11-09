"""The catalogue: Browse, Folders, Subtypes, Counts and one item, read from media_browse and friends."""

import json
import threading
import time
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
# Image signals (image_signals, a CPU pass over the images): Browse filters for review. name -> (label, condition on s)
SIGNALS = {
    "product": ("product photos", "s.product>=0.75"),
    "faces": ("faces", "s.faces>0"),
    "damaged": ("damaged / cut off", "(s.decode='partial' OR s.good_frac<0.9 OR s.tail_fill_frac>0.1)"),
    "transparent": ("transparent", "s.alpha_frac>0.05"),
    "blank": ("blank", "s.blank=1"),
}
TILE_COLS = "b.hash, b.grp, b.kind, b.taken, b.class, b.path"


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
    if p.get("sig") in SIGNALS:
        # checked per item while walking the date index (25-80 ms a batch); a semi-join read every match first (~1 s)
        w.append(f"EXISTS (SELECT /*+ NO_SEMIJOIN() */ 1 FROM image_signals s WHERE s.hash=b.hash AND {SIGNALS[p['sig']][1]})")
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
        "signals": {k: label for k, (label, _) in SIGNALS.items()},
        "signal_counts": signal_counts(),
    }


_signal_counts: dict = {"at": 0.0, "busy": False, "counts": {}}


def signal_counts() -> dict[str, dict[str, int]]:
    """{signal: {class: n}}, counted in the background (the count reads all of image_signals, ~5 s) and kept 6 hours;
    empty until the first count is done. health() starts it, so it is ready soon after the app starts."""
    c = _signal_counts
    if time.time() - c["at"] > 6 * 3600 and not c["busy"]:
        c["busy"] = True
        threading.Thread(target=_count_signals, daemon=True).start()
    return c["counts"]


def _count_signals() -> None:
    sums = ", ".join(f"SUM({cond}) {k}" for k, (_, cond) in SIGNALS.items())
    try:
        rows = q(f"SELECT b.class, {sums} FROM image_signals s JOIN media_browse b ON b.hash=s.hash GROUP BY b.class")
        _signal_counts["counts"] = {k: {r["class"]: int(r[k] or 0) for r in rows} for k in SIGNALS}
        _signal_counts["at"] = time.time()
    except Exception:  # no image_signals table in this database, or it's busy: try again in 10 minutes
        _signal_counts["at"] = time.time() - 6 * 3600 + 600
    finally:
        _signal_counts["busy"] = False


def cursor(r: dict) -> str:
    """Where a list stopped: "<taken>|<hash>" (taken empty when undated); passed back as ?after= for the rest."""
    return (str(r["taken"]) if r.get("taken") else "") + "|" + r["hash"]


def seek(w: str, a: list, newest_first: bool, after: str, limit: int) -> list[dict]:
    """Up to `limit` items of the list WHERE w, in Browse order, after the cursor (from the start when empty).

    Browse order is (taken, hash) with undated items as the oldest. Each step is one query that walks the (..., taken)
    indexes, instead of OFFSET (slow deep in a list) or COALESCE(taken) (no index; 0.6-1.6 s per neighbour)."""
    t, _, h = after.partition("|")
    dated, undated = "b.taken IS NOT NULL", "b.taken IS NULL"
    d = "DESC" if newest_first else "ASC"
    by_date, by_hash = f"b.taken {d}, b.hash {d}", f"b.hash {d}"
    op = "<" if newest_first else ">"
    if newest_first:  # dated, newest first, then undated
        if not h:
            steps = [(dated, [], by_date), (undated, [], by_hash)]
        elif t:
            steps = [(f"b.taken=%s AND b.hash{op}%s", [t, h], by_hash), (f"b.taken{op}%s", [t], by_date), (undated, [], by_hash)]
        else:
            steps = [(f"{undated} AND b.hash{op}%s", [h], by_hash)]
    else:  # undated first, then dated, oldest first
        if not h:
            steps = [(undated, [], by_hash), (dated, [], by_date)]
        elif t:
            steps = [(f"b.taken=%s AND b.hash{op}%s", [t, h], by_hash), (f"b.taken{op}%s", [t], by_date)]
        else:
            steps = [(f"{undated} AND b.hash{op}%s", [h], by_hash), (dated, [], by_date)]
    out: list[dict] = []
    for cond, args, order in steps:
        out += q(
            f"SELECT {TILE_COLS}, {STATUS.expr} st FROM media_browse b {STATUS.join} WHERE {w} AND {cond} ORDER BY {order} LIMIT %s",
            a + args + [limit - len(out)],
        )
        if len(out) >= limit:
            break
    return out


def browse(p: dict) -> dict:
    """120 at a time, newest first (sort=old for oldest); `next` continues the list (?after=), `ctx` is it for the viewer."""
    w, a = where_from(p)
    rows = seek(w, a, p.get("sort") != "old", p.get("after") or "", PAGE)
    cbase = f"FROM media_browse b {STATUS.join} WHERE {w}" if p.get("status") in STATUS.values else f"FROM media_browse b WHERE {w}"
    total = qc(f"SELECT COUNT(*) n {cbase}", a)[0]["n"]
    ctx = "b:" + urllib.parse.urlencode({k: v for k, v in p.items() if k != "after" and v not in (None, "", "all")})
    return {"items": [tile_json(r) for r in rows], "total": total, "next": cursor(rows[-1]) if len(rows) == PAGE else None, "ctx": ctx}


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
    newest_first = p.get("sort") != "old"
    here = cursor({"taken": cur.get("taken"), "hash": h})
    prev, nxt = seek(w, a, not newest_first, here, 1), seek(w, a, newest_first, here, 1)
    return (prev[0]["hash"] if prev else None), (nxt[0]["hash"] if nxt else None)


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
        "extras": signal_extras(h) + [x for fn in ITEM_EXTRAS for x in fn(h, r)],
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


def signal_extras(h: str) -> list[dict]:
    """The image's signals as one details line (numbers only)."""
    try:
        cols = "decode, good_frac, tail_fill_frac, blank, blank_kind, alpha_frac, product, faces"
        r = q(f"SELECT {cols} FROM image_signals WHERE hash=%s", (h,))
    except Exception:  # no image_signals table in this database
        return []
    if not r:
        return []
    s, parts = r[0], []
    if s["product"] is not None and s["product"] >= 0.5:
        parts.append(f"product photo {s['product']:.2f}")
    if s["faces"]:
        parts.append(f"{s['faces']} face" + ("s" if s["faces"] > 1 else ""))
    if s["decode"] != "ok" or (s["good_frac"] or 1) < 0.9 or (s["tail_fill_frac"] or 0) > 0.1:
        parts.append(f"decode {s['decode']}" + (f", {s['good_frac']:.0%} readable" if s["good_frac"] is not None else ""))
    if s["alpha_frac"] and s["alpha_frac"] > 0.01:
        parts.append(f"{s['alpha_frac']:.0%} transparent")
    if s["blank"]:
        parts.append(f"blank ({s['blank_kind'] or '?'})")
    return [{"label": "signals", "text": " · ".join(parts) or "nothing notable"}]


def stats() -> dict:
    return {
        "rows": qc(f"SELECT b.grp, b.class, {STATUS.expr} st, COUNT(*) n FROM media_browse b {STATUS.join} GROUP BY 1,2,3 ORDER BY 1,2,3")
    }


def health() -> dict:
    signal_counts()  # keeps the Browse signal counts fresh in the background
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
