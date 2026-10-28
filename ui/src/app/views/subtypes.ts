import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { MediaStore, SubtypeState } from '../media.store';
import { Choice, MediaDecide, MediaTile } from '../ui';
import { num, params } from '../fmt';
import { SubtypePage } from '../types';

/** Review subtypes: cheap-signal guesses at web/game assets and iOS Messages screenshots */
@Component({
  selector: 'media-subtypes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MediaTile, MediaDecide],
  template: `
    <div class="chips">
      @for (t of types(); track t.k) {
        <a class="chip" [class.on]="s().type === t.k" href="" (click)="$event.preventDefault(); set({ type: t.k, status: 'match', label: '', sample: 0 })">{{ t.label }}</a>
      }
    </div>
    <div class="chips">
      @for (t of tabs; track t) {
        <a class="chip" [class.on]="s().status === t" href="" (click)="$event.preventDefault(); set({ status: t, sample: 0 })">{{ t }} {{ num(res.value()?.counts?.[t]) }}</a>
      }
    </div>
    <p class="muted">Cheap-signal / visual guesses, not certain. <b>Yes</b> = this really is that kind of image, <b>No</b> = it isn't.
      Your answers are kept and used to tune it. Up to 120 shown
      @if (s().type === 'web_game_asset') {
        · label:
        <a href="" [class.b]="!s().label" (click)="$event.preventDefault(); set({ label: '' })">any</a>
        <a href="" [class.b]="s().label === 'icon_sprite'" (click)="$event.preventDefault(); set({ label: 'icon_sprite' })">icon/sprite</a>
        <a href="" [class.b]="s().label === 'product_photo'" (click)="$event.preventDefault(); set({ label: 'product_photo' })">product photo</a>
        · <a href="" (click)="$event.preventDefault(); set({ sample: s().sample + 1 })">random sample</a>
      }.
    </p>
    @if (res.isLoading()) { <p class="muted">loading…</p> }
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
export class Subtypes {
  protected readonly store = inject(MediaStore);
  protected readonly num = num;
  protected readonly tabs = ['match', 'borderline', 'no'];
  protected readonly choices: Choice[] = [{ label: 'Yes', body: { verdict: 'match' }, cls: 'ok' }, { label: 'No', body: { verdict: 'no' }, cls: 'bad' }];
  protected readonly s = this.store.subtype;
  protected readonly types = computed(() =>
    Object.entries(this.store.meta.value()?.subtypes ?? { web_game_asset: 'Web / game assets', ios_messages: 'iOS Messages' }).map(([k, label]) => ({ k, label })));
  protected readonly res = httpResource<SubtypePage>(() => ({
    url: '/api/subtypes',
    // sample is a counter so each "random sample" click is a new request; the API only checks that it's set
    params: params({ type: this.s().type, status: this.s().status, label: this.s().label, sample: this.s().sample || null }),
  }));

  protected set(p: Partial<SubtypeState>) { this.s.update(s => ({ ...s, ...p })); }
}
