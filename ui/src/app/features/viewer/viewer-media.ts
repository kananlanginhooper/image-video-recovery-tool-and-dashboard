import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { apiUrl } from '../../core/media-api';
import { MediaStore } from '../../core/media.store';
import type { Item } from '../../core/models';

/** The picture or video itself; hidden items stay blurred until clicked. */
@Component({
  selector: 'viewer-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="viewer" [class.blur]="hidden()" [attr.tabindex]="hidden() ? 0 : null" [attr.role]="hidden() ? 'button' : null"
         [attr.aria-label]="hidden() ? 'Reveal' : null" (click)="reveal()" (keydown.enter)="reveal()" (keydown.space)="reveal()">
      @if (item().grp === 'image') {
        <img [src]="src('view/')" alt="">
      } @else if (item().playable) {
        <video [src]="src('file/')" controls preload="metadata" [poster]="src('thumb/')"></video>
      } @else {
        <img [src]="src('thumb/')" alt=""><p class="muted">{{ item().kind }} doesn't play in a browser; download it below.</p>
      }
    </div>`,
})
export class ViewerMedia {
  protected readonly store = inject(MediaStore);
  readonly item = input.required<Item>();
  protected readonly hidden = computed(() => this.store.isHidden(this.item().hash, this.item().hidden));
  protected src(kind: string) { return apiUrl(kind + this.item().hash); }
  protected reveal() { if (this.hidden()) this.store.reveal(this.item().hash); }
}
