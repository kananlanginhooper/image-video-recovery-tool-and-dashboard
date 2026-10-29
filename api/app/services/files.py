"""Media files: find a readable copy, and make thumbnails, viewer JPEGs and video frames on demand (cached)."""

import os
import subprocess
import threading
from dataclasses import dataclass

from app.core.config import settings
from app.core.errors import NotFound, Unsupported
from app.db import q
from app.services.catalog import BROWSER_IMAGE, row

gen_lock = threading.Semaphore(3)  # at most 3 vips/ffmpeg runs at once


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
    """Run vips/ffmpeg into tmp at low priority, then move it into place."""
    with gen_lock:
        ok = subprocess.run(["nice", "-n", "19", *cmd], capture_output=True, timeout=timeout).returncode == 0 and os.path.exists(tmp)
        if ok:
            os.replace(tmp, out)
    return ok


def thumb(h: str) -> Media:
    """320 px JPEG: vips for images, a frame at 10% for videos."""
    out = cached(h, ".t.jpg")
    if not os.path.exists(out):
        r = row(h)
        try:
            src = live_path(h, r["path"])
        except NotFound:
            return Media(placeholder="missing")
        tmp = out + ".part.jpg"
        if r["grp"] == "image":
            cmd = ["vips", "thumbnail", src, tmp, "320", "--size", "down"]
        else:
            t = max(0.0, (r["duration"] or 10) * 0.1)
            cmd = [
                "ffmpeg",
                "-v",
                "error",
                "-threads",
                "1",
                "-ss",
                f"{t:.1f}",
                "-i",
                src,
                "-frames:v",
                "1",
                "-vf",
                "scale=320:-2",
                "-y",
                tmp,
            ]
        if not _run(cmd, tmp, out, 120):
            return Media(placeholder="no preview")
    return Media(path=out, media_type="image/jpeg", cache=True)


def view(h: str) -> Media:
    """The image for the viewer: the file itself when a browser can show it, else a converted JPEG (2400 px)."""
    r = row(h)
    if r["kind"] in BROWSER_IMAGE:
        return Media(path=live_path(h, r["path"]))
    d = q("SELECT dst_path FROM derived_file WHERE src_hash=%s AND derivation='heic-to-jpeg' AND error IS NULL", (h,))
    if d and os.path.isfile(host_path(d[0]["dst_path"])):
        return Media(path=host_path(d[0]["dst_path"]), media_type="image/jpeg")
    out = cached(h, ".v.jpg")
    if not os.path.exists(out):
        tmp = out + ".part.jpg"
        if not _run(["vips", "thumbnail", live_path(h, r["path"]), tmp, "2400", "--size", "down"], tmp, out, 180):
            raise Unsupported("can't convert this image")
    return Media(path=out, media_type="image/jpeg")


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
