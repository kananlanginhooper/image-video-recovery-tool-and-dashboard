import { Injectable, inject } from '@angular/core';
import { HttpClient, httpResource } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { config } from './config';
import { DATA_MODE } from './data-mode';
import type { BrowsePage, FolderList, Item, Meta, Stats, SubtypePage } from './models';

/** URL under the API for <img>/<video>/download links (HttpClient calls just use '/api/...'); the demo draws its own */
export const apiUrl = (p: string) => (DATA_MODE.mediaUrl ? DATA_MODE.mediaUrl(p) : config().apiBase + p);

/** localStorage key for this app's saved view state (storage is per origin, never shared with other apps) */
export const lsKey = (k: string) => 'media.' + k;

type Params = Record<string, string | number>;

/**
 * Every call to the back end. The list methods return reactive resources (call them in a field initializer); in the demo
 * build the same calls are answered in the browser, so components never know the difference.
 */
@Injectable({ providedIn: 'root' })
export class MediaApi {
  private readonly http = inject(HttpClient);

  meta() { return httpResource<Meta>(() => '/api/meta'); }
  /** one batch of Browse (120); its `next` asks for the following batch as ?after= */
  page(params: Params): Promise<BrowsePage> { return firstValueFrom(this.http.get<BrowsePage>('/api/browse', { params })); }
  /** how many the same filters match: separate, as a first count can take seconds while the batch takes milliseconds */
  count(params: Params): Promise<number> {
    return firstValueFrom(this.http.get<{ total: number }>('/api/browse/count', { params })).then(r => r.total);
  }
  folders(prefix: () => string) { return httpResource<FolderList>(() => ({ url: '/api/folders', params: { prefix: prefix() } })); }
  subtypes(params: () => Params) { return httpResource<SubtypePage>(() => ({ url: '/api/subtypes', params: params() })); }
  stats() { return httpResource<Stats>(() => '/api/stats'); }

  item(hash: string, ctx: string): Promise<Item> {
    return firstValueFrom(this.http.get<Item>('/api/item/' + hash, { params: ctx ? { ctx } : {} }));
  }

  /** an answer to a review question (subtypes here; plugins post theirs the same way) */
  post(path: string, body: Record<string, string>) { return this.http.post('/api/' + path, body); }
}
