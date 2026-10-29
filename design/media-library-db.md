# The app's own database: `media_library` (proposal, nothing created)

**Status:** this is a proposal. The database exists, empty, and no tables are created until the open questions below are answered.

The app reads its catalogue from another database (`media_browse`, `files`, `ocr_result`, … in the recovery catalogue) and writes review answers back there, because the catalogue's scanners and offsite jobs read those answers. Data the app **creates itself** goes in its own database, `media_library` (MySQL 8.4, same server, so it can join the catalogue by `hash`).

## Rules

- **Keyed by the file's sha256 `hash`**, the catalogue's key, so a row follows the file across copies and moves and survives `media_browse` rebuilds.
- **Answers to the catalogue's own questions stay in the catalogue.** Subtype answers, and verdicts from any review plugin, are read by the catalogue's own jobs (scanners skip rows marked as decided by you; offsite jobs exclude private items). This database is for data only the app uses.
- **No copies of catalogue columns.** Join to `media_browse`/`files` for path, date or kind.
- **Migrations:** numbered SQL files in `api/migrations/` (`001_init.sql`, …) and a `schema_version` table. They run once, from one place (DEV-STANDARD section 3), never automatically on app start.

## First tables (proposed)

```sql
CREATE TABLE schema_version (version INT NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Albums: hand-made collections ("Best of 2019", "For the photo book")
CREATE TABLE album (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  notes       TEXT,
  cover_hash  CHAR(64),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE album_item (
  album_id  INT NOT NULL,
  hash      CHAR(64) NOT NULL,
  position  INT NOT NULL DEFAULT 0,
  added_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (album_id, hash),
  KEY hash (hash),
  FOREIGN KEY (album_id) REFERENCES album(id) ON DELETE CASCADE
);

-- Per-item marks: favorite, hidden from Browse, a free-text caption
CREATE TABLE item_mark (
  hash        CHAR(64) NOT NULL PRIMARY KEY,
  favorite    TINYINT NOT NULL DEFAULT 0,
  hidden      TINYINT NOT NULL DEFAULT 0,
  caption     TEXT,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Your own tags (separate from any machine-made tags in the catalogue)
CREATE TABLE tag (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE);
CREATE TABLE item_tag (
  hash    CHAR(64) NOT NULL,
  tag_id  INT NOT NULL,
  PRIMARY KEY (hash, tag_id),
  KEY tag (tag_id),
  FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE
);
```

**What the app would add:**
- **UI:** Albums and Favorites pages, a tag/caption box in the item viewer, and a "hide" action.
- **API:** `/api/albums…`, `/api/marks/{hash}`, `/api/tags…`.
- **Browse:** filters joining these tables (`favorite=1`, `tag=…`, `album=…`).

When login arrives (OIDC, one IdP for every app), each table gets an `owner` column (the IdP `sub`) if more than one person uses it. Until then it's single-user.

## Open questions (for the owner)

1. **What should the app collect first?** Albums, favorites, tags, captions, or something else, such as "people" groupings, an event timeline, or a list of items to delete or keep?
2. **Is "hidden" a soft hide in this app only?** Or should it also feed the catalogue's cleanup or offsite decisions? If so, it belongs in the catalogue as a reviewed answer, not here.
3. **Deleting files:** if the app should ever delete or quarantine files, that's a catalogue action with its own audit table, designed separately.
4. **Engine:** MySQL is proposed, for the joins with the catalogue by hash. Postgres would need the catalogue reads to stay separate queries.
