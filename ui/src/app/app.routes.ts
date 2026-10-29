import { Routes } from '@angular/router';
import { loadStr } from './core/media.store';
import { PLUGINS } from './core/plugins';
import { BrowsePage } from './features/browse/browse.page';
import { FoldersPage } from './features/folders/folders.page';
import { StatsPage } from './features/stats/stats.page';
import { SubtypesPage } from './features/subtypes/subtypes.page';

const pluginRoutes: Routes = PLUGINS.flatMap(p => p.views ?? []).map(v => ({ path: v.id, component: v.component, title: v.label + ' · Media library' }));
const known = ['browse', 'folders', 'subtypes', 'stats', ...pluginRoutes.map(r => r.path!)];

export const routes: Routes = [
  { path: 'browse', component: BrowsePage, title: 'Browse · Media library' },
  { path: 'folders', component: FoldersPage, title: 'Folders · Media library' },
  ...pluginRoutes,
  { path: 'subtypes', component: SubtypesPage, title: 'Review subtypes · Media library' },
  { path: 'stats', component: StatsPage, title: 'Counts · Media library' },
  // anything else: the page you used last (kept across visits)
  { path: '**', redirectTo: () => { const v = loadStr('view', 'browse'); return known.includes(v) ? v : 'browse'; } },
];
