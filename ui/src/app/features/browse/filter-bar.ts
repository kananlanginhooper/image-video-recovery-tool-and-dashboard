import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { Filter } from '../../core/media.store';
import type { Meta } from '../../core/models';

/** Browse filters: edits stay here until Apply; a new filter from elsewhere (chips, Folders, Counts) resets them. */
@Component({
  selector: 'browse-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule],
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.scss',
})
export class FilterBar {
  readonly filter = input.required<Filter>();
  readonly meta = input<Meta | undefined>();
  readonly apply = output<Filter>();
  readonly resetFilters = output<void>();

  protected readonly draft = linkedSignal<Filter>(() => ({ ...this.filter() }));
  /** the phone layout's Filters button (wider screens always show the fields) */
  protected readonly open = signal(false);
  protected readonly active = computed(() => Object.keys(this.filter()).length);

  protected set(k: keyof Filter, v: string) { this.draft.update(d => ({ ...d, [k]: v })); }
  protected submit() {
    const f: Filter = {};
    for (const [k, v] of Object.entries(this.draft())) if (v && v !== 'all') f[k as keyof Filter] = v;
    this.apply.emit(f);
    this.open.set(false);
  }
}
