# Image & video recovery tool and dashboard

A LAN web app for a large recovered photo and video library: browse every image and video, walk the folder tree, step through items with the arrow keys, and answer the classifier's questions about screenshot subtypes. It reads a recovery catalogue in MySQL; the files themselves stay where recovery put them.

| Folder | What |
|---|---|
| `api/` | FastAPI app (`app/`: `main.py`, `core/` settings + middleware, `db/`, `schemas/`, `services/`, `api/routes/`). JSON API under `/api/`; thumbnails, viewer images and video frames made on demand with vips and ffmpeg; serves the built UI. Tests in `tests/`. |
| `ui/` | Angular 20 + Angular Material on the shared theme (`src/styles/theme.scss`). `src/app/core/` (config, API service, store, generated API types), `shared/` (small components, format helpers), `features/` (one folder per page). |

## Demo

**https://kananlanginhooper.github.io/image-video-recovery-tool-and-dashboard/** runs the real UI on a generated sample library (3,000 drawn "photos", videos, screenshots and assets) entirely in your browser, with no back end. Subtype answers you give there are kept in your browser only.

It's the `demo` build: `ui/src/app/data-mode.ts` is swapped for `data-mode.demo.ts`, which answers the `/api/` calls from `ui/src/app/demo/`. Rebuild it into `docs/` with `cd ui && npm run build:demo` (GitHub Pages serves `docs/` on `main`).

## Run it (Docker)

```bash
cp .env.example .env      # database (DB_*), port, cache folder
docker compose up -d --build
```

- **Address:** the app comes up on `http://<host>:8093/`.
- **Restarts:** the services are `restart: unless-stopped`, so they start again with Docker after a reboot.
- **Networking:** the port is published on `MEDIA_HOST:MEDIA_PORT` (the same on Linux and Docker Desktop). On a server whose containers share an external Docker network, add `compose.homelab.yml`. The app never runs a database: it connects to the MySQL at `DB_HOST`, the same one from the laptop and the server (`host.docker.internal` is the machine itself).
- **Media files:** on the machine that has them, add `compose.files.yml` (`COMPOSE_FILE=docker-compose.yml:compose.files.yml` in `.env`). The catalogue stores the host's absolute paths, so it mounts the host's `/` read-only at `/host` with `rslave` propagation. Network shares that mount later appear inside, and the app still starts while one is down; its files show as "missing".
- **Elsewhere (e.g. a laptop):** set `MEDIA_FILES_UPSTREAM` to an instance that has the files. Thumbnails, images, originals and frames are then streamed from it, Range included, while lists, details and answers stay local.
- **Access:** there is no login. Keep it on your LAN (set `MEDIA_HOST` to a LAN address).

## Hosting: any address, any parent

Nothing about hosts, ports or schemes is compiled in:
- **UI config at runtime:** the UI loads `GET /api/config` from its own back end before it starts, and calls the API on its own origin. The same build runs at `http://<ip>:8093`, under a path prefix, or at `https://media.<domain>`; only `.env` changes.
- **Path prefix:** with `UI_BASE_PATH` (e.g. `/media/`), `index.html` is sent with that `<base href>`, and requests under the prefix are routed as if at the root.
- **Framing:** responses carry `Content-Security-Policy: frame-ancestors 'self' <FRAME_ANCESTORS>`. `FRAME_ANCESTORS` lists the dashboard wrapper origins (default: the laptop wrapper, `http://localhost:8097`), so being framed by the wrapper is the normal case; other pages can't frame it.
- **Behind a reverse proxy:** uvicorn runs with `--proxy-headers`, trusting `FORWARDED_ALLOW_IPS`.
- **No cookies or shared storage:** the app sets no cookies, and its `localStorage` keys stay in its own origin.

## The catalogue it reads

| Table | Used for |
|---|---|
| `media_browse` | one row per image/video:<br>`hash` (sha256), `grp` (image/video), `kind` (jpeg, mp4, …), `class` (camera, screenshot, …), `taken`, `taken_source`, `width`, `height`, `duration`, `size`, `path` (best copy), `folder`, `n_copies`, `has_ocr`.<br>Rebuild it from your own catalogue on a schedule (the compose `refresh` profile runs your SQL). |
| `files` | every known copy:<br>`hash`, `path_text`, `size`, `removed_at` |
| `ocr_result` | OCR text (FULLTEXT index on `text`) for the Browse text search and the viewer |
| `derived_file` | e.g. HEIC → JPEG conversions, shown in the viewer and used as the viewer image |
| `screenshot_subtype` | guesses to review:<br>`hash`, `subtype`, `status` (match/borderline/no), `confidence`, `signals` JSON, `decided_by`, `reviewed_at` |

## The app's own data

The app's own database (`media_library`) is proposed in [design/media-library-db.md](design/media-library-db.md): albums, favorites, tags and captions, keyed by file hash. Nothing is created until the open questions there are answered.

## Plugins

Site-specific features live in `private/` folders, which are gitignored:

| Half | Location | How it loads |
|---|---|---|
| API | `api/private/*.py` | Loaded at start; each file's `register(core)` gets `app.py` and can:<br>· add routes<br>· set a per-item status (`STATUS`: SQL join + expression, which values are blurred until clicked)<br>· add list contexts for the viewer's previous/next (`NEIGHBORS`)<br>· add lines to the item details (`ITEM_EXTRAS`) |
| UI | `ui/src/private/plugins.ts` | Exports a `MediaPlugin[]` (`ui/src/app/plugin.ts`): extra pages, overlays, item-viewer actions. Build with `UI_CONFIG=private` (`ng build --configuration private`) to swap it in for the empty `src/app/plugins.ts`. |

## Develop

```bash
cd api && pip install -r requirements-dev.txt && uvicorn app.main:app --port 8093   # reads the repo's .env
cd api && pytest && ruff check . && ruff format --check .
cd ui && npm ci && npx ng serve --proxy-config proxy.conf.json                      # UI on :4200, /api proxied to :8093
cd ui && npm run lint
```

**API types:** after changing a schema, run `cd api && python export_openapi.py` (public app only, so no plugin routes), then `cd ui && npm run gen:api`.

## API

| Group | Routes |
|---|---|
| Config (GET) | `/api/config`: the UI's runtime config |
| Lists (GET) | `/api/meta`<br>`/api/browse?grp&class&status&from&to&q&folder&sort&page`<br>`/api/folders?prefix`<br>`/api/subtypes?type&status&label&sample`<br>`/api/stats` |
| One item (GET) | `/api/item/{hash}?ctx` (`ctx` is the list it was opened from, for previous/next) |
| Media (GET) | `/api/thumb/{hash}`<br>`/api/view/{hash}`<br>`/api/file/{hash}` (supports Range, so videos seek)<br>`/api/frame/{hash}/{seconds}` |
| Answers (POST, JSON body) | `/api/subtype/{hash}/{subtype}` `{verdict: match/no}` |
| Health | `/api/health` |
