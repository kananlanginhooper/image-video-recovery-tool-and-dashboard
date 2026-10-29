import { HttpInterceptorFn } from '@angular/common/http';
import type { RuntimeConfig } from './models';

/** What a data source provides (data-mode.ts = the real back end, data-mode.demo.ts = mock data in the browser). */
export interface DataMode {
  /** extra HttpClient interceptors (the demo answers /api/ calls itself) */
  interceptors: HttpInterceptorFn[];
  /** fixed runtime config instead of GET api/config; null = load it from the back end */
  config: RuntimeConfig | null;
  /** URL for an <img>/<video>/download path under the API; null = the API's own URL */
  mediaUrl: ((path: string) => string) | null;
  /** shown in the header */
  label: string;
}
