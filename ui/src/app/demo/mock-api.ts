import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { BY_HASH, CLASSES, ITEMS, MockItem, SUBTYPE_ROWS, SUBTYPES } from './mock-data';

/** Demo build only: answers the app's /api/ calls in the browser, the same way app.py would, from the generated library. */

const PAGE = 120;
const SAVED = 'media.demo.subtypes';   // your subtype answers, kept in this browser only

try {
  const saved: Record<string, string> = JSON.parse(localStorage.getItem(SAVED) || '{}');
  for (const s of SUBTYPE_ROWS) { const v = saved[s.hash + '/' + s.subtype]; if (v) { s.status = v; s.by_you = true; } }
} catch { /* private window: answers last for this visit only */ }

const tile = (i: MockItem) => ({ hash: i.hash, grp: i.grp, kind: i.kind, taken: i.taken, class: i.class, path: i.path, st: 'none', hidden: false });

function filtered(p: URLSearchParams): MockItem[] {
  const grp = p.get('grp'), cls = p.get('class'), folder = p.get('folder')?.replace(/\/$/, ''), from = p.get('from'), to = p.get('to');
  const q = p.get('q')?.toLowerCase();
  const out = ITEMS.filter(i => (!grp || i.grp === grp) && (!cls || i.class === cls)
    && (!folder || i.folder === folder || i.folder.startsWith(folder + '/'))
    && (!from || i.taken >= from) && (!to || i.taken.slice(0, 10) <= to) && (!q || (i.ocr ?? '').toLowerCase().includes(q)));
  const old = p.get('sort') === 'old';
  return out.sort((a, b) => (a.taken === b.taken ? a.hash.localeCompare(b.hash) : a.taken.localeCompare(b.taken)) * (old ? 1 : -1));
}

function browse(p: URLSearchParams) {
  const all = filtered(p), page = Math.max(1, Number(p.get('page') || 1));
  const ctx = new URLSearchParams([...p].filter(([k, v]) => k !== 'page' && v && v !== 'all'));
  return { items: all.slice((page - 1) * PAGE, page * PAGE).map(tile), total: all.length, page,
           pages: Math.max(1, Math.ceil(all.length / PAGE)), ctx: 'b:' + ctx.toString() };
}

function folders(prefix: string) {
  prefix = prefix.replace(/\/$/, '');
  const depth = prefix ? prefix.split('/').length : 1, counts = new Map<string, { n: number; v: number }>();
  for (const i of ITEMS) {
    if (prefix && i.folder !== prefix && !i.folder.startsWith(prefix + '/')) continue;
    const f = i.folder.split('/').slice(0, depth + 1).join('/');
    if (!f || f === prefix) continue;
    const c = counts.get(f) ?? { n: 0, v: 0 }; c.n++; if (i.grp === 'video') c.v++; counts.set(f, c);
  }
  return { prefix, here: ITEMS.filter(i => i.folder === prefix).length,
           folders: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([path, c]) => ({ path, name: path.slice(prefix.length).replace(/^\//, ''), ...c })) };
}

function subtypes(p: URLSearchParams) {
  const type = SUBTYPES[p.get('type') ?? ''] ? p.get('type')! : 'web_game_asset', status = p.get('status') || 'match', label = p.get('label');
  let rows = SUBTYPE_ROWS.filter(s => s.subtype === type && s.status === status && (!label || s.label === label));
  rows = p.get('sample') ? [...rows].sort(() => Math.random() - 0.5) : [...rows].sort((a, b) => b.conf - a.conf);
  const counts: Record<string, number> = {};
  for (const s of SUBTYPE_ROWS) if (s.subtype === type) counts[s.status] = (counts[s.status] ?? 0) + 1;
  return { type, status, label, counts, items: rows.slice(0, 120).map(s => ({ ...tile(BY_HASH.get(s.hash)!), conf: s.conf, label: s.label, by_you: s.by_you })) };
}

function item(h: string, ctx: string) {
  const i = BY_HASH.get(h);
  if (!i) return null;
  let prev: string | null = null, next: string | null = null;
  if (ctx.startsWith('b:')) {
    const list = filtered(new URLSearchParams(ctx.slice(2))), at = list.findIndex(x => x.hash === h);
    if (at >= 0) { prev = list[at - 1]?.hash ?? null; next = list[at + 1]?.hash ?? null; }
  }
  return { hash: i.hash, grp: i.grp, kind: i.kind, class: i.class, taken: i.taken, taken_source: i.taken_source, size: i.size,
           width: i.width, height: i.height, duration: i.duration, folder: i.folder, st: 'none', hidden: false,
           playable: i.grp === 'image', prev, next, extras: [], copies: i.copies, derived: [],
           ocr: i.ocr ? { text: i.ocr, conf: 91.4 } : null };
}

function stats() {
  const counts = new Map<string, number>();
  for (const i of ITEMS) counts.set(i.grp + '|' + i.class, (counts.get(i.grp + '|' + i.class) ?? 0) + 1);
  return { rows: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => { const [grp, cls] = k.split('|'); return { grp, class: cls, st: 'none', n }; }) };
}

function answer(h: string, sub: string, verdict: string) {
  const s = SUBTYPE_ROWS.find(x => x.hash === h && x.subtype === sub);
  if (!s || !['match', 'no'].includes(verdict)) return null;
  s.status = verdict; s.by_you = true;
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED) || '{}'); saved[h + '/' + sub] = verdict;
    localStorage.setItem(SAVED, JSON.stringify(saved));
  } catch { /* private window */ }
  return { ok: true };
}

export const mockApi: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/')) return next(req);
  const u = new URL(req.urlWithParams, 'http://demo'), path = u.pathname.slice(5), p = u.searchParams;
  let body: unknown = null, m: RegExpMatchArray | null;
  if (req.method === 'GET') {
    if (path === 'health') body = { ok: true, items: ITEMS.length, at: new Date().toISOString().slice(0, 19) };
    else if (path === 'meta') body = { classes: CLASSES, page_size: PAGE, subtypes: SUBTYPES, status: { label: 'status', values: [], hidden: [] },
      class_counts: Object.fromEntries(CLASSES.map(c => [c, ITEMS.filter(i => i.class === c).length])) };
    else if (path === 'browse') body = browse(p);
    else if (path === 'folders') body = folders(p.get('prefix') ?? '');
    else if (path === 'subtypes') body = subtypes(p);
    else if (path === 'stats') body = stats();
    else if ((m = path.match(/^item\/([0-9a-f]{64})$/))) body = item(m[1], p.get('ctx') ?? '');
  } else if (req.method === 'POST' && (m = path.match(/^subtype\/([0-9a-f]{64})\/(\w+)$/))) {
    body = answer(m[1], m[2], (req.body as Record<string, string>)?.['verdict']);
  }
  const res = body === null ? new HttpResponse({ status: 404, statusText: 'Not in the demo', url: req.url })
                            : new HttpResponse({ status: 200, body, url: req.url });
  return of(res).pipe(delay(60));   // a little latency, like a real server
};

/** A drawing instead of a photo: a little landscape for camera shots, a phone screen for screenshots, a tile for assets. */
export function mockMedia(path: string): string {
  const m = path.match(/^(thumb|view|file|frame)\/([0-9a-f]{64})/), i = m && BY_HASH.get(m[2]);
  if (!i) return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="100%" height="100%" fill="#8883"/></svg>');
  const big = m![1] !== 'thumb', W = big ? 1200 : 320, H = big ? Math.round(W * i.height / i.width) : 320, hue = i.hue;
  let art: string;
  if (i.class.startsWith('screenshot')) {
    const pw = H * 0.46, x = (W - pw) / 2;
    art = `<rect width="${W}" height="${H}" fill="hsl(${hue},18%,88%)"/><rect x="${x}" y="${H * 0.04}" width="${pw}" height="${H * 0.92}" rx="${pw * 0.08}" fill="hsl(${hue},25%,97%)" stroke="hsl(${hue},20%,70%)"/>`
      + Array.from({ length: 7 }, (_, k) => `<rect x="${x + pw * 0.1}" y="${H * (0.12 + k * 0.11)}" width="${pw * (0.5 + ((hue + k * 37) % 40) / 100)}" height="${H * 0.04}" rx="4" fill="hsl(${(hue + k * 25) % 360},45%,${70 - k * 3}%)"/>`).join('');
  } else if (i.class === 'asset') {
    art = `<rect width="${W}" height="${H}" fill="hsl(${hue},20%,92%)"/><rect x="${W * 0.28}" y="${H * 0.28}" width="${W * 0.44}" height="${H * 0.44}" rx="${W * 0.1}" fill="hsl(${hue},70%,55%)"/><circle cx="${W / 2}" cy="${H / 2}" r="${W * 0.1}" fill="hsl(${(hue + 180) % 360},70%,92%)"/>`;
  } else {
    art = `<defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},65%,72%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,88%)"/></linearGradient></defs>`
      + `<rect width="${W}" height="${H}" fill="url(#g)"/><circle cx="${W * 0.72}" cy="${H * 0.3}" r="${Math.min(W, H) * 0.09}" fill="hsl(${(hue + 50) % 360},90%,85%)"/>`
      + `<path d="M0 ${H * 0.72} Q ${W * 0.25} ${H * 0.52} ${W * 0.5} ${H * 0.68} T ${W} ${H * 0.62} V ${H} H 0 Z" fill="hsl(${(hue + 120) % 360},35%,42%)"/>`
      + `<path d="M0 ${H * 0.84} Q ${W * 0.4} ${H * 0.72} ${W} ${H * 0.86} V ${H} H 0 Z" fill="hsl(${(hue + 140) % 360},35%,30%)"/>`;
  }
  const label = `<text x="${W * 0.04}" y="${H * 0.95}" font-family="sans-serif" font-size="${Math.max(12, W * 0.045)}" fill="#fff" fill-opacity=".85">${i.taken.slice(0, 10)}${i.grp === 'video' ? ' ▶' : ''}</text>`;
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${art}${label}</svg>`);
}
