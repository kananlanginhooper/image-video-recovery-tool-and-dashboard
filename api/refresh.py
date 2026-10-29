"""Rebuild the media_browse index: run REFRESH_SQL (your catalogue's query) every REFRESH_EVERY seconds.
Same database settings as the app (app.db()). Statements are split on ';' at the end of a line."""
import os
import time
from datetime import datetime

from app import db

SQL = os.environ.get("REFRESH_SQL", "/refresh.sql")
EVERY = int(os.environ.get("REFRESH_EVERY") or 1800)

while True:
    with open(SQL, encoding="utf-8") as fh:
        # drop "--" comment lines, so a statement that follows a comment still runs
        text = "\n".join(l for l in fh.read().splitlines() if not l.lstrip().startswith("--"))
        stmts = [s.strip().rstrip(";") for s in text.split(";\n") if s.strip()]
    try:
        with db() as c, c.cursor() as cur:
            for s in stmts:
                cur.execute(s)
        print(f"refreshed {datetime.now().isoformat(timespec='seconds')}", flush=True)
    except Exception as e:
        print(f"refresh failed: {e}", flush=True)
    time.sleep(EVERY)
