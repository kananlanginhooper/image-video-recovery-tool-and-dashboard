import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Params, Router } from '@angular/router';
import { MediaApi, lsKey } from './media-api';

/** Built-in pages; plugins add theirs (plugin.ts) after Folders */
export const VIEWS = [
  { id: 'browse', label: 'Browse' }, { id: 'folders', label: 'Folders' },
  { id: 'subtypes', label: 'Subtypes' }, { id: 'stats', label: 'Counts' },
];

/** Browse filters (same query parameters as the API) */
const FILTER_KEYS = ['grp', 'class', 'status', 'from', 'to', 'q', 'folder', 'sort', 'sig'] as const;
export type Filter = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/** a query without empty values, so equal states compare equal */
function clean(o: Record<string, string | number | null | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all').map(([k, v]) => [k, String(v)]));
}
const same = (a: object, b: object) =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
/** the viewer's list for Browse, the same as the API's ctx, so a Browse link needn't carry it */
const browseCtx = (f: Filter) => 'b:' + new URLSearchParams(clean(f)).toString();

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
      this.view(); this.filter(); this.subtype();
      this.decisions.set({});
    });
    // the URL follows the page's state (replacing the history entry), so a copied link opens the same screen;
    // only once App has read the first URL, or the saved state would overwrite a link being opened
    effect(() => {
      if (!this.urlRead()) return;
      const v = this.view(), want = this.query(v, true);
      untracked(() => {
        if (!same(this.router.parseUrl(this.router.url).queryParams, want)) this.router.navigate(['/' + v], { queryParams: want, replaceUrl: true });
      });
    });
  }

  /** set by App after the first navigation, when fromUrl() has run */
  readonly urlRead = signal(false);

  /** what page `view` keeps in its URL query (the tab links use it too, so switching tabs keeps each page's state);
   *  with `withItem`, the open item and, unless it's the Browse list, the list it came from */
  query(view: string, withItem = false): Record<string, string> {
    const s = this.subtype(), it = this.item();
    const q = view === 'browse' ? clean(this.filter())
      : view === 'folders' ? clean({ prefix: this.folder() })
      : view === 'subtypes' ? clean({ type: s.type, status: s.status, label: s.label })
      : {};
    if (withItem && it) Object.assign(q, clean({ item: it.hash, ctx: view === 'browse' && it.ctx === browseCtx(this.filter()) ? '' : it.ctx }));
    return q;
  }

  /** the page's state from its URL query (a link opened, back/forward, or a tab clicked) */
  fromUrl(view: string, p: Params) {
    if (view === 'browse') {
      const f = clean(Object.fromEntries(FILTER_KEYS.map(k => [k, p[k]])));
      if (!same(f, clean(this.filter()))) this.filter.set(f);
    } else if (view === 'folders') {
      this.folder.set(p['prefix'] ?? '');
    } else if (view === 'subtypes') {
      const s = { type: p['type'] || 'web_game_asset', status: p['status'] || 'match', label: p['label'] || '' };
      const cur = this.subtype();
      if (!same(s, { type: cur.type, status: cur.status, label: cur.label })) this.subtype.set({ ...s, sample: 0 });
    }
    const it = p['item'] ? { hash: String(p['item']), ctx: p['ctx'] ?? (view === 'browse' ? browseCtx(this.filter()) : '') } : null;
    const cur = this.item();
    if (it?.hash !== cur?.hash || (it && it.ctx !== cur?.ctx)) this.item.set(it);
  }

  /** open Browse with these filters (from Folders, Counts or an item's folder link) */
  browseWith(f: Filter) {
    // state first: the URL effect then wants the same address this navigation goes to
    this.view.set('browse'); this.filter.set(clean(f)); this.item.set(null);
    this.router.navigate(['/browse'], { queryParams: clean(f) });
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
