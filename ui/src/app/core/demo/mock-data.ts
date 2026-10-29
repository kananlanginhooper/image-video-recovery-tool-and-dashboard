/**
 * Demo build only: a generated, generic photo/video library (no real files, names or places), the same every visit.
 * Shapes match app.py's API so the real UI runs unchanged on it.
 */

export const CLASSES = ['camera', 'screenshot', 'screenshot_probable', 'unknown', 'unclassified', 'asset'];
export const SUBTYPES: Record<string, string> = { web_game_asset: 'Web / game assets', ios_messages: 'iOS Messages' };

export interface MockItem {
  hash: string; grp: 'image' | 'video'; kind: string; class: string; taken: string; taken_source: string;
  width: number; height: number; duration: number | null; size: number; path: string; folder: string;
  copies: { path: string; size: number }[]; ocr: string | null; hue: number;
}
export interface MockSubtype { hash: string; subtype: string; status: string; conf: number; label: string | null; by_you: boolean; }

/** small seeded PRNG (mulberry32), so the library is identical on every load */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20261028);
const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)];
const weighted = <T>(a: readonly [T, number][]) => { let x = r() * a.reduce((s, [, w]) => s + w, 0); for (const [v, w] of a) if ((x -= w) < 0) return v; return a[0][0]; };
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

const EVENTS = ['beach', 'birthday', 'hiking', 'garden', 'city-walk', 'snow-day', 'road-trip', 'concert', 'museum', 'picnic', 'harbor', 'farm-visit'];
const OCR_LINES = [
  'Meeting notes — agenda item 3: budget review', 'Boarding pass · Gate B12 · Seat 14C', 'Recipe: tomato soup, serves 4',
  'Weather today: sunny, high of 72°F', 'Level 12 complete! Score 48,210', 'Reminder: water the plants',
  'Order confirmed — estimated delivery Tuesday', 'Battery 18% — low power mode on', 'Map: 2.4 mi · 8 min by car',
  'Settings › Wi-Fi › Home network', 'Calendar: dentist 3:30 PM', 'Quiz answers: 1-B 2-D 3-A',
];

function makeItem(i: number): MockItem {
  const cls = weighted<string>([['camera', 55], ['screenshot', 18], ['screenshot_probable', 5], ['unknown', 8], ['unclassified', 9], ['asset', 5]]);
  const video = cls === 'camera' && r() < 0.18;
  const year = 2008 + Math.floor(r() * 17);
  const d = new Date(Date.UTC(year, Math.floor(r() * 12), 1 + Math.floor(r() * 28), Math.floor(r() * 24), Math.floor(r() * 60), Math.floor(r() * 60)));
  const taken = d.toISOString().slice(0, 19);
  const kind = video ? pick(['mp4', 'mov', 'mts']) : cls.startsWith('screenshot') ? 'png' : cls === 'asset' ? pick(['png', 'gif', 'webp']) : pick(['jpeg', 'jpeg', 'jpeg', 'heic']);
  let folder: string;
  if (cls.startsWith('screenshot')) folder = `/library/screenshots/${year}`;
  else if (cls === 'asset') folder = `/library/downloads/web-assets/${pick(['icons', 'sprites', 'banners'])}`;
  else if (cls === 'unclassified' || cls === 'unknown') folder = `/recovered/disk-${pick(['a', 'b', 'c'])}/recup_dir.${1 + Math.floor(r() * 40)}`;
  else folder = r() < 0.5 ? `/library/photos/${year}/${pick(EVENTS)}` : `/library/phone-backup/DCIM/${100 + Math.floor(r() * 6)}CAMERA`;
  const name = folder.startsWith('/recovered') ? `f${pad(Math.floor(r() * 1e7), 7)}.${kind === 'jpeg' ? 'jpg' : kind}`
    : `${cls.startsWith('screenshot') ? 'Screenshot_' + taken.slice(0, 10) : video ? 'VID_' : 'IMG_'}${pad(i, 4)}.${kind === 'jpeg' ? 'jpg' : kind}`;
  const path = `${folder}/${name}`;
  const portrait = r() < 0.35;
  const [w, h] = cls.startsWith('screenshot') ? [1170, 2532] : video ? [1920, 1080] : portrait ? [3024, 4032] : [4032, 3024];
  const size = video ? Math.floor(5e6 + r() * 3e8) : Math.floor(2e5 + r() * 5e6);
  const copies = [{ path, size }];
  for (let c = 0; c < (r() < 0.3 ? 1 + Math.floor(r() * 2) : 0); c++) copies.push({ path: `/backups/old-laptop${c ? '-' + (c + 1) : ''}${path}`, size });
  return {
    hash: hex(64), grp: video ? 'video' : 'image', kind, class: cls, taken,
    taken_source: pick(['exif', 'exif', 'file_mtime', 'photo_export']), width: w, height: h,
    duration: video ? Math.floor(5 + r() * 300) : null, size, path, folder, copies,
    ocr: cls.startsWith('screenshot') ? `${pick(OCR_LINES)}\n${pick(OCR_LINES)}` : null, hue: Math.floor(r() * 360),
  };
}

export const ITEMS: MockItem[] = Array.from({ length: 3000 }, (_, i) => makeItem(i + 1));
export const BY_HASH = new Map(ITEMS.map(i => [i.hash, i]));

export const SUBTYPE_ROWS: MockSubtype[] = ITEMS.filter(i => i.class.startsWith('screenshot') || i.class === 'asset').map(i => {
  const subtype = i.class === 'asset' || r() < 0.55 ? 'web_game_asset' : 'ios_messages';
  const conf = Math.round(r() * 100) / 100;
  return { hash: i.hash, subtype, conf, status: conf > 0.7 ? 'match' : conf > 0.4 ? 'borderline' : 'no',
           label: subtype === 'web_game_asset' ? pick(['icon_sprite', 'product_photo', null]) : null, by_you: false };
});
