import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';

/** Page navigation for long lists (1-based page in and out). */
@Component({
  selector: 'list-pager',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatPaginatorModule],
  template: `
    <mat-paginator [length]="total()" [pageSize]="pageSize()" [pageIndex]="page() - 1" [hidePageSize]="true"
                   [showFirstLastButtons]="true" (page)="go($event)" aria-label="Pages" />`,
  styles: `:host { display: block; } mat-paginator { background: transparent; }`,
})
export class ListPager {
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input(120);
  readonly pageChange = output<number>();

  protected go(e: PageEvent) { this.pageChange.emit(e.pageIndex + 1); }
}
