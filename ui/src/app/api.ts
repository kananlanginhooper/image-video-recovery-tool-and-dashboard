import { config } from './config';
import { DATA_MODE } from './data-mode';

/** URL under the API for <img>/<video>/download links (HttpClient calls just use '/api/...'); the demo draws its own */
export const apiUrl = (p: string) => (DATA_MODE.mediaUrl ? DATA_MODE.mediaUrl(p) : config().apiBase + p);

/** localStorage key for this app's saved view state (storage is per origin, never shared with other apps) */
export const lsKey = (k: string) => 'media.' + k;
