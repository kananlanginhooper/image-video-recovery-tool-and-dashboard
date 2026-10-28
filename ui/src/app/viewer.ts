import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, effect, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MediaStore } from './media.store';
import { PLUGINS } from './plugins';
import { apiUrl } from './api';
import { sizeH, taken } from './fmt';
import { Extra, Item } from './types';

/**
 * Item viewer over the list: image or video, plugin actions, details, copies and OCR text.
 * ← / → (or swipe) step through the list it was opened from; the next 3 and previous 2 items, images included, are prefetched.
 * Esc closes.
 */
@Component({
  selector: 'media-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `
    <div class="viewer-wrap" (touchstart)="x0 = $event.touches[0].clientX" (touchend)="swipe($event)">
      <div class="navbar">
        <button (click)="close()">✕ Close</button>
        <button [disabled]="!it()?.prev" (click)="step('prev')">← Previous</button>
        <button [disabled]="!it()?.next" (click)="step('next')">Next →</button>
        <span class="muted">{{ cur()?.ctx ? 'arrow keys or swipe also work · Esc closes' : 'open an item from a list to step through it · Esc closes' }}</span>
      </div>
      @if (error()) { <p class="warn">{{ error() }}</p> }
      @if (it(); as r) {
        <div class="viewer" [class.blur]="hidden()" (click)="hidden() && store.reveal(r.hash)">
          @if (r.grp === 'image') {
            <img [src]="src('view/', r.hash)" alt="">
          } @else if (r.playable) {
            <video [src]="src('file/', r.hash)" controls preload="metadata" [poster]="src('thumb/', r.hash)"></video>
          } @else {
            <img [src]="src('thumb/', r.hash)" alt=""><p class="muted">{{ r.kind }} doesn't play in a browser; download it below.</p>
          }
        </div>
        <div class="act">
          <a [href]="src('file/', r.hash)" download>Download original</a>
          @for (a of actions; track $index) { <ng-container *ngComponentOutlet="a; inputs: { item: r }" /> }
        </div>
        <table class="meta">
          <tr><td>taken</td><td>{{ taken(r.taken) || '—' }} <span class="muted">({{ r.taken_source }})</span></td></tr>
          <tr><td>class</td><td>{{ r.class }}</td></tr>
          <tr><td>kind</td><td>{{ r.kind }}</td></tr>
          <tr><td>size</td><td>{{ sizeH(r.size) }}{{ r.width ? ' · ' + r.width + '×' + r.height : '' }}{{ r.duration ? ' · ' + r.duration.toFixed(0) + ' s' : '' }}</td></tr>
          @for (x of r.extras; track $index) {
            <tr><td>{{ x.label }}</td><td>
              @if (isLink(x)) { <a href="" (click)="$event.preventDefault(); extra(x, r)">{{ x.text }}</a> } @else { {{ x.text }} }
            </td></tr>
          }
          <tr><td>hash</td><td><code>{{ r.hash }}</code></td></tr>
          <tr><td>folder</td><td><a href="" (click)="$event.preventDefault(); store.browseWith({ folder: r.folder })">{{ r.folder }}</a></td></tr>
          @if (r.derived.length) {
            <tr><td>linked</td><td>@for (d of r.derived; track $index) { {{ d.derivation }}: {{ d.path }}<br> }</td></tr>
          }
        </table>
        <h3>Copies ({{ r.copies.length }})</h3>
        <table class="meta">
          @for (c of r.copies; track c.path) { <tr><td>{{ sizeH(c.size) }}</td><td>{{ c.path }}</td></tr> }
        </table>
        @if (r.ocr; as o) {
          <h3>OCR text <span class="muted">(confidence {{ o.conf }})</span></h3>
          <pre class="ocr">{{ o.text }}</pre>
        }
      } @else if (!error()) { <p class="muted">loading…</p> }
    </div>`,
  host: { class: 'overlay' },
})
export class Viewer {
  protected readonly store = inject(MediaStore);
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  protected readonly taken = taken; protected readonly sizeH = sizeH;
  protected readonly actions = PLUGINS.map(p => p.itemActions).filter(a => !!a);

  protected readonly cur = this.store.item;
  protected readonly it = signal<Item | null>(null);
  protected readonly error = signal('');
  protected readonly hidden = computed(() => { const r = this.it(); return !!r && this.store.isHidden(r.hash, r.hidden); });
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

  protected src(kind: string, h: string) { return apiUrl(kind + h); }
  protected close() { this.store.item.set(null); }
  protected isLink(x: Extra) { return Object.keys(x).some(k => k !== 'label' && k !== 'text'); }
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
      p = firstValueFrom(this.http.get<Item>('/api/item/' + h, { params: ctx ? { ctx } : {} })).then(r => {
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
