import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { MediaStore } from '../media.store';
import { num } from '../fmt';
import { StatsRow } from '../types';

/** Counts: items by type, class and (with a status plugin) status; each links to Browse with that filter */
@Component({
  selector: 'media-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="muted">Counts are cached for up to 5 minutes.</p>
    @if (res.isLoading()) { <p class="muted">counting… (takes about 10 s when not cached)</p> }
    @if (res.error()) { <p class="warn">Couldn't load ({{ res.error()?.message }}).</p> }
    @if (res.value(); as d) {
      <table class="meta">
        <tr><td>type</td><td>class</td>@if (hasStatus()) {<td>{{ store.meta.value()?.status?.label }}</td>}<td>items</td></tr>
        @for (r of d.rows; track $index) {
          <tr>
            <td>{{ r.grp }}</td>
            <td><a href="" (click)="$event.preventDefault(); store.browseWith({ grp: r.grp, class: r.class })">{{ r.class }}</a></td>
            @if (hasStatus()) {
              <td><a href="" (click)="$event.preventDefault(); store.browseWith({ grp: r.grp, class: r.class, status: r.st })">{{ r.st }}</a></td>
            }
            <td class="n">{{ num(r.n) }}</td>
          </tr>
        }
      </table>
    }`,
})
export class Stats {
  protected readonly store = inject(MediaStore);
  protected readonly num = num;
  protected readonly res = httpResource<{ rows: StatsRow[] }>(() => '/api/stats');
  protected readonly hasStatus = computed(() => !!this.store.meta.value()?.status?.values?.length);
}
