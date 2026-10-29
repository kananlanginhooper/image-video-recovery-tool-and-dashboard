import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Extra, Item } from '../../core/models';
import { sizeH, taken } from '../../shared/format';

/** Facts about one item, plugin lines (links when they carry more than label/text), its copies and its OCR text. */
@Component({
  selector: 'item-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './item-details.html',
})
export class ItemDetails {
  readonly item = input.required<Item>();
  readonly folder = output<string>();
  readonly extra = output<Extra>();
  protected readonly taken = taken;
  protected readonly sizeH = sizeH;
  protected isLink(x: Extra) { return Object.keys(x).some(k => k !== 'label' && k !== 'text'); }
}
