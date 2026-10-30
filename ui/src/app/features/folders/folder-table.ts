import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import type { FolderRow } from '../../core/models';
import { num } from '../../shared/format';

/** One level of folders: open one to go down, or view everything under it in Browse. */
@Component({
  selector: 'folder-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTableModule, MatButtonModule],
  template: `
    <div class="scroll-x"><table mat-table [dataSource]="rows()" class="compact">
      <ng-container matColumnDef="name">
        <th mat-header-cell *matHeaderCellDef>Folder</th>
        <td mat-cell *matCellDef="let r"><a href="" (click)="$event.preventDefault(); open.emit(r.path)">{{ r.name }}/</a></td>
      </ng-container>
      <ng-container matColumnDef="n">
        <th mat-header-cell *matHeaderCellDef class="n">Items</th>
        <td mat-cell *matCellDef="let r" class="n">{{ num(r.n) }}</td>
      </ng-container>
      <ng-container matColumnDef="v">
        <th mat-header-cell *matHeaderCellDef class="n">Videos</th>
        <td mat-cell *matCellDef="let r" class="n">{{ num(r.v) }}</td>
      </ng-container>
      <ng-container matColumnDef="all">
        <th mat-header-cell *matHeaderCellDef></th>
        <td mat-cell *matCellDef="let r"><button mat-button (click)="viewAll.emit(r.path)">View all</button></td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="cols"></tr>
      <tr mat-row *matRowDef="let r; columns: cols"></tr>
    </table></div>`,
})
export class FolderTable {
  readonly rows = input.required<FolderRow[]>();
  readonly open = output<string>();
  readonly viewAll = output<string>();
  protected readonly cols = ['name', 'n', 'v', 'all'];
  protected readonly num = num;
}
