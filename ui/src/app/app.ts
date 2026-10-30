import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, inject } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { DATA_MODE } from './core/data-mode';
import { MediaStore, VIEWS } from './core/media.store';
import { PLUGINS } from './core/plugins';
import { Viewer } from './features/viewer/viewer';

/** Media library: browse a recovered photo and video library and answer the classifier's questions about it. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatTabsModule, NgComponentOutlet, Viewer],
  template: `
    <header>
      <b class="brand">Media library</b>
      @if (demo) { <span class="demo-tag" title="Generated sample data in your browser; nothing is saved to a server">{{ demo }}</span> }
      <!-- no paging arrows: the strip scrolls with a finger (theme.scss) -->
      <nav mat-tab-nav-bar [tabPanel]="panel" [disablePagination]="true" mat-stretch-tabs="false" mat-align-tabs="start">
        @for (v of views; track v.id) {
          <a mat-tab-link [routerLink]="'/' + v.id" routerLinkActive #rla="routerLinkActive" [active]="rla.isActive">{{ v.label }}</a>
        }
      </nav>
    </header>
    <mat-tab-nav-panel #panel><main><router-outlet /></main></mat-tab-nav-panel>
    @if (store.item()) { <media-viewer /> }
    @for (o of overlays; track $index) { <ng-container *ngComponentOutlet="o" /> }`,
})
export class App {
  protected readonly store = inject(MediaStore);
  protected readonly demo = DATA_MODE.label;
  /** built-in pages with plugin pages after Folders */
  protected readonly views = [...VIEWS.slice(0, 2), ...PLUGINS.flatMap(p => p.views ?? []), ...VIEWS.slice(2)];
  protected readonly overlays = PLUGINS.flatMap(p => p.overlays ?? []);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    // the URL is the page: remember it, and close the viewer when the page changes
    const sub = inject(Router).events.subscribe(e => {
      if (!(e instanceof NavigationEnd)) return;
      const id = e.urlAfterRedirects.split(/[/?#]/).filter(Boolean)[0];
      if (id) { this.store.view.set(id); this.store.item.set(null); }
      // keep the current tab in view in the scrolling strip, once the active link is rendered
      afterNextRender(() => this.host.nativeElement.querySelector('a.mdc-tab--active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
        { injector: this.injector });
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }
}
