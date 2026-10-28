import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Filter, MediaStore } from '../media.store';
import { NgTemplateOutlet } from '@angular/common';
import { MediaTile } from '../ui';
import { num, params } from '../fmt';
import { BrowsePage } from '../types';

/** Browse: filters, class chips with counts, 120 per page, newest first */
@Component({
  selector: 'media-browse',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MediaTile, NgTemplateOutlet],
  template: `
    <form class="f" (submit)="$event.preventDefault(); apply()">
      <select [value]="draft().grp || 'all'" (change)="set('grp', $any($event.target).value)">
        <option value="all">images + videos</option><option value="image">image</option><option value="video">video</option>
      </select>
      <select [value]="draft().class || 'all'" (change)="set('class', $any($event.target).value)">
        <option value="all">any class</option>
        @for (c of meta()?.classes; track c) { <option [value]="c">{{ c }}</option> }
      </select>
      @if (meta()?.status?.values?.length) {
        <select [value]="draft().status || 'all'" (change)="set('status', $any($event.target).value)">
          <option value="all">any {{ meta()!.status.label }}</option>
          @for (s of meta()!.status.values; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      }
      <input type="date" [value]="draft().from || ''" (change)="set('from', $any($event.target).value)"> to
      <input type="date" [value]="draft().to || ''" (change)="set('to', $any($event.target).value)">
      <input placeholder="OCR text search" size="18" [value]="draft().q || ''" (input)="set('q', $any($event.target).value)">
      <input placeholder="folder prefix" size="24" [value]="draft().folder || ''" (input)="set('folder', $any($event.target).value)">
      <select [value]="draft().sort || 'new'" (change)="set('sort', $any($event.target).value)">
        <option value="new">newest first</option><option value="old">oldest first</option>
      </select>
      <button type="submit">Apply</button> <a href="" (click)="$event.preventDefault(); store.browseWith({})">reset</a>
    </form>
    <div class="chips">
      <a class="chip" [class.on]="!f().class" href="" (click)="$event.preventDefault(); pick(undefined)">all classes</a>
      @for (c of meta()?.classes; track c) {
        <a class="chip" [class.on]="f().class === c" href="" (click)="$event.preventDefault(); pick(c)">{{ c }} {{ num(meta()?.class_counts?.[c]) }}</a>
      }
    </div>
    @if (meta()?.status?.hidden?.length) {
      <p class="muted">{{ meta()!.status.hidden.join(' and ') }} items are blurred; click one to reveal it, click again to open it.</p>
    }
    <ng-template #pager>
      <div class="pager">
        @if (page() > 1) { <a href="" (click)="$event.preventDefault(); go(page() - 1)">← prev</a> }
        <span class="muted">
          @if (data(); as d) { page {{ num(d.page) }} of {{ num(d.pages) }} · {{ num(d.total) }} items } @else { loading… }
        </span>
        @if (data() && page() < data()!.pages) { <a href="" (click)="$event.preventDefault(); go(page() + 1)">next →</a> }
      </div>
    </ng-template>
    <ng-container *ngTemplateOutlet="pager" />
    @if (res.error()) { <p class="warn">Couldn't load this page ({{ res.error()?.message }}).</p> }
    <div class="grid">
      @for (t of data()?.items; track t.hash) { <media-tile [it]="t" (open)="store.item.set({ hash: t.hash, ctx: data()!.ctx })" /> }
      @empty { @if (data()) { <p class="muted">Nothing matches.</p> } }
    </div>
    <ng-container *ngTemplateOutlet="pager" />`,
})
export class Browse {
  protected readonly store = inject(MediaStore);
  protected readonly num = num;
  protected readonly f = this.store.filter;
  protected readonly page = this.store.page;
  protected readonly meta = computed(() => this.store.meta.value());
  /** form edits stay here until Apply; a new filter from elsewhere (chips, Folders, Counts) resets them */
  protected readonly draft = linkedSignal<Filter>(() => ({ ...this.f() }));

  protected readonly res = httpResource<BrowsePage>(() => ({ url: '/api/browse', params: params({ ...this.f(), page: this.page() }) }));
  /** keep the last page on screen while the next one loads */
  protected readonly data = linkedSignal<BrowsePage | undefined, BrowsePage | undefined>({
    source: () => this.res.value(), computation: (v, prev) => v ?? prev?.value,
  });

  constructor() {
    effect(() => { this.page(); this.scrollTop(); });
  }

  protected set(k: keyof Filter, v: string) { this.draft.update(d => ({ ...d, [k]: v })); }
  protected apply() { this.store.browseWith(params(this.draft()) as Filter); }
  protected pick(c: string | undefined) { this.store.browseWith({ ...this.f(), class: c }); }
  protected go(p: number) { this.page.set(p); }

  private scrollTop() { queueMicrotask(() => window.scrollTo(0, 0)); }
}
