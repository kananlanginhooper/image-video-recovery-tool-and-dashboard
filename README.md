# Image & video recovery tool and dashboard

A LAN web app for a large recovered photo and video library: browse every image and video, walk the folder tree, step through items with the arrow keys, and answer the classifier's questions about screenshot subtypes. It reads a recovery catalogue in MySQL; the files themselves stay where recovery put them.

| Folder | What |
|---|---|
| `api/` | FastAPI app (`app.py`): JSON API under `/api/`, thumbnails / viewer images / video frames made on demand with vips and ffmpeg, and it serves the built UI. |
| `ui/` | Angular 20 app (zoneless, signals): Browse, Folders, Review subtypes, Counts, and an item viewer with prefetch, keyboard and swipe stepping. |

## Run it (Docker)

```bash
cp .env.example .env      # database (DB_*), port, cache folder
docker compose up -d --build
```

- **Address:** the app comes up on `http://<host>:8093/`.
- **Restarts:** the services are `restart: unless-stopped`, so they start again with Docker after a reboot.
- **Networking:** `network_mode: host` (on Docker Desktop, add `compose.bridge.yml` to publish the port instead). The app never runs a database: it connects to the MySQL at `DB_HOST`, the same one from the laptop and the server.
- **Media files:** on the machine that has them, add `compose.files.yml` (`COMPOSE_FILE=docker-compose.yml:compose.files.yml` in `.env`). The catalogue stores the host's absolute paths, so it mounts the host's `/` read-only at `/host` with `rslave` propagation. Network shares that mount later appear inside, and the app still starts while one is down; its files show as "missing".
- **Elsewhere (e.g. a laptop):** set `MEDIA_FILES_UPSTREAM` to an instance that has the files. Thumbnails, images, originals and frames are then streamed from it, Range included, while lists, details and answers stay local.
- **Access:** there is no login. Keep it on your LAN (set `MEDIA_HOST` to a LAN address).

## The catalogue it reads

| Table | Used for |
|---|---|
| `media_browse` | one row per image/video:<br>`hash` (sha256), `grp` (image/video), `kind` (jpeg, mp4, …), `class` (camera, screenshot, …), `taken`, `taken_source`, `width`, `height`, `duration`, `size`, `path` (best copy), `folder`, `n_copies`, `has_ocr`.<br>Rebuild it from your own catalogue on a schedule (the compose `refresh` profile runs your SQL). |
| `files` | every known copy:<br>`hash`, `path_text`, `size`, `removed_at` |
| `ocr_result` | OCR text (FULLTEXT index on `text`) for the Browse text search and the viewer |
| `derived_file` | e.g. HEIC → JPEG conversions, shown in the viewer and used as the viewer image |
| `screenshot_subtype` | guesses to review:<br>`hash`, `subtype`, `status` (match/borderline/no), `confidence`, `signals` JSON, `decided_by`, `reviewed_at` |

## Plugins

Site-specific features live in `private/` folders, which are gitignored:

| Half | Location | How it loads |
|---|---|---|
| API | `api/private/*.py` | Loaded at start; each file's `register(core)` gets `app.py` and can:<br>· add routes<br>· set a per-item status (`STATUS`: SQL join + expression, which values are blurred until clicked)<br>· add list contexts for the viewer's previous/next (`NEIGHBORS`)<br>· add lines to the item details (`ITEM_EXTRAS`) |
| UI | `ui/src/private/plugins.ts` | Exports a `MediaPlugin[]` (`ui/src/app/plugin.ts`): extra pages, overlays, item-viewer actions. Build with `UI_CONFIG=private` (`ng build --configuration private`) to swap it in for the empty `src/app/plugins.ts`. |

## Develop

```bash
cd api && pip install -r requirements.txt && uvicorn app:app --port 8093   # with the DB_* settings in the environment
cd ui && npm ci && npx ng serve --proxy-config proxy.conf.json   # UI on :4200, /api proxied to :8093
```

## API

| Group | Routes |
|---|---|
| Lists (GET) | `/api/meta`<br>`/api/browse?grp&class&status&from&to&q&folder&sort&page`<br>`/api/folders?prefix`<br>`/api/subtypes?type&status&label&sample`<br>`/api/stats` |
| One item (GET) | `/api/item/{hash}?ctx` (`ctx` is the list it was opened from, for previous/next) |
| Media (GET) | `/api/thumb/{hash}`<br>`/api/view/{hash}`<br>`/api/file/{hash}` (supports Range, so videos seek)<br>`/api/frame/{hash}/{seconds}` |
| Answers (POST, JSON body) | `/api/subtype/{hash}/{subtype}` `{verdict: match/no}` |
| Health | `/api/health` |
