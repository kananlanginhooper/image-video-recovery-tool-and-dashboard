import type { components } from './api-types';

/** Shapes of the API's answers, generated from its OpenAPI (npm run gen:api) instead of written by hand. */
type Schemas = components['schemas'];

export type Tile = Schemas['Tile'];
export type BrowsePage = Schemas['BrowsePage'];
export type FolderRow = Schemas['FolderRow'];
export type FolderList = Schemas['FolderList'];
export type Meta = Schemas['Meta'];
export type SubtypeItem = Schemas['SubtypeItem'];
export type SubtypePage = Schemas['SubtypePage'];
export type Extra = Schemas['Extra'];
export type Item = Schemas['Item'];
export type StatsRow = Schemas['StatsRow'];
export type Stats = Schemas['Stats'];
export type RuntimeConfig = Schemas['RuntimeConfig'];
