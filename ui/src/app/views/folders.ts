import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { MediaStore } from '../media.store';
import { num } from '../fmt';
import { FolderList } from '../types';

/** Folders: one level at a time, with a link to browse everything under a folder */
@Component({
  selector: 'media-folders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p>
      <a href="" (click)="$event.preventDefault(); store.folder.set('')">/</a>
      @for (c of crumbs(); track c.path) { / <a href="" (click)="$event.preventDefault(); store.folder.set(c.path)">{{ c.name }}</a> }
    </p>
    @if (store.folder(); as pre) {
      <p><a href="" (click)="$event.preventDefault(); store.browseWith({ folder: pre })">View everything under this folder</a>
        @if (res.value(); as d) { · {{ num(d.here) }} directly in it }</p>
    }
    @if (res.isLoading()) { <p class="muted">loading…</p> }
    @if (res.error()) { <p class="warn">Couldn't load folders ({{ res.error()?.message }}).</p> }
    @if (res.value(); as d) {
      <table class="meta">
        <tr><td>folder</td><td>items</td><td></td><td></td></tr>
        @for (r of d.folders; track r.path) {
          <tr>
            <td><a href="" (click)="$event.preventDefault(); store.folder.set(r.path)">{{ r.name }}/</a></td>
            <td>{{ num(r.n) }}</td><td>{{ num(r.v) }} video</td>
            <td><a href="" (click)="$event.preventDefault(); store.browseWith({ folder: r.path })">view all</a></td>
          </tr>
        }
      </table>
    }`,
})
export class Folders {
  protected readonly store = inject(MediaStore);
  protected readonly num = num;
  protected readonly res = httpResource<FolderList>(() => ({ url: '/api/folders', params: { prefix: this.store.folder() } }));
  protected readonly crumbs = computed(() => {
    let acc = '';
    return this.store.folder().split('/').filter(Boolean).map(name => ({ name, path: (acc += '/' + name) }));
  });
}
