import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { MediaStore, VIEWS } from './media.store';
import { PLUGINS } from './plugins';
import { Browse } from './views/browse';
import { Folders } from './views/folders';
import { Subtypes } from './views/subtypes';
import { Stats } from './views/stats';
import { Viewer } from './viewer';

/** Media library: browse a recovered photo and video library and answer the classifier's questions about it. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Browse, Folders, Subtypes, Stats, Viewer, NgComponentOutlet],
  template: `
    <header>
      <b>Media library</b>
      <nav>
        @for (v of views; track v.id) {
          <a href="" [class.on]="store.view() === v.id" (click)="$event.preventDefault(); go(v.id)">{{ v.label }}</a>
        }
      </nav>
    </header>
    <main>
      @switch (store.view()) {
        @case ('browse') { <media-browse /> }
        @case ('folders') { <media-folders /> }
        @case ('subtypes') { <media-subtypes /> }
        @case ('stats') { <media-stats /> }
        @default { @if (pluginView(); as c) { <ng-container *ngComponentOutlet="c" /> } @else { <media-browse /> } }
      }
    </main>
    @if (store.item()) { <media-viewer /> }
    @for (o of overlays; track $index) { <ng-container *ngComponentOutlet="o" /> }`,
})
export class App {
  protected readonly store = inject(MediaStore);
  private readonly extra = PLUGINS.flatMap(p => p.views ?? []);
  /** built-in pages with plugin pages after Folders */
  protected readonly views = [...VIEWS.slice(0, 2), ...this.extra, ...VIEWS.slice(2)];
  protected readonly overlays = PLUGINS.flatMap(p => p.overlays ?? []);
  protected readonly pluginView = computed(() => this.extra.find(v => v.id === this.store.view())?.component);

  protected go(id: string) {
    this.store.item.set(null); this.store.view.set(id);
  }
}
