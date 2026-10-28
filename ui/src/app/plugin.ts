import { Injector, Type } from '@angular/core';
import { Extra, Item } from './types';

/**
 * A UI plugin, paired with an API plugin (see app.py). The app ships with none (plugins.ts); a build with the
 * `private` configuration swaps in src/private/plugins.ts, which is not in git.
 */
export interface MediaPlugin {
  /** extra pages in the header nav, shown after Folders */
  views?: { id: string; label: string; component: Type<unknown> }[];
  /** always rendered; each shows itself when it has something open (e.g. a text viewer) */
  overlays?: Type<unknown>[];
  /** rendered under the item viewer's image, with input `item` */
  itemActions?: Type<unknown>;
  /** an item-details line from this plugin's API side was clicked (extras with more than label/text are links) */
  onExtra?: (x: Extra, item: Item, injector: Injector) => void;
}
