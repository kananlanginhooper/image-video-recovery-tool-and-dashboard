import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked,
  viewChild,
} from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MediaApi } from '../../core/media-api';
import { Filter, MediaStore } from '../../core/media.store';
import type { Tile } from '../../core/models';
import { ChipChoice, ChipOption } from '../../shared/chip-choice';
import { num, params } from '../../shared/format';
import { MediaTile } from '../../shared/media-tile';
import { FilterBar } from './filter-bar';

/** how far below the screen the next 120 start loading, so scrolling rarely reaches the end of what's loaded */
const AHEAD = 1600;

/** Browse: filters, class and review-signal chips with counts, newest first, more loading as you scroll. */
@Component({
  selector: 'browse-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterBar, ChipChoice, MediaTile, MatProgressBarModule],
  template: `
    <browse-filter-bar [filter]="store.filter()" [meta]="meta()" (apply)="store.browseWith($event)" (resetFilters)="store.browseWith({})" />
    <chip-choice label="Class" [options]="classes()" [selected]="store.filter().class || ''" (pick)="pick('class', $event)" />
    @if (signals().length > 1) {
      <chip-choice label="Review" [options]="signals()" [selected]="store.filter().sig || ''" (pick)="pick('sig', $event)" />
    }
    @if (meta()?.status?.hidden?.length) {
      <p class="muted">{{ meta()!.status.hidden.join(' and ') }} items are blurred; click one to reveal it, click again to open it.</p>
    }
    @if (items().length || total() !== null) {
      <p class="muted">{{ total() === null ? 'counting…' : num(total()!) + ' items' }} · {{ num(items().length) }} loaded</p>
    }
    @if (error()) { <p class="warn">Couldn't load more ({{ error() }}). <button type="button" (click)="more()">Try again</button></p> }
    <div class="grid">
      @for (t of items(); track t.hash) { <media-tile [it]="t" (open)="store.item.set({ hash: t.hash, ctx: ctx })" /> }
      @empty { @if (done()) { <p class="muted">Nothing matches.</p> } }
    </div>
    <div #end class="more">
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @else if (done() && items().length) { <p class="muted">End of the list.</p> }
    </div>`,
  styles: `.more { min-height: 48px; padding: var(--app-space-3) 0; }`,
})
export class BrowsePage {
  protected readonly store = inject(MediaStore);
  private readonly api = inject(MediaApi);
  private readonly injector = inject(Injector);
  protected readonly meta = computed(() => this.store.meta.value());
  protected readonly num = num;

  protected readonly classes = computed<ChipOption[]>(() => [
    { value: '', label: 'all classes' },
    ...(this.meta()?.classes ?? []).map(c => ({ value: c, label: c, count: this.meta()?.class_counts?.[c] ?? 0 })),
  ]);
  /** image signals to review (product photos, faces, damaged…), counted within the chosen class */
  protected readonly signals = computed<ChipOption[]>(() => {
    const m = this.meta(), cls = this.store.filter().class;
    const count = (s: string) => {
      const byClass = m?.signal_counts?.[s];
      if (!byClass) return null;
      return cls ? (byClass[cls] ?? 0) : Object.values(byClass).reduce((a, b) => a + b, 0);
    };
    return [{ value: '', label: 'everything' },
            ...Object.entries(m?.signals ?? {}).map(([value, label]) => ({ value, label, count: count(value) }))];
  });

  protected readonly items = signal<Tile[]>([]);
  protected readonly total = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal('');
  protected ctx = '';
  private next = '';
  private run = 0;   // a newer filter makes older answers stale
  private readonly sentinel = viewChild.required<ElementRef<HTMLElement>>('end');

  constructor() {
    effect(() => { const f = this.store.filter(); untracked(() => this.restart(f)); });
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) this.more(); }, { rootMargin: `0px 0px ${AHEAD}px 0px` });
      io.observe(this.sentinel().nativeElement);
      destroyRef.onDestroy(() => io.disconnect());
    });
  }

  protected pick(key: 'class' | 'sig', v: string) { this.store.browseWith({ ...this.store.filter(), [key]: v || undefined } as Filter); }

  private restart(f: Filter) {
    this.run++;
    this.items.set([]); this.total.set(null); this.done.set(false); this.error.set(''); this.loading.set(false);
    this.next = ''; this.ctx = '';
    window.scrollTo(0, 0);
    this.load(f);
    const run = this.run;
    this.api.count(params(f)).then(n => { if (run === this.run) this.total.set(n); }, () => undefined);
  }

  /** the next 120, when there are more and none are on the way */
  protected more() {
    if (!this.loading() && !this.done() && this.items().length) this.load(this.store.filter());
  }

  private async load(f: Filter) {
    const run = this.run;
    this.loading.set(true); this.error.set('');
    try {
      const d = await this.api.page(params({ ...f, ...(this.next ? { after: this.next } : {}) }));
      if (run !== this.run) return;
      this.items.update(xs => [...xs, ...d.items]);
      this.ctx = d.ctx; this.next = d.next ?? ''; this.done.set(!d.next);
    } catch (e) {
      if (run === this.run) this.error.set((e as Error).message || 'error');
    } finally {
      if (run === this.run) this.loading.set(false);
    }
    // still near the bottom (a short page, or a tall screen): the observer won't fire again, so keep going
    if (run === this.run && !this.done() && !this.error()) {
      afterNextRender(() => {
        if (this.sentinel().nativeElement.getBoundingClientRect().top < innerHeight + AHEAD) this.more();
      }, { injector: this.injector });
    }
  }
}
