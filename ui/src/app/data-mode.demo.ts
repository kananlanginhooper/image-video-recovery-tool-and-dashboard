import { DataMode } from './data-mode.types';
import { mockApi, mockMedia } from './demo/mock-api';

/**
 * The `demo` build's data source (replaces data-mode.ts): a generated library answered in the browser, no back end.
 * Built to docs/ for GitHub Pages with `npm run build:demo`.
 */
export const DATA_MODE: DataMode = {
  interceptors: [mockApi],
  config: { apiBase: '/api/', basePath: './', publicUrl: '', frameParents: [], login: { enabled: false, issuer: '', clientId: '' } },
  mediaUrl: mockMedia,
  label: 'demo · sample data',
};
