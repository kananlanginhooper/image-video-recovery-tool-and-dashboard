import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MediaStore } from '../core/media.store';
import { apiUrl } from '../core/media-api';
import type { Tile } from '../core/models';
import { taken } from './format';

/**
 * One thumbnail card. Hidden items (a plugin's status) are blurred: the first click reveals, the next opens.
 * Extra caption lines and answer buttons go in as content. `decision` is the store key that dims the card when answered.
 */
@Component({
  selector: 'media-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cell" [class.blur]="hidden()" [class.decided]="d() && !d()!.failed" [class.failed]="d()?.failed" [attr.data-d]="d()?.label">
      <img loading="lazy" [src]="thumb()" [alt]="hidden() ? 'Reveal' : 'Open'" tabindex="0" role="button"
           (click)="click()" (keydown.enter)="click()" (keydown.space)="$event.preventDefault(); click()">
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
