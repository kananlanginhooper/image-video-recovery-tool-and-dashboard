"""Media library API + UI host.

JSON API under /api/ for the Angular UI in ../ui, plus thumbnails, viewer images, originals and video frames.
Everything else serves the built UI (ui/dist/media/browser) as a single-page app.

Reads a recovery catalogue in MySQL: media_browse (one row per image/video, see README), files (every known copy),
ocr_result, derived_file and screenshot_subtype. Subtype answers are written back to screenshot_subtype.

Plugins: every *.py in MEDIA_PLUGIN_DIR (default ./private, not in git) is loaded at start and its register(core) called
with this module. A plugin can add routes, a per-item status (STATUS), list contexts for the viewer's previous/next
(NEIGHBORS) and lines in the item details (ITEM_EXTRAS).
"""
import glob
import importlib.util
import json
import os
import subprocess
import sys
import threading
import urllib.parse
from datetime import datetime

import pymysql
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response

HERE = os.path.dirname(os.path.abspath(__file__))
CNF = os.path.expanduser(os.environ.get("MEDIA_DB_CNF", "~/.my.cnf"))
DB_NAME = os.environ.get("MEDIA_DB_NAME") or None   # None: the database named in the config file
CACHE = os.environ.get("MEDIA_CACHE", os.path.join(HERE, "..", "cache"))
# where the host's / is visible ("/host" in Docker); empty when the app runs directly on the host
FILES_ROOT = os.environ.get("MEDIA_FILES_ROOT", "").rstrip("/")
UI_DIR = os.path.abspath(os.environ.get("MEDIA_UI_DIR", os.path.join(HERE, "..", "ui", "dist", "media", "browser")))
PLUGIN_DIR = os.environ.get("MEDIA_PLUGIN_DIR", os.path.join(HERE, "private"))
# value written to decided_by when you answer a review question
REVIEWER = os.environ.get("MEDIA_REVIEWER", "owner")
PAGE = 120
CLASSES = ["camera", "screenshot", "screenshot_probable", "unknown", "unclassified", "asset"]
BROWSER_IMAGE = {"jpeg", "png", "gif", "webp"}
BROWSER_VIDEO = {"mp4", "m4v", "webm", "mov"}
SUBTYPES = {"web_game_asset": "Web / game assets", "ios_messages": "iOS Messages"}
gen_lock = threading.Semaphore(3)


class STATUS:
    """Optional per-item status from a plugin (e.g. a content scan). Off by default: every item is 'none', nothing hidden."""
    join = ""            # SQL joined to media_browse b, e.g. "LEFT JOIN scan s ON s.hash=b.hash"
    expr = "'none'"      # SQL for the status of b
    values = []          # statuses offered as a Browse filter
    hidden = ()          # statuses blurred until clicked
    label = "status"


NEIGHBORS = {}     # ctx prefix -> fn(ctx, hash) -> (prev, next): previous/next for lists a plugin owns
ITEM_EXTRAS = []   # fn(hash, row) -> [{"label": ..., "text": ...}]: extra lines in the item details

app = FastAPI()


def db(database=None):
    kw = {"database": database or DB_NAME} if (database or DB_NAME) else {}
    return pymysql.connect(read_default_file=CNF, charset="utf8mb4", autocommit=True, cursorclass=pymysql.cursors.DictCursor, **kw)


def q(sql, args=(), database=None):
    with db(database) as c, c.cursor() as cur:
        cur.execute(sql, args)
        return cur.fetchall()


_QC = {}


def qc(sql, args=(), ttl=300):
    """Cached q() for heavy COUNT/GROUP BY queries: counts may be up to ttl seconds old. A saved answer clears it."""
    k = (sql, tuple(args))
    hit = _QC.get(k)
    if hit and hit[0] > datetime.now().timestamp():
        return hit[1]
    r = q(sql, args)
    _QC[k] = (datetime.now().timestamp() + ttl, r)
    return r


def where_from(p):
    w, a = ["1=1"], []
    if p.get("grp") in ("image", "video"):
        w.append("b.grp=%s"); a.append(p["grp"])
    if p.get("class") in CLASSES:
        w.append("b.class=%s"); a.append(p["class"])
    if p.get("status") in STATUS.values:
        w.append(f"{STATUS.expr}=%s"); a.append(p["status"])
    if p.get("folder"):
        w.append("(b.folder=%s OR b.folder LIKE %s)"); a += [p["folder"], p["folder"].rstrip("/") + "/%"]
    if p.get("from"):
        w.append("b.taken>=%s"); a.append(p["from"])
    if p.get("to"):
        w.append("b.taken<DATE_ADD(%s, INTERVAL 1 DAY)"); a.append(p["to"])
    if p.get("q"):
        w.append("b.hash IN (SELECT hash FROM ocr_result WHERE error IS NULL AND MATCH(text) AGAINST (%s IN BOOLEAN MODE))")
        a.append(p["q"])
    return " AND ".join(w), a


def tile_json(r):
    st = r.get("st") or "none"
    return {"hash": r["hash"], "grp": r.get("grp"), "kind": r.get("kind"), "taken": r.get("taken"), "class": r.get("class"),
            "path": r.get("path"), "st": st, "hidden": st in STATUS.hidden}


def row(h):
    r = q(f"SELECT b.*, {STATUS.expr} st FROM media_browse b {STATUS.join} WHERE b.hash=%s", (h,))
    if not r:
        raise HTTPException(404)
    return r[0]


def host_path(p):
    """Catalogue paths are the host's absolute paths; in Docker the host's / is mounted read-only at FILES_ROOT."""
    return FILES_ROOT + p if FILES_ROOT and p and p.startswith("/") else p


def live_path(h, preferred):
    """A readable copy of h (preferred path first), as a path this process can open."""
    if preferred and os.path.isfile(host_path(preferred)):
        return host_path(preferred)
    for r in q("SELECT path_text p FROM files WHERE hash=%s AND removed_at IS NULL", (h,)):
        if os.path.isfile(host_path(r["p"])):
            return host_path(r["p"])
    raise HTTPException(404, "no readable copy")


def browse_neighbors(ctx, h, cur):
    """(previous, next) in the Browse list ctx = "b:<query>" (same order as /api/browse); None at either end."""
    p = {k: v[0] for k, v in urllib.parse.parse_qs(ctx[2:]).items()}
    w, a = where_from(p)
    desc = p.get("sort") != "old"
    base = f"FROM media_browse b {STATUS.join} WHERE {w}"
    key = "COALESCE(b.taken,'1000-01-01 00:00:00')"
    curkey = str(cur["taken"]) if cur.get("taken") else "1000-01-01 00:00:00"
    def step(after):
        fwd = after == desc  # moving to smaller keys when the list is DESC and we go "after"
        op, d = ("<", "DESC") if fwd else (">", "ASC")
        r = q(f"SELECT b.hash {base} AND ({key}, b.hash) {op} (%s, %s) ORDER BY {key} {d}, b.hash {d} LIMIT 1", a + [curkey, h])
        return r[0]["hash"] if r else None
    return step(False), step(True)


def neighbors(ctx, h, cur):
    try:
        if ctx.startswith("b:"):
            return browse_neighbors(ctx, h, cur)
        fn = NEIGHBORS.get(ctx.split(":", 1)[0])
        if fn:
            return fn(ctx, h)
    except Exception:
        pass
    return None, None


# ---- lists ----

@app.get("/api/meta")
def api_meta():
    return {"classes": CLASSES, "page_size": PAGE, "subtypes": SUBTYPES,
            "status": {"label": STATUS.label, "values": STATUS.values, "hidden": list(STATUS.hidden)},
            "class_counts": {r["class"]: r["n"] for r in qc("SELECT class, COUNT(*) n FROM media_browse GROUP BY class")}}


@app.get("/api/browse")
def api_browse(request: Request):
    p = dict(request.query_params)
    pg = max(1, int(p.get("page") or 1))
    order = "ASC" if p.get("sort") == "old" else "DESC"
    w, a = where_from(p)
    base = f"FROM media_browse b {STATUS.join} WHERE {w}"
    rows = q(f"SELECT b.hash, b.grp, b.kind, b.taken, b.class, b.path, {STATUS.expr} st {base} ORDER BY b.taken {order}, b.hash {order}"
             " LIMIT %s OFFSET %s", a + [PAGE, (pg - 1) * PAGE])
    cbase = base if p.get("status") in STATUS.values else f"FROM media_browse b WHERE {w}"
    total = qc(f"SELECT COUNT(*) n {cbase}", a)[0]["n"]
    ctx = "b:" + urllib.parse.urlencode({k: v for k, v in p.items() if k != "page" and v not in ("", "all")})
    return {"items": [tile_json(r) for r in rows], "total": total, "page": pg, "pages": max(1, (total + PAGE - 1) // PAGE), "ctx": ctx}


@app.get("/api/folders")
def api_folders(prefix: str = ""):
    prefix = prefix.rstrip("/")
    depth = prefix.count("/") + 1 if prefix else 1
    rows = q("SELECT SUBSTRING_INDEX(folder,'/',%s) f, COUNT(*) n, SUM(grp='video') v FROM media_browse"
             " WHERE folder=%s OR folder LIKE %s GROUP BY f ORDER BY f",
             (depth + 1, prefix, (prefix + "/%") if prefix else "/%"))
    here = q("SELECT COUNT(*) n FROM media_browse WHERE folder=%s", (prefix,))[0]["n"] if prefix else 0
    return {"prefix": prefix, "here": here,
            "folders": [{"path": r["f"], "name": r["f"][len(prefix):].lstrip("/"), "n": r["n"], "v": int(r["v"] or 0)}
                        for r in rows if r["f"] and r["f"] != prefix]}


@app.get("/api/subtypes")
def api_subtypes(type: str = "web_game_asset", status: str = "match", label: str = "", sample: str = ""):
    sub = type if type in SUBTYPES else "web_game_asset"
    st = status if status in ("match", "borderline", "no") else "match"
    lab = label if label in ("icon_sprite", "product_photo") else None
    order = "RAND()" if sample else "ss.confidence DESC, ss.hash"
    rows = q("SELECT b.hash, b.grp, b.kind, b.taken, b.class, b.path, ss.confidence conf, ss.decided_by ss_by, ss.signals sig,"
             f" {STATUS.expr} st FROM screenshot_subtype ss JOIN media_browse b ON b.hash=ss.hash {STATUS.join}"
             " WHERE ss.subtype=%s AND ss.status=%s" + (" AND JSON_UNQUOTE(JSON_EXTRACT(ss.signals,'$.label'))=%s" if lab else "") +
             f" ORDER BY {order} LIMIT 120", (sub, st, lab) if lab else (sub, st))
    counts = {r["status"]: r["n"] for r in qc("SELECT subtype, status, COUNT(*) n FROM screenshot_subtype GROUP BY subtype, status") if r["subtype"] == sub}
    return {"type": sub, "status": st, "label": lab, "counts": counts,
            "items": [{**tile_json(r), "conf": float(r["conf"]), "label": (json.loads(r["sig"]) if r.get("sig") else {}).get("label"),
                       "by_you": r["ss_by"] == REVIEWER} for r in rows]}


@app.get("/api/item/{h}")
def api_item(h: str, ctx: str = ""):
    """Everything the viewer shows for one item, plus its neighbours in the list it was opened from (ctx)."""
    r = row(h)
    prev_h, next_h = neighbors(ctx, h, r) if ctx else (None, None)
    ocr = q("SELECT text, mean_conf FROM ocr_result WHERE hash=%s AND error IS NULL ORDER BY id DESC LIMIT 1", (h,))
    extras = [x for fn in ITEM_EXTRAS for x in fn(h, r)]
    return {"hash": h, "grp": r["grp"], "kind": r["kind"], "class": r["class"], "taken": r["taken"], "taken_source": r["taken_source"],
            "size": r["size"], "width": r["width"], "height": r["height"], "duration": r["duration"], "folder": r["folder"],
            "st": r["st"], "hidden": r["st"] in STATUS.hidden, "playable": r["grp"] == "image" or r["kind"] in BROWSER_VIDEO,
            "prev": prev_h, "next": next_h, "extras": extras,
            "copies": [{"path": c["p"], "size": c["size"]} for c in
                       q("SELECT path_text p, size FROM files WHERE hash=%s AND removed_at IS NULL ORDER BY path_text", (h,))],
            "derived": [{"derivation": d["derivation"], "path": d["dst_path"]} for d in
                        q("SELECT derivation, dst_path FROM derived_file WHERE (src_hash=%s OR dst_hash=%s) AND error IS NULL", (h, h))],
            "ocr": {"text": ocr[0]["text"], "conf": ocr[0]["mean_conf"]} if ocr else None}


@app.get("/api/stats")
def api_stats():
    return {"rows": qc(f"SELECT b.grp, b.class, {STATUS.expr} st, COUNT(*) n FROM media_browse b {STATUS.join}"
                       " GROUP BY 1,2,3 ORDER BY 1,2,3")}


@app.get("/api/health")
def health():
    return {"ok": True, "items": q("SELECT COUNT(*) n FROM media_browse")[0]["n"], "at": datetime.now().isoformat(timespec="seconds")}


@app.post("/api/subtype/{h}/{sub}")
async def api_set_subtype(h: str, sub: str, request: Request):
    verdict = (await request.json()).get("verdict")
    if verdict not in ("match", "no") or sub not in SUBTYPES or len(h) != 64:
        raise HTTPException(400)
    with db() as c, c.cursor() as cur:
        cur.execute("UPDATE screenshot_subtype SET status=%s, decided_by=%s, reviewed_at=NOW() WHERE hash=%s AND subtype=%s",
                    (verdict, REVIEWER, h, sub))
    _QC.clear()
    return {"ok": True}


# ---- media: thumbnails, viewer images, originals, video frames (generated on demand, cached in CACHE) ----

def cached(h, suffix):
    d = os.path.join(CACHE, h[:2])
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, h + suffix)


PLACEHOLDER = ("<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320'><rect width='100%' height='100%' fill='#8883'/>"
               "<text x='50%' y='50%' fill='#888' font-family='sans-serif' font-size='22' text-anchor='middle'>{}</text></svg>")


@app.get("/api/thumb/{h}")
def thumb(h: str):
    out = cached(h, ".t.jpg")
    if not os.path.exists(out):
        r = row(h)
        try:
            src = live_path(h, r["path"])
        except HTTPException:
            return Response(PLACEHOLDER.format("missing"), media_type="image/svg+xml")
        with gen_lock:
            tmp = out + ".part.jpg"
            if r["grp"] == "image":
                cmd = ["nice", "-n", "19", "vips", "thumbnail", src, tmp, "320", "--size", "down"]
            else:
                t = max(0.0, (r["duration"] or 10) * 0.1)
                cmd = ["nice", "-n", "19", "ffmpeg", "-v", "error", "-threads", "1", "-ss", f"{t:.1f}", "-i", src,
                       "-frames:v", "1", "-vf", "scale=320:-2", "-y", tmp]
            ok = subprocess.run(cmd, capture_output=True, timeout=120).returncode == 0 and os.path.exists(tmp)
            if not ok:
                return Response(PLACEHOLDER.format("no preview"), media_type="image/svg+xml")
            os.replace(tmp, out)
    return FileResponse(out, media_type="image/jpeg", headers={"Cache-Control": "max-age=86400"})


@app.get("/api/view/{h}")
def view(h: str):
    r = row(h)
    if r["kind"] in BROWSER_IMAGE:
        return FileResponse(live_path(h, r["path"]))
    d = q("SELECT dst_path FROM derived_file WHERE src_hash=%s AND derivation='heic-to-jpeg' AND error IS NULL", (h,))
    if d and os.path.isfile(host_path(d[0]["dst_path"])):
        return FileResponse(host_path(d[0]["dst_path"]), media_type="image/jpeg")
    out = cached(h, ".v.jpg")
    if not os.path.exists(out):
        with gen_lock:
            tmp = out + ".part.jpg"
            if subprocess.run(["nice", "-n", "19", "vips", "thumbnail", live_path(h, r["path"]), tmp, "2400", "--size", "down"],
                              capture_output=True, timeout=180).returncode != 0:
                raise HTTPException(415, "can't convert this image")
            os.replace(tmp, out)
    return FileResponse(out, media_type="image/jpeg")


@app.get("/api/file/{h}")
def original(h: str):
    r = row(h)
    p = live_path(h, r["path"])
    return FileResponse(p, filename=os.path.basename(p))


def video_frame(h, t, path_hint=None):
    """JPEG of video h at t seconds (480 px wide), cached; a placeholder when the file or the frame can't be read."""
    out = cached(h, f".f{t}.jpg")
    if not os.path.exists(out):
        b = q("SELECT path FROM media_browse WHERE hash=%s", (h,))
        try:
            path = live_path(h, path_hint or (b and b[0]["path"]) or None)
        except HTTPException:
            return Response(PLACEHOLDER.format("missing"), media_type="image/svg+xml")
        with gen_lock:
            tmp = out + ".part.jpg"
            if subprocess.run(["nice", "-n", "19", "ffmpeg", "-v", "error", "-threads", "1", "-ss", str(t), "-i", path,
                               "-frames:v", "1", "-vf", "scale=480:-2", "-y", tmp], capture_output=True, timeout=120).returncode != 0 \
                    or not os.path.exists(tmp):
                return Response(PLACEHOLDER.format("no frame"), media_type="image/svg+xml")
            os.replace(tmp, out)
    return FileResponse(out, media_type="image/jpeg", headers={"Cache-Control": "max-age=86400"})


@app.get("/api/frame/{h}/{t}")
def frame(h: str, t: int):
    return video_frame(h, t)


# ---- plugins (before the UI route, so their /api/ routes win) ----

for _f in sorted(glob.glob(os.path.join(PLUGIN_DIR, "*.py"))):
    _spec = importlib.util.spec_from_file_location("media_plugin_" + os.path.basename(_f)[:-3], _f)
    _mod = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(_mod)
    _mod.register(sys.modules[__name__])
    print(f"plugin loaded: {os.path.basename(_f)}", flush=True)


# ---- the Angular UI (registered last, so /api/ wins) ----

@app.get("/{path:path}")
def ui(path: str):
    """Built files as they are (hashed names cached for good); anything else is the single-page app's index.html."""
    if path.startswith("api/"):
        raise HTTPException(404)
    f = os.path.normpath(os.path.join(UI_DIR, path))
    if path and f.startswith(UI_DIR + os.sep) and os.path.isfile(f):
        return FileResponse(f, headers={"Cache-Control": "public, max-age=31536000, immutable"})
    index = os.path.join(UI_DIR, "index.html")
    if not os.path.isfile(index):
        raise HTTPException(503, "UI not built (ui/dist/media/browser)")
    return FileResponse(index, headers={"Cache-Control": "no-store"})
