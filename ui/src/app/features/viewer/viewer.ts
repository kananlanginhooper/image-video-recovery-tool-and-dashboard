import { ChangeDetectionStrategy, Component, DestroyRef, Injector, effect, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MediaApi, apiUrl } from '../../core/media-api';
import { MediaStore } from '../../core/media.store';
import type { Extra, Item } from '../../core/models';
import { PLUGINS } from '../../core/plugins';
import { ItemDetails } from './item-details';
import { ViewerMedia } from './viewer-media';

/**
 * Item viewer over the list: picture or video, plugin actions, details. ← / → (or swipe) step through the list it was
 * opened from; the next 3 and previous 2 items, images included, are prefetched. Esc closes.
 */
@Component({
  selector: 'media-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, MatButtonModule, MatIconModule, MatProgressBarModule, ViewerMedia, ItemDetails],
  templateUrl: './viewer.html',
  host: { class: 'overlay' },
})
export class Viewer {
  protected readonly store = inject(MediaStore);
  private readonly api = inject(MediaApi);
  private readonly injector = inject(Injector);
  protected readonly actions = PLUGINS.map(p => p.itemActions).filter(a => !!a);

  protected readonly cur = this.store.item;
  protected readonly it = signal<Item | null>(null);
  protected readonly error = signal('');
  protected x0: number | null = null;

  /** hash -> item (with its neighbours for the same ctx); the newest 40 are kept */
  private readonly cache = new Map<string, Promise<Item | null>>();
  private ctxOfCache = '';

  constructor() {
    effect(() => {
      const c = this.cur();
      if (c) this.show(c.hash, c.ctx);
    });
    const key = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || (ev.target as HTMLElement)?.closest?.('input,textarea,select')) return;
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); this.step('prev'); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); this.step('next'); }
      else if (ev.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', key);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';   // the list behind keeps its scroll position
    inject(DestroyRef).onDestroy(() => { document.removeEventListener('keydown', key); document.body.style.overflow = prevOverflow; });
  }

  protected download(h: string) { return apiUrl('file/' + h); }
  protected close() { this.store.item.set(null); }
  protected extra(x: Extra, r: Item) { for (const p of PLUGINS) p.onExtra?.(x, r, this.injector); }

  protected step(dir: 'prev' | 'next') {
    const r = this.it(), c = this.cur();
    const h = r?.[dir];
    if (h && c) this.cur.set({ hash: h, ctx: c.ctx });
  }

  protected swipe(ev: TouchEvent) {
    if (this.x0 === null) return;
    const dx = ev.changedTouches[0].clientX - this.x0;
    this.x0 = null;
    if (Math.abs(dx) > 70) this.step(dx > 0 ? 'prev' : 'next');
  }

  private async show(h: string, ctx: string) {
    this.error.set('');
    if (this.it()?.hash !== h) this.it.set(null);
    const r = await this.get(h, ctx);
    if (this.cur()?.hash !== h) return;   // moved on while it loaded
    if (!r) { this.error.set("Couldn't load this item."); return; }
    this.it.set(r);
    document.querySelector('media-viewer')?.scrollTo(0, 0);
    this.prefetch(r, ctx);
  }

  private get(h: string, ctx: string): Promise<Item | null> {
    if (ctx !== this.ctxOfCache) { this.cache.clear(); this.ctxOfCache = ctx; }
    let p = this.cache.get(h);
    if (!p) {
      p = this.api.item(h, ctx).then(r => {
        if (r.grp === 'image') new Image().src = apiUrl('view/' + h);   // warm the browser cache for the big image
        return r;
      }).catch(() => { this.cache.delete(h); return null; });
      this.cache.set(h, p);
      while (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }

  private async prefetch(r: Item, ctx: string) {
    if (!ctx) return;
    let n: string | null = r.next;
    for (let i = 0; i < 3 && n; i++) n = (await this.get(n, ctx))?.next ?? null;
    let p: string | null = r.prev;
    for (let i = 0; i < 2 && p; i++) p = (await this.get(p, ctx))?.prev ?? null;
  }
}
