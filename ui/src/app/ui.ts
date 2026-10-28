import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MediaStore } from './media.store';
import { apiUrl } from './api';
import { taken } from './fmt';
import { Tile } from './types';

/**
 * One thumbnail card. Hidden items (a plugin's status) are blurred: the first click reveals, the next opens.
 * Extra caption lines and answer buttons go in as content. `decision` is the store key that dims the card when answered.
 */
@Component({
  selector: 'media-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cell" [class.blur]="hidden()" [class.decided]="d() && !d()!.failed" [class.failed]="d()?.failed" [attr.data-d]="d()?.label">
      <img loading="lazy" [src]="thumb()" alt="" (click)="click()">
      @if (it().hidden) { <span class="badge w">{{ it().st }}</span> }
      <span class="badge r">{{ it().kind }}{{ it().grp === 'video' ? ' ▶' : '' }}</span>
      <div class="cap" [title]="it().path || ''">{{ cap() }}</div>
      <ng-content />
    </div>`,
})
export class MediaTile {
  private readonly store = inject(MediaStore);
  readonly it = input.required<Tile>();
  readonly decision = input('');
  readonly open = output<void>();

  protected readonly thumb = computed(() => apiUrl('thumb/' + this.it().hash));
  protected readonly hidden = computed(() => this.store.isHidden(this.it().hash, this.it().hidden));
  protected readonly d = computed(() => (this.decision() ? this.store.decisions()[this.decision()] : undefined));
  protected readonly cap = computed(() => [taken(this.it().taken), this.it().class].filter(Boolean).join(' · '));

  protected click() {
    if (this.hidden()) this.store.reveal(this.it().hash);
    else this.open.emit();
  }
}

export interface Choice { label: string; body: Record<string, string>; cls?: 'ok' | 'bad'; }

/** A row of answer buttons that POST to /api/<path> through the store (no page reload, card dims with the choice) */
@Component({
  selector: 'media-decide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (c of choices(); track c.label) {
      <button [class]="c.cls || ''" (click)="store.decide(key(), path(), c.body, c.label)">{{ c.label }}</button>
    }
    @if (d(); as d) { <span class="muted">{{ d.failed ? 'save FAILED - try again' : 'saved: ' + d.label }}</span> }`,
  host: { class: 'act' },
})
export class MediaDecide {
  protected readonly store = inject(MediaStore);
  readonly key = input.required<string>();
  readonly path = input.required<string>();
  readonly choices = input.required<Choice[]>();
  /** show the "saved: …" note next to the buttons (for places with no card to dim, like the viewer) */
  readonly note = input(false);
  protected readonly d = computed(() => (this.note() ? this.store.decisions()[this.key()] : undefined));
}
