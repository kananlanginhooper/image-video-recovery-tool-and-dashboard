import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** "/ library / photos" with each step clickable. */
@Component({
  selector: 'folder-breadcrumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="crumbs" aria-label="Folder path">
      <a href="" (click)="$event.preventDefault(); go.emit('')">/</a>
      @for (c of crumbs(); track c.path) { <span class="sep">/</span><a href="" (click)="$event.preventDefault(); go.emit(c.path)">{{ c.name }}</a> }
    </nav>`,
  styles: `.crumbs { font: var(--app-text-lg); margin: var(--app-space-2) 0; } .sep { margin: 0 var(--app-space-1); color: var(--app-muted); }`,
})
export class Breadcrumbs {
  readonly path = input.required<string>();
  readonly go = output<string>();
  protected readonly crumbs = computed(() => {
    let acc = '';
    return this.path().split('/').filter(Boolean).map(name => ({ name, path: (acc += '/' + name) }));
  });
}
