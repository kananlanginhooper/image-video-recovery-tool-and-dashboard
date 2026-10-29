# Refactor to the shared template (branch `refactor/template`, 2026-10-29)

Same behavior and data, new structure and libraries (DASHBOARD-TEMPLATE "Shared stack and code structure"). The screenshots in this folder are the GitHub Pages demo (generated sample data): `before-*.jpg` on `main`, `after-*.jpg` on this branch, at 1280×800.

## Back end (`api/app/`)

- **Layout:**
  - `main.py` (create_app)
  - `core/config.py` (pydantic-settings; the only reader of the environment, with the same variable names)
  - `core/middleware.py`
  - `db/` (pooled SQLAlchemy 2.0 engines running the catalogue's SQL as written)
  - `schemas/`
  - `services/` (no HTTP objects; NotFound/BadRequest/Unsupported are mapped in main)
  - `api/routes/`
- **Every public route has a `response_model`.** `export_openapi.py` writes `api/openapi.json` from the public app only, so no plugin routes appear in it.
- **Plugins:** same seam, `register(core)` with the STATUS/NEIGHBORS/ITEM_EXTRAS hooks. `core` is now `app.plugin_api`, which adds `execute()` (writes clear the cached counts) and `media_response()`.
- **Parity check:** the old and new APIs, run side by side against the live database, returned identical JSON on 17 endpoints (public and plugin), and the same 404s.
- **Tests:** `pytest` (TestClient, database stubbed) and `ruff` (lint + format).
- **No Alembic yet:** the app owns no tables (see design/media-library-db.md).

## UI (`ui/src/app/`)

- **Layout:**
  - `core/` (runtime config, `MediaApi` service, store, data-mode for the demo, plugin seam, generated `api-types.ts` + `models.ts`)
  - `shared/` (tile, answer buttons, chip choice, pager, format helpers)
  - `features/` (browse, folders, subtypes, stats, viewer)
  - `app.routes.ts`
- **Libraries:**
  - Angular Material + CDK: tabs, form fields, selects, chips, paginator, tables, buttons, button toggles, icons, progress bars.
  - The shared theme (`src/styles/theme.scss`, unchanged copy) with this app's green accent.
  - date-fns for dates.
- **Types** are generated from the OpenAPI (`npm run gen:api`).
- **Lint:** angular-eslint (recommended + accessibility), `npm run lint` passes.
- **No graphs in this app** (Counts is a table), so there is no ECharts port.

## Intentional differences (please review)

1. **Pages have URLs** (`/browse`, `/folders`, `/subtypes`, `/stats`, plus the plugin's pages) through the Angular router. The back button and deep links work, and an empty path still opens the page you used last. Before, the page lived only in app state.
2. **Look:** Material controls on the shared theme, which follows the system light/dark setting, and Material Symbols icons in the viewer. Layout, wording, counts and order are unchanged.
3. **Keyboard access:** thumbnails, the blurred viewer image and Pro Production frames are focusable and open or reveal with Enter (and Space). Before, they were mouse-only.
4. **Pager:** Material's paginator shows "1 – 120 of 3000" with first/previous/next/last, where it used to show "page 1 of 25 · 3,000 items" with previous/next links.
5. **Demo build:** it no longer wipes `docs/refactor/` when it rebuilds `docs/`.
