import type { ArtifactKind, CacheKind } from '../types';

/** Narrows the build-folder drill-down, e.g. to the rows behind one suggestion. */
export interface BuildFilter {
  kinds: ArtifactKind[];
  untouchedForDays?: number;
  label: string;
}

export interface CacheFilter {
  cacheKinds: CacheKind[];
  label: string;
}

/** The overview, or one category's full list. */
export type View =
  | { page: 'overview' }
  | { page: 'node' }
  | { page: 'build'; filter: BuildFilter | null }
  | { page: 'worktrees' }
  | { page: 'caches'; filter: CacheFilter | null };
