import { Injectable, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MediaApi, lsKey } from './media-api';

/** Built-in pages; plugins add theirs (plugin.ts) after Folders */
export const VIEWS = [
  { id: 'browse', label: 'Browse' }, { id: 'folders', label: 'Folders' },
  { id: 'subtypes', label: 'Review subtypes' }, { id: 'stats', label: 'Counts' },
];

/** Browse filters (same query parameters as the API) */
export type Filter = Partial<Record<'grp' | 'class' | 'status' | 'from' | 'to' | 'q' | 'folder' | 'sort', string>>;

export interface SubtypeState { type: string; status: string; label: string; sample: number; }

/** A saved answer on one card: the card dims and shows the choice; red outline if the save failed */
export interface Decision { label: string; failed?: boolean; }

export function load<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(lsKey(k)); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; }
}
export function loadStr(k: string, d: string): string {
  try { return localStorage.getItem(lsKey(k)) || d; } catch { return d; }
}
export function save(k: string, v: unknown) {
  try { localStorage.setItem(lsKey(k), typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* private window */ }
}

/**
 * App-wide view state: the current page (kept in step with the URL by App), filters, the open item, answers and revealed
 * items. Pages and filters are kept in localStorage across visits.
 */
@Injectable({ providedIn: 'root' })
export class MediaStore {
  private readonly api = inject(MediaApi);
  private readonly router = inject(Router);

  readonly view = signal<string>(loadStr('view', 'browse'));
  readonly filter = signal<Filter>(load('filter', {}));
  readonly page = signal(1);
  readonly folder = signal<string>(loadStr('folder', ''));
  readonly subtype = signal<SubtypeState>(load('subtype', { type: 'web_game_asset', status: 'match', label: '', sample: 0 }));

  /** the item open in the viewer, and the list it was opened from (the API's ctx) */
  readonly item = signal<{ hash: string; ctx: string } | null>(null);

  readonly decisions = signal<Record<string, Decision>>({});
  readonly revealed = signal<ReadonlySet<string>>(new Set());

  readonly meta = this.api.meta();

  constructor() {
    effect(() => {
      save('view', this.view()); save('filter', this.filter()); save('folder', this.folder());
      save('subtype', { ...this.subtype(), sample: 0 });
    });
    // a list that reloads shows fresh answers, so earlier "✓ Yes" marks would only mislead
    effect(() => {
      this.view(); this.filter(); this.page(); this.subtype();
      this.decisions.set({});
    });
  }

  /** open Browse with these filters (from Folders, Counts or an item's folder link) */
  browseWith(f: Filter) {
    this.filter.set(f); this.page.set(1); this.item.set(null);
    this.router.navigate(['/browse']);
  }

  isHidden(hash: string, hidden: boolean) { return hidden && !this.revealed().has(hash); }
  reveal(hash: string) { this.revealed.update(s => new Set(s).add(hash)); }

  /** POST an answer to /api/<path> in the background; the card shows it at once and turns red if the save fails */
  decide(key: string, path: string, body: Record<string, string>, label: string) {
    this.decisions.update(d => ({ ...d, [key]: { label } }));
    this.api.post(path, body).subscribe({
      error: () => this.decisions.update(d => ({ ...d, [key]: { label, failed: true } })),
    });
  }
}
