import { config } from './config';

/** URL under the API for <img>/<video>/download links (HttpClient calls just use '/api/...') */
export const apiUrl = (p: string) => config().apiBase + p;

/** localStorage key for this app's saved view state (storage is per origin, never shared with other apps) */
export const lsKey = (k: string) => 'media.' + k;
