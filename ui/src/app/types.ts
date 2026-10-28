/** Shapes returned by app.py's /api/ routes. `st` is a plugin's per-item status ('none' without one); `hidden` items are blurred. */

export interface Tile {
  hash: string; grp: 'image' | 'video' | null; kind: string | null; taken: string | null; class: string | null;
  path: string | null; st: string; hidden: boolean;
}

export interface Meta {
  classes: string[]; page_size: number; subtypes: Record<string, string>; class_counts: Record<string, number>;
  status: { label: string; values: string[]; hidden: string[] };
}

export interface BrowsePage { items: Tile[]; total: number; page: number; pages: number; ctx: string; }

export interface FolderList { prefix: string; here: number; folders: { path: string; name: string; n: number; v: number }[]; }

export interface SubtypeItem extends Tile { conf: number; label: string | null; by_you: boolean; }
export interface SubtypePage { type: string; status: string; label: string | null; counts: Record<string, number>; items: SubtypeItem[]; }

/** a plugin's extra line in the item details; `ref` is handed back to the plugin's onExtra() when clicked */
export interface Extra { label: string; text: string; [ref: string]: unknown; }

export interface Item {
  hash: string; grp: 'image' | 'video'; kind: string; class: string; taken: string | null; taken_source: string | null;
  size: number | null; width: number | null; height: number | null; duration: number | null; folder: string;
  st: string; hidden: boolean; playable: boolean; prev: string | null; next: string | null; extras: Extra[];
  copies: { path: string; size: number | null }[]; derived: { derivation: string; path: string }[];
  ocr: { text: string; conf: number } | null;
}

export interface StatsRow { grp: string; class: string; st: string; n: number; }
