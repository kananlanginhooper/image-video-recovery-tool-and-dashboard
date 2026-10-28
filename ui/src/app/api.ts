/** URL under the API for <img>/<video>/download links (HttpClient calls just use '/api/...') */
export const apiUrl = (p: string) => '/api/' + p;

/** localStorage key for this app's saved view state */
export const lsKey = (k: string) => 'media.' + k;
