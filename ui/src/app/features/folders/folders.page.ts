import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MediaApi } from '../../core/media-api';
import { MediaStore } from '../../core/media.store';
import { num } from '../../shared/format';
import { Breadcrumbs } from './breadcrumbs';
import { FolderTable } from './folder-table';

/** Folders: one level at a time, with a way to browse everything under a folder. */
@Component({
  selector: 'folders-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Breadcrumbs, FolderTable, MatButtonModule, MatProgressBarModule],
  template: `
    <folder-breadcrumbs [path]="store.folder()" (go)="store.folder.set($event)" />
    @if (store.folder(); as pre) {
      <p>
        <button mat-stroked-button (click)="store.browseWith({ folder: pre })">View everything under this folder</button>
        @if (res.value(); as d) { <span class="muted"> · {{ num(d.here) }} directly in it</span> }
      </p>
    }
    @if (res.isLoading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (res.error()) { <p class="warn">Couldn't load folders ({{ res.error()?.message }}).</p> }
    @if (res.value(); as d) {
      <folder-table [rows]="d.folders" (open)="store.folder.set($event)" (viewAll)="store.browseWith({ folder: $event })" />
    }`,
})
export class FoldersPage {
  protected readonly store = inject(MediaStore);
  protected readonly res = inject(MediaApi).folders(() => this.store.folder());
  protected readonly num = num;
}
