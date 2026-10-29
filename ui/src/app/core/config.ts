import { HttpInterceptorFn } from '@angular/common/http';
import { DATA_MODE } from './data-mode';
import type { RuntimeConfig } from './models';

/**
 * Runtime config from the app's own back end (GET api/config, relative to <base href>), loaded before the app starts, so no
 * host, port, scheme or path is compiled in: the same build runs at http://<ip>:<port>, under a path prefix (UI_BASE_PATH),
 * or at https://<app>.<domain> (DEV-STANDARD "subdomain-ready").
 */
let cfg: RuntimeConfig = { apiBase: '/api/', basePath: '/', publicUrl: '', frameParents: [], login: { enabled: false, issuer: '', clientId: '' } };

export const config = () => cfg;

/** fetched relative to the page's <base href> (set by the back end), so it works at any host or path */
export async function loadConfig() {
  if (DATA_MODE.config) { cfg = DATA_MODE.config; return; }
  try {
    const r = await fetch('api/config', { cache: 'no-store' });
    if (r.ok) cfg = { ...cfg, ...(await r.json()) };
  } catch { /* keep the defaults: same-origin /api/ */ }
}

/** HttpClient calls use '/api/...'; this points them at the configured API base */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.url.startsWith('/api/') && cfg.apiBase !== '/api/' ? req.clone({ url: cfg.apiBase + req.url.slice(5) }) : req);
