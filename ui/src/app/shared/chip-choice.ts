import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { num } from './format';

export interface ChipOption { value: string; label: string; count?: number | null; }

/** A row of single-choice chips (filters like class, subtype, status), with optional counts. */
@Component({
  selector: 'chip-choice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatChipsModule],
  template: `
    <mat-chip-listbox [value]="selected()" [hideSingleSelectionIndicator]="true" [attr.aria-label]="label()"
                      (change)="$event.value !== undefined && pick.emit($event.value)">
      @for (o of options(); track o.value) {
        <mat-chip-option [value]="o.value" [selectable]="o.value !== selected()">
          {{ o.label }}@if (o.count !== undefined && o.count !== null) { <span class="count">{{ num(o.count) }}</span> }
        </mat-chip-option>
      }
    </mat-chip-listbox>`,
  styles: `.count { margin-left: var(--app-space-1); opacity: .75; font-variant-numeric: tabular-nums; }`,
})
export class ChipChoice {
  readonly options = input.required<ChipOption[]>();
  readonly selected = input<string>('');
  readonly label = input('');
  readonly pick = output<string>();
  protected readonly num = num;
}
