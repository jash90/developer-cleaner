/**
 * The overview's "Suggestions" column: a few decisions made out of hundreds of rows.
 *
 * Any rule here that can select things is a safety surface, so the rules are pure and tested
 * (`suggestions.test.mjs`) and follow three limits:
 *
 * - A one-click "Select" is offered only for low-risk suggestions within one category whose
 *   items can each be removed without losing anything that is not recreated: clean merged
 *   worktrees (never dirty, locked, stale or blocked ones) and abandoned stores the backend
 *   marked safe.
 * - Build folders are never selected by a suggestion, and no suggestion spans two kinds for
 *   selection: what a delete costs differs a lot between kinds. Build-folder suggestions only
 *   open the drill-down filtered to them, where each kind is ticked on its own.
 * - Costly or mixed suggestions (Rust targets, package manager caches, which can carry a note)
 *   also only open the filtered drill-down.
 *
 * `guardSelection` re-checks a "Select" against the current rows at click time, so a list
 * that changed since the suggestion was computed cannot widen what gets selected.
 */
import type { ArtifactKind, CacheKind } from '../types';
import { buildKindInfo } from './categories.ts';
import { isSelectableWorktree } from './cleanupSummary.ts';

export interface SuggestionArtifact {
  path: string;
  kind: ArtifactKind;
  reclaimable_size: number;
  last_modified: number | null;
}

export interface SuggestionWorktree {
  path: string;
  size: number;
  is_dirty: boolean;
  is_locked: boolean;
  has_ignored_files: boolean;
  state: string;
}

export interface SuggestionCache {
  path: string;
  kind: CacheKind;
  label: string;
  reclaimable_size: number;
  safety: string;
  cleanup: { type: string };
  note: string | null;
}

export interface SuggestionInput {
  /** `null` while that scan has not returned: no suggestion is made from a list not yet known. */
  buildArtifacts: SuggestionArtifact[] | null;
  worktrees: SuggestionWorktree[] | null;
  /** Worktrees a removal refused since the scan; the same click would fail again. */
  blockedWorktreePaths: ReadonlySet<string> | ReadonlyMap<string, unknown>;
  caches: SuggestionCache[] | null;
  nowSeconds: number;
}

/** What a "Review" opens: a drill-down narrowed to the suggestion's rows. */
export type ReviewFilter =
  | { category: 'build'; kinds: ArtifactKind[]; untouchedForDays?: number; label: string }
  | { category: 'caches'; cacheKinds: CacheKind[]; label: string };

export type SuggestionAction =
  | { type: 'select'; category: 'worktrees' | 'caches'; paths: string[] }
  | { type: 'review'; filter: ReviewFilter };

export interface Suggestion {
  id: 'abandoned-stores' | 'cache-build-folders' | 'clean-worktrees' | 'old-rust-targets'
    | 'package-manager-caches';
  category: 'build' | 'caches' | 'worktrees';
  title: string;
  why: string;
  /** Reclaimable bytes, the figure the rows show. */
  size: number;
  /** The size is a floor: part of it is handed to a tool's own prune. */
  isEstimate: boolean;
  count: number;
  action: SuggestionAction;
}

/** Build kinds whose folders are only a tool's cache and come back on the next run. */
export const CACHE_LIKE_BUILD_KINDS: ArtifactKind[] = ['nx_cache', 'turbo_cache', 'coverage', 'expo_state'];

/** "Untouched for 2+ months": Rust targets older than this are offered for review. */
export const OLD_RUST_TARGET_DAYS = 60;

/** A merged worktree whose removal loses nothing that is not in Git. */
export function isCleanWorktree(
  worktree: SuggestionWorktree,
  blocked: SuggestionInput['blockedWorktreePaths'],
): boolean {
  return isSelectableWorktree(worktree)
    && !worktree.is_dirty
    && worktree.state !== 'stale'
    && !blocked.has(worktree.path);
}

/** An abandoned store the backend marked safe and deletes outright, so the size is certain. */
export function isSafeAbandonedStore(cache: SuggestionCache): boolean {
  return cache.kind === 'orphaned_store'
    && cache.safety === 'safe'
    && cache.cleanup.type !== 'external_command';
}

export function isUntouchedFor(
  lastModified: number | null,
  days: number,
  nowSeconds: number,
): boolean {
  // An unknown age is not an old one.
  if (lastModified === null) return false;
  return (nowSeconds - lastModified) / 86_400 >= days;
}

const sum = <T>(items: T[], size: (item: T) => number) => items.reduce(
  (total, item) => total + size(item),
  0,
);

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function abandonedStores(caches: SuggestionCache[]): Suggestion | null {
  const stores = caches.filter(isSafeAbandonedStore);
  if (stores.length === 0) return null;
  return {
    id: 'abandoned-stores',
    category: 'caches',
    title: stores.length === 1 ? stores[0].label : `${stores.length} abandoned stores`,
    why: `Left behind when a tool moved its default location. Nothing reads ${stores.length === 1 ? 'it' : 'them'}.`,
    size: sum(stores, (store) => store.reclaimable_size),
    isEstimate: false,
    count: stores.length,
    action: { type: 'select', category: 'caches', paths: stores.map((store) => store.path) },
  };
}

function cacheBuildFolders(artifacts: SuggestionArtifact[]): Suggestion | null {
  const matching = artifacts.filter((artifact) => CACHE_LIKE_BUILD_KINDS.includes(artifact.kind));
  if (matching.length === 0) return null;
  const kinds = CACHE_LIKE_BUILD_KINDS.filter((kind) => matching.some((item) => item.kind === kind));
  const folders = kinds.map((kind) => buildKindInfo(kind).folder);
  return {
    id: 'cache-build-folders',
    category: 'build',
    title: 'Cache-type build folders',
    why: `${matching.length} ${joinWords(folders)} ${plural(matching.length, 'folder')}. Recreated on the next run.`,
    size: sum(matching, (artifact) => artifact.reclaimable_size),
    isEstimate: false,
    count: matching.length,
    // Several kinds: review only, where each kind is ticked on its own.
    action: { type: 'review', filter: { category: 'build', kinds, label: 'Cache-type build folders' } },
  };
}

function cleanWorktrees(
  worktrees: SuggestionWorktree[],
  blocked: SuggestionInput['blockedWorktreePaths'],
): Suggestion | null {
  const clean = worktrees.filter((worktree) => isCleanWorktree(worktree, blocked));
  if (clean.length === 0) return null;
  const withIgnored = clean.filter((worktree) => worktree.has_ignored_files).length;
  const ignoredNote = withIgnored === 0
    ? ''
    : ` Ignored files in ${withIgnored} of them go too.`;
  return {
    id: 'clean-worktrees',
    category: 'worktrees',
    title: `${clean.length} clean merged ${plural(clean.length, 'worktree')}`,
    why: `No uncommitted changes, not locked. Git branches are kept.${ignoredNote}`,
    size: sum(clean, (worktree) => worktree.size),
    isEstimate: false,
    count: clean.length,
    action: { type: 'select', category: 'worktrees', paths: clean.map((worktree) => worktree.path) },
  };
}

function oldRustTargets(artifacts: SuggestionArtifact[], nowSeconds: number): Suggestion | null {
  const old = artifacts.filter((artifact) => (
    artifact.kind === 'cargo_target'
    && isUntouchedFor(artifact.last_modified, OLD_RUST_TARGET_DAYS, nowSeconds)
  ));
  if (old.length === 0) return null;
  return {
    id: 'old-rust-targets',
    category: 'build',
    title: 'Rust targets untouched for 2+ months',
    why: `${old.length} ${plural(old.length, 'folder')}. The next build compiles from scratch; release binaries kept only here go too.`,
    size: sum(old, (artifact) => artifact.reclaimable_size),
    isEstimate: false,
    count: old.length,
    // Costly to rebuild: review only.
    action: {
      type: 'review',
      filter: {
        category: 'build',
        kinds: ['cargo_target'],
        untouchedForDays: OLD_RUST_TARGET_DAYS,
        label: 'Rust targets untouched for 2+ months',
      },
    },
  };
}

function packageManagerCaches(caches: SuggestionCache[]): Suggestion | null {
  const matching = caches.filter((cache) => cache.kind === 'package_manager');
  if (matching.length === 0) return null;
  const withNote = matching.filter((cache) => cache.safety === 'needs_review' || cache.note);
  // Names a few; past that a list of paths is harder to read than a count.
  const noteText = withNote.length === 0
    ? ''
    : withNote.length > 2
      ? ` ${withNote.length} of them have notes to read first.`
      : ` ${joinWords(withNote.map((cache) => cache.label))} ${withNote.length === 1 ? 'has a note' : 'have notes'} to read first.`;
  return {
    id: 'package-manager-caches',
    category: 'caches',
    title: 'Package manager caches',
    why: `Re-downloaded on demand.${noteText}`,
    size: sum(matching, (cache) => cache.reclaimable_size),
    isEstimate: matching.some((cache) => cache.cleanup.type === 'external_command'),
    count: matching.length,
    action: {
      type: 'review',
      filter: { category: 'caches', cacheKinds: ['package_manager'], label: 'Package manager caches' },
    },
  };
}

/** Safest first: the order below is the order shown. */
export function computeSuggestions(input: SuggestionInput): Suggestion[] {
  const { buildArtifacts, worktrees, caches } = input;
  return [
    caches ? abandonedStores(caches) : null,
    buildArtifacts ? cacheBuildFolders(buildArtifacts) : null,
    worktrees ? cleanWorktrees(worktrees, input.blockedWorktreePaths) : null,
    buildArtifacts ? oldRustTargets(buildArtifacts, input.nowSeconds) : null,
    caches ? packageManagerCaches(caches) : null,
  ].filter((suggestion): suggestion is Suggestion => suggestion !== null);
}

/**
 * The paths a "Select" may add right now: the suggestion's paths that still exist and still
 * pass its rule. Anything else (a review action, a row that turned dirty or was blocked) adds
 * nothing.
 */
export function guardSelection(
  action: SuggestionAction,
  current: Pick<SuggestionInput, 'worktrees' | 'caches' | 'blockedWorktreePaths'>,
): string[] {
  if (action.type !== 'select') return [];
  const requested = new Set(action.paths);
  if (action.category === 'worktrees') {
    return (current.worktrees ?? [])
      .filter((worktree) => requested.has(worktree.path))
      .filter((worktree) => isCleanWorktree(worktree, current.blockedWorktreePaths))
      .map((worktree) => worktree.path);
  }
  return (current.caches ?? [])
    .filter((cache) => requested.has(cache.path))
    .filter(isSafeAbandonedStore)
    .map((cache) => cache.path);
}
