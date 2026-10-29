import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MediaApi } from '../../core/media-api';
import { MediaStore, SubtypeState } from '../../core/media.store';
import { params } from '../../shared/format';
import { Choice, MediaDecide } from '../../shared/media-decide';
import { MediaTile } from '../../shared/media-tile';
import { SubtypeFilters } from './subtype-filters';

const DEFAULT_TYPES = { web_game_asset: 'Web / game assets', ios_messages: 'iOS Messages' };

/** Review subtypes: cheap-signal guesses at web/game assets and iOS Messages screenshots; Yes/No answers tune them. */
@Component({
  selector: 'subtypes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SubtypeFilters, MediaTile, MediaDecide, MatProgressBarModule],
  template: `
    <subtype-filters [state]="s()" [types]="types()" [counts]="res.value()?.counts" (changed)="set($event)" />
    <p class="muted">Cheap-signal / visual guesses, not certain. <b>Yes</b> = this really is that kind of image, <b>No</b> = it isn't.
      Your answers are kept and used to tune it. Up to 120 shown.</p>
    @if (res.isLoading()) { <mat-progress-bar mode="indeterminate" /> }
    @if (res.error()) { <p class="warn">Couldn't load ({{ res.error()?.message }}).</p> }
    <div class="rev">
      @for (t of res.value()?.items; track t.hash) {
        <media-tile [it]="t" [decision]="'sub:' + t.hash" (open)="store.item.set({ hash: t.hash, ctx: '' })">
          <div class="cap">conf {{ t.conf.toFixed(2) }}{{ t.label ? ' · ' + t.label : '' }}{{ t.by_you ? ' · decided by you' : '' }}</div>
          <media-decide [key]="'sub:' + t.hash" [path]="'subtype/' + t.hash + '/' + s().type" [choices]="choices" />
        </media-tile>
      } @empty { @if (res.value()) { <p class="muted">Nothing here.</p> } }
    </div>`,
})
export class SubtypesPage {
  protected readonly store = inject(MediaStore);
  protected readonly s = this.store.subtype;
  protected readonly choices: Choice[] = [{ label: 'Yes', body: { verdict: 'match' }, cls: 'ok' }, { label: 'No', body: { verdict: 'no' }, cls: 'bad' }];
  protected readonly types = computed(() => this.store.meta.value()?.subtypes ?? DEFAULT_TYPES);
  protected readonly res = inject(MediaApi).subtypes(() =>
    // sample is a counter so each "random sample" click is a new request; the API only checks that it's set
    params({ type: this.s().type, status: this.s().status, label: this.s().label, sample: this.s().sample || null }));

  protected set(p: Partial<SubtypeState>) { this.s.update(s => ({ ...s, ...p })); }
}
