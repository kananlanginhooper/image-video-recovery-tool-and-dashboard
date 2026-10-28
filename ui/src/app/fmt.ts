/** Display helpers, same output as app.py's size_h() and its taken captions. */

export function sizeH(n: number | null | undefined): string {
  if (!n) return '';
  for (const u of ['B', 'KB', 'MB', 'GB']) {
    if (n < 1000) return `${n.toFixed(0)} ${u}`;
    n /= 1000;
  }
  return `${n.toFixed(1)} TB`;
}

/** '2024-05-01T12:34:56' -> '2024-05-01 12:34' */
export const taken = (t: string | null | undefined) => (t ? t.replace('T', ' ').slice(0, 16) : '');

export const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-US');

/** {"euphemism": 2, "theme": 1} -> 'euphemism ×2, theme ×1' */
export const cats = (c: Record<string, number>) => Object.entries(c).map(([k, v]) => `${k} ×${v}`).join(', ');

/** drop empty values so they don't reach the query string (app.py treats '' and 'all' as "no filter") */
export function params(o: Record<string, string | number | null | undefined>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== '' && v !== 'all') out[k] = v;
  return out;
}
