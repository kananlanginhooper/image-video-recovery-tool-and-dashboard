import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import type { SubtypeState } from '../../core/media.store';
import { ChipChoice, ChipOption } from '../../shared/chip-choice';

/** Which subtype, which answer bucket (with counts), and for web/game assets a label filter and a random sample. */
@Component({
  selector: 'subtype-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChipChoice, MatButtonModule, MatButtonToggleModule],
  template: `
    <chip-choice label="Subtype" [options]="typeOptions()" [selected]="state().type" (pick)="changed.emit({ type: $event, status: 'match', label: '', sample: 0 })" />
    <chip-choice label="Answer" [options]="statusOptions()" [selected]="state().status" (pick)="changed.emit({ status: $event, sample: 0 })" />
    @if (state().type === 'web_game_asset') {
      <div class="row">
        <mat-button-toggle-group [value]="state().label" (change)="changed.emit({ label: $event.value })" aria-label="Label" hideSingleSelectionIndicator>
          <mat-button-toggle value="">any label</mat-button-toggle>
          <mat-button-toggle value="icon_sprite">icon/sprite</mat-button-toggle>
          <mat-button-toggle value="product_photo">product photo</mat-button-toggle>
        </mat-button-toggle-group>
        <button mat-stroked-button (click)="changed.emit({ sample: state().sample + 1 })">Random sample</button>
      </div>
    }`,
  styles: `.row { display: flex; gap: var(--app-space-3); align-items: center; flex-wrap: wrap; margin: var(--app-space-2) 0; }`,
})
export class SubtypeFilters {
  readonly state = input.required<SubtypeState>();
  readonly types = input.required<Record<string, string>>();
  readonly counts = input<Record<string, number> | undefined>();
  readonly changed = output<Partial<SubtypeState>>();

  protected readonly typeOptions = computed<ChipOption[]>(() => Object.entries(this.types()).map(([value, label]) => ({ value, label })));
  protected readonly statusOptions = computed<ChipOption[]>(() =>
    ['match', 'borderline', 'no'].map(s => ({ value: s, label: s, count: this.counts()?.[s] ?? null })));
}
