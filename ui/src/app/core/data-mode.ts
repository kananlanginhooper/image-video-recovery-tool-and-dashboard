import { DataMode } from './data-mode.types';

/**
 * Where the data comes from. This file is the real build: the app's own back end.
 * The `demo` build configuration replaces it with data-mode.demo.ts (mock data in the browser, for GitHub Pages).
 */
export const DATA_MODE: DataMode = { interceptors: [], config: null, mediaUrl: null, label: '' };
