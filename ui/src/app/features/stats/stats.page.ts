import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MediaApi } from '../../core/media-api';
import { MediaStore } from '../../core/media.store';
import { num } from '../../shared/format';

/** Counts: items by type, class and (with a status plugin) status; each links to Browse with that filter. */
@Component({
  selector: 'stats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTableModule, MatProgressBarModule],
  template: `
    <p class="muted">Counts are cached for up to 5 minutes.</p>
    @if (res.isLoading()) { <mat-progress-bar mode="indeterminate" /><p class="muted">counting… (takes about 10 s when not cached)</p> }
    @if (res.error()) { <p class="warn">Couldn't load ({{ res.error()?.message }}).</p> }
    @if (res.value(); as d) {
      <div class="scroll-x"><table mat-table [dataSource]="d.rows" class="compact">
        <ng-container matColumnDef="grp">
          <th mat-header-cell *matHeaderCellDef>Type</th>
          <td mat-cell *matCellDef="let r">{{ r.grp }}</td>
        </ng-container>
        <ng-container matColumnDef="class">
          <th mat-header-cell *matHeaderCellDef>Class</th>
          <td mat-cell *matCellDef="let r"><a href="" (click)="$event.preventDefault(); store.browseWith({ grp: r.grp, class: r.class })">{{ r.class }}</a></td>
        </ng-container>
        <ng-container matColumnDef="st">
          <th mat-header-cell *matHeaderCellDef>{{ statusLabel() }}</th>
          <td mat-cell *matCellDef="let r">
            <a href="" (click)="$event.preventDefault(); store.browseWith({ grp: r.grp, class: r.class, status: r.st })">{{ r.st }}</a>
          </td>
        </ng-container>
        <ng-container matColumnDef="n">
          <th mat-header-cell *matHeaderCellDef class="n">Items</th>
          <td mat-cell *matCellDef="let r" class="n">{{ num(r.n) }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="cols()"></tr>
        <tr mat-row *matRowDef="let r; columns: cols()"></tr>
      </table></div>
    }`,
})
export class StatsPage {
  protected readonly store = inject(MediaStore);
  protected readonly res = inject(MediaApi).stats();
  protected readonly num = num;
  private readonly hasStatus = computed(() => !!this.store.meta.value()?.status?.values?.length);
  protected readonly statusLabel = computed(() => this.store.meta.value()?.status?.label ?? 'status');
  protected readonly cols = computed(() => (this.hasStatus() ? ['grp', 'class', 'st', 'n'] : ['grp', 'class', 'n']));
}
