import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MediaStore } from '../core/media.store';

export interface Choice { label: string; body: Record<string, string>; cls?: 'ok' | 'bad'; }

/** A row of answer buttons that POST to /api/<path> through the store (no page reload; the card dims with the choice). */
@Component({
  selector: 'media-decide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  template: `
    @for (c of choices(); track c.label) {
      <button mat-stroked-button [class]="c.cls || ''" (click)="store.decide(key(), path(), c.body, c.label)">{{ c.label }}</button>
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
