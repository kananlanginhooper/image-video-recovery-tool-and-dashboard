import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MediaApi } from '../../core/media-api';
import { Filter, MediaStore } from '../../core/media.store';
import type { BrowsePage as Page } from '../../core/models';
import { ChipChoice, ChipOption } from '../../shared/chip-choice';
import { params } from '../../shared/format';
import { MediaTile } from '../../shared/media-tile';
import { ListPager } from '../../shared/pager';
import { FilterBar } from './filter-bar';

/** Browse: filters, class chips with counts, 120 per page, newest first. */
@Component({
  selector: 'browse-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilterBar, ChipChoice, MediaTile, ListPager, MatProgressBarModule],
  template: `
    <browse-filter-bar [filter]="store.filter()" [meta]="meta()" (apply)="store.browseWith($event)" (resetFilters)="store.browseWith({})" />
    <chip-choice label="Class" [options]="classes()" [selected]="store.filter().class || ''" (pick)="pickClass($event)" />
    @if (meta()?.status?.hidden?.length) {
      <p class="muted">{{ meta()!.status.hidden.join(' and ') }} items are blurred; click one to reveal it, click again to open it.</p>
    }
    @if (res.isLoading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (data(); as d) { <list-pager [total]="d.total" [page]="d.page" (pageChange)="store.page.set($event)" /> }
    @if (res.error()) { <p class="warn">Couldn't load this page ({{ res.error()?.message }}).</p> }
    <div class="grid">
      @for (t of data()?.items; track t.hash) { <media-tile [it]="t" (open)="store.item.set({ hash: t.hash, ctx: data()!.ctx })" /> }
      @empty { @if (data()) { <p class="muted">Nothing matches.</p> } }
    </div>
    @if (data(); as d) { <list-pager [total]="d.total" [page]="d.page" (pageChange)="store.page.set($event)" /> }`,
})
export class BrowsePage {
  protected readonly store = inject(MediaStore);
  private readonly api = inject(MediaApi);
  protected readonly meta = computed(() => this.store.meta.value());

  protected readonly classes = computed<ChipOption[]>(() => [
    { value: '', label: 'all classes' },
    ...(this.meta()?.classes ?? []).map(c => ({ value: c, label: c, count: this.meta()?.class_counts?.[c] ?? 0 })),
  ]);

  protected readonly res = this.api.browse(() => params({ ...this.store.filter(), page: this.store.page() }));
  /** keep the last page on screen while the next one loads */
  protected readonly data = linkedSignal<Page | undefined, Page | undefined>({
    source: () => this.res.value(), computation: (v, prev) => v ?? prev?.value,
  });

  constructor() {
    effect(() => { this.store.page(); queueMicrotask(() => window.scrollTo(0, 0)); });
  }

  protected pickClass(c: string) { this.store.browseWith({ ...this.store.filter(), class: c || undefined } as Filter); }
}
