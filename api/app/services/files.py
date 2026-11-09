"""Media files: find a readable copy, and make thumbnails, viewer JPEGs and video frames on demand (cached)."""

import os
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from app.core.config import settings
from app.core.errors import NotFound, Unsupported
from app.db import q
from app.services.catalog import BROWSER_IMAGE, row

# A Browse page asks for 120 thumbnails at once and each new one takes ~0.1-0.2 s of vips; 3 at a time queued a page
# for ~2 s. Now 8 at a time, and a list's thumbnails are made ahead (warm) while the browser is still asking.
gen_lock = threading.Semaphore(8)
_warm = ThreadPoolExecutor(max_workers=6, thread_name_prefix="warm")
_making: dict[str, threading.Lock] = {}  # one maker per output file; a second asker waits for it
_making_lock = threading.Lock()


@dataclass
class Media:
    """What a media route sends: a file on disk, or a placeholder drawing when there's nothing to show."""

    path: str | None = None
    media_type: str | None = None
    filename: str | None = None  # set for downloads (the original)
    cache: bool = False  # generated images can be cached by the browser for a day
    placeholder: str | None = None  # text drawn on a grey square instead


def host_path(p: str) -> str:
    """Catalogue paths are the host's absolute paths; in Docker the host's / is mounted read-only at MEDIA_FILES_ROOT."""
    root = settings.files_root
    return root + p if root and p and p.startswith("/") else p


def live_path(h: str, preferred: str | None) -> str:
    """A readable copy of h (preferred path first), as a path this process can open."""
    if preferred and os.path.isfile(host_path(preferred)):
        return host_path(preferred)
    for r in q("SELECT path_text p FROM files WHERE hash=%s AND removed_at IS NULL", (h,)):
        if os.path.isfile(host_path(r["p"])):
            return host_path(r["p"])
    raise NotFound("no readable copy")


def cached(h: str, suffix: str) -> str:
    d = os.path.join(settings.media_cache, h[:2])
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, h + suffix)


def _run(cmd: list[str], tmp: str, out: str, timeout: int) -> bool:
    """Run vips/ffmpeg into tmp at lowered priority, then move it into place."""
    with gen_lock:
        ok = subprocess.run(["nice", "-n", "10", *cmd], capture_output=True, timeout=timeout).returncode == 0 and os.path.exists(tmp)
        if ok:
            os.replace(tmp, out)
    return ok


def _lock_for(out: str) -> threading.Lock:
    with _making_lock:
        return _making.setdefault(out, threading.Lock())


def _done(out: str) -> None:
    with _making_lock:
        _making.pop(out, None)


def thumb(h: str) -> Media:
    """320 px thumbnail: WebP for images (keeps transparency; JPEG turned it black), a JPEG frame at 10% for videos."""
    out = cached(h, ".t.webp")
    if os.path.exists(out):
        return Media(path=out, media_type="image/webp", cache=True)
    r = row(h)
    if r["grp"] != "image":
        out = cached(h, ".t.jpg")
        if os.path.exists(out):
            return Media(path=out, media_type="image/jpeg", cache=True)
    try:
        src = live_path(h, r["path"])
    except NotFound:
        return Media(placeholder="missing")
    if r["grp"] != "image":
        t = max(0.0, (r["duration"] or 10) * 0.1)
        cmd = ["ffmpeg", "-v", "error", "-threads", "1", "-ss", f"{t:.1f}", "-i", src, "-frames:v", "1", "-vf", "scale=320:-2", "-y"]
    else:
        cmd = ["vips", "thumbnail", src, "{tmp}[Q=80]", "320", "--size", "down"]
    with _lock_for(out):
        try:
            if not os.path.exists(out):
                tmp = f"{out}.{threading.get_ident()}.part{os.path.splitext(out)[1]}"
                cmd = [c.replace("{tmp}", tmp) for c in cmd] + ([] if r["grp"] == "image" else [tmp])
                if not _run(cmd, tmp, out, 120):
                    return Media(placeholder="no preview")
        finally:
            _done(out)
    return Media(path=out, media_type="image/webp" if out.endswith(".webp") else "image/jpeg", cache=True)


def warm(hashes: list[str]) -> None:
    """Make these thumbnails in the background (a list just sent to the browser), so its requests find them ready."""
    for h in hashes:
        if not os.path.exists(cached(h, ".t.webp")):
            _warm.submit(_quiet_thumb, h)


def _quiet_thumb(h: str) -> None:
    try:
        thumb(h)
    except Exception:
        pass


def view(h: str) -> Media:
    """The image for the viewer: the file itself when a browser can show it, else a converted WebP (2400 px)."""
    r = row(h)
    if r["kind"] in BROWSER_IMAGE:
        return Media(path=live_path(h, r["path"]))
    d = q("SELECT dst_path FROM derived_file WHERE src_hash=%s AND derivation='heic-to-jpeg' AND error IS NULL", (h,))
    if d and os.path.isfile(host_path(d[0]["dst_path"])):
        return Media(path=host_path(d[0]["dst_path"]), media_type="image/jpeg")
    out = cached(h, ".v.webp")  # WebP keeps any transparency
    if not os.path.exists(out):
        tmp = f"{out}.{threading.get_ident()}.part.webp"
        if not _run(["vips", "thumbnail", live_path(h, r["path"]), tmp + "[Q=90]", "2400", "--size", "down"], tmp, out, 180):
            raise Unsupported("can't convert this image")
    return Media(path=out, media_type="image/webp")


def original(h: str) -> Media:
    p = live_path(h, row(h)["path"])
    return Media(path=p, filename=os.path.basename(p))


def video_frame(h: str, t: int, path_hint: str | None = None) -> Media:
    """JPEG of video h at t seconds (480 px wide), cached; a placeholder when the file or the frame can't be read."""
    out = cached(h, f".f{t}.jpg")
    if not os.path.exists(out):
        b = q("SELECT path FROM media_browse WHERE hash=%s", (h,))
        try:
            path = live_path(h, path_hint or (b and b[0]["path"]) or None)
        except NotFound:
            return Media(placeholder="missing")
        tmp = out + ".part.jpg"
        if not _run(
            ["ffmpeg", "-v", "error", "-threads", "1", "-ss", str(t), "-i", path, "-frames:v", "1", "-vf", "scale=480:-2", "-y", tmp],
            tmp,
            out,
            120,
        ):
            return Media(placeholder="no frame")
    return Media(path=out, media_type="image/jpeg", cache=True)
