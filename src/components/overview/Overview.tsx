import type { useCleanup } from '../../hooks/useCleanup';
import type { useDevCaches } from '../../hooks/useDevCaches';
import { useWindowWidth } from '../../hooks/useClock';
import type { DiskSpace } from '../../types';
import { CATEGORIES } from '../../utils/categories';
import { isSelectableWorktree, removeCandidatesWithinPaths } from '../../utils/cleanupSummary';
import { emptyListMessage, type ListState } from '../../utils/scanState';
import type { ReviewFilter, Suggestion } from '../../utils/suggestions';
import { Chip } from '../ui';
import type { View } from '../view';
import { CategoryCard, type CardState } from './CategoryCard';
import { Hero, type HeroPart, type HeroScan } from './Hero';
import { SuggestionList } from './SuggestionList';
import {
  buildArtifactRows,
  cacheRows,
  managerSummary,
  nodeModulesRows,
  worktreeRows,
} from './cardRows';

type Cleanup = ReturnType<typeof useCleanup>;
type Caches = ReturnType<typeof useDevCaches>;

interface OverviewProps {
  cleanup: Cleanup;
  caches: Caches;
  disk: DiskSpace | null;
  scan: HeroScan | null;
  scanLabel: string | null;
  onNavigate: (view: View) => void;
  onChooseFolder: () => void;
}

/** Wide windows show more of each list; the threshold is the one the design was drawn for. */
const WIDE_WINDOW = 1600;

const sumOf = <T,>(items: T[], size: (item: T) => number) => items.reduce((total, item) => total + size(item), 0);

export function Overview({
  cleanup,
  caches,
  disk,
  scan,
  scanLabel,
  onNavigate,
  onChooseFolder,
}: OverviewProps) {
  const width = useWindowWidth();
  const maxRows = width >= WIDE_WINDOW ? 9 : 5;
  const {
    nodeModules,
    buildArtifacts,
    mergedWorktrees,
    scanPath,
    isScanning,
    isScanningFolders,
    isScanningWorktrees,
    isDeleting,
    totals,
    suggestions,
  } = cleanup;
  const blocked = mergedWorktrees.blockedReasons;
  const projectSelectionDisabled = isDeleting || isScanning;

  const chooseFolder = (
    <button
      type="button"
      onClick={onChooseFolder}
      disabled={isScanning || isDeleting}
      className="h-7 px-2.5 rounded-md bg-blue-600 text-white text-[12px] font-medium hover:bg-blue-700 disabled:opacity-50"
    >
      Choose Folder…
    </button>
  );
  const projectState = (state: ListState, what: string): CardState => {
    switch (state) {
      case 'waiting':
        return { kind: 'waiting', message: emptyListMessage(state, what, ''), action: chooseFolder };
      case 'scanning':
        return { kind: 'scanning' };
      // Its list is empty because the scan did not finish, not because nothing was found.
      case 'stopped':
      case 'failed':
        return { kind: 'failed', message: emptyListMessage(state, what, '') };
      case 'ready':
        return { kind: 'ready' };
    }
  };
  const folderState = projectState(cleanup.folderListState, 'node_modules and build folders');
  const worktreeState = projectState(cleanup.worktreeListState, 'merged worktrees');
  const cacheState: CardState = caches.isScanning ? { kind: 'scanning' } : { kind: 'ready' };

  const part = (state: CardState, bytes: number): HeroPart => {
    if (state.kind === 'scanning') return 'scanning';
    if (state.kind !== 'ready') return 'unscanned';
    return bytes;
  };

  const removableWorktrees = mergedWorktrees.worktrees.filter((worktree) => (
    isSelectableWorktree(worktree) && !blocked.has(worktree.path)
  ));
  const removableWorktreePaths = removableWorktrees.map((worktree) => worktree.path);
  const insideWorktrees = (items: Array<{ path: string; reclaimable_size: number }>) => items.length
    - removeCandidatesWithinPaths(
      items.map((item) => ({ path: item.path, size: item.reclaimable_size })),
      removableWorktreePaths,
    ).length;
  const nodeInside = insideWorktrees(nodeModules.folders);
  const buildInside = insideWorktrees(buildArtifacts.targets);
  const insideNote = 'Counted once, under Merged worktrees, in the total at the top';

  const worktreeCounts = {
    dirty: mergedWorktrees.worktrees.filter((worktree) => worktree.is_dirty).length,
    locked: mergedWorktrees.worktrees.filter((worktree) => worktree.is_locked).length,
    stale: mergedWorktrees.worktrees.filter((worktree) => worktree.state === 'stale').length,
    blocked: blocked.size,
  };
  const kindCount = new Set(buildArtifacts.targets.map((target) => target.kind)).size;
  const cachesToRead = caches.targets.filter((target) => target.safety === 'needs_review').length;

  const isApplied = (suggestion: Suggestion) => {
    const { action } = suggestion;
    if (action.type !== 'select' || action.paths.length === 0) return false;
    const selected = action.category === 'worktrees' ? mergedWorktrees.selectedPaths : caches.selectedIds;
    return action.paths.every((path) => selected.has(path));
  };
  const review = (filter: ReviewFilter) => {
    if (filter.category === 'build') {
      onNavigate({
        page: 'build',
        filter: { kinds: filter.kinds, untouchedForDays: filter.untouchedForDays, label: filter.label },
      });
    } else {
      onNavigate({ page: 'caches', filter: { cacheKinds: filter.cacheKinds, label: filter.label } });
    }
  };
  const footnote = !scanPath
    ? 'Choose a folder for suggestions about node_modules, build folders and worktrees.'
    : isScanningFolders || isScanningWorktrees
      ? 'More suggestions when the folder scan finishes.'
      : null;

  const columns = width >= WIDE_WINDOW
    ? 'grid-cols-[400px_1fr_1fr]'
    : width >= 1100 ? 'grid-cols-[340px_1fr_1fr]' : 'grid-cols-[250px_1fr_1fr]';

  return (
    <>
      <Hero
        parts={{
          build: part(folderState, totals.buildArtifacts),
          caches: part(cacheState, totals.caches),
          worktrees: part(worktreeState, totals.worktrees),
          node: part(folderState, totals.nodeModules),
        }}
        total={totals.total}
        totalIsEstimate={cleanup.totalsAreEstimate}
        disk={disk}
        scanLabel={scanLabel}
        scan={scan}
      />
      <div className={`flex-1 min-h-0 p-4 grid gap-4 grid-rows-2 ${columns}`}>
        <div className="row-span-2 min-h-0">
          <SuggestionList
            suggestions={suggestions}
            footnote={footnote}
            isApplied={isApplied}
            onSelect={cleanup.applySuggestion}
            onReview={review}
            actionsDisabled={isScanning || isDeleting || caches.isScanning}
          />
        </div>
        <CategoryCard
          label={CATEGORIES.build.label}
          color={CATEGORIES.build.color}
          count={buildArtifacts.targets.length}
          total={sumOf(buildArtifacts.targets, (target) => target.reclaimable_size)}
          flags={(
            <>
              {kindCount > 0 && <Chip>{kindCount} {kindCount === 1 ? 'kind' : 'kinds'}</Chip>}
              {buildInside > 0 && <Chip title={insideNote}>{buildInside} inside worktrees</Chip>}
            </>
          )}
          selectedCount={buildArtifacts.selectedPaths.size}
          rows={buildArtifactRows(buildArtifacts.targets, buildArtifacts.selectedPaths)}
          maxRows={maxRows}
          state={folderState}
          emptyMessage="No build folders in this folder."
          onToggle={buildArtifacts.toggleSelection}
          onReviewAll={() => onNavigate({ page: 'build', filter: null })}
          selectionDisabled={projectSelectionDisabled}
        />
        <CategoryCard
          label={CATEGORIES.caches.label}
          color={CATEGORIES.caches.color}
          count={caches.targets.length}
          total={totals.caches}
          totalIsEstimate={cleanup.totalsAreEstimate}
          flags={cachesToRead > 0 ? <Chip tone="warn">{cachesToRead} to read</Chip> : null}
          selectedCount={caches.selectedIds.size}
          rows={cacheRows(caches.targets, caches.selectedIds)}
          maxRows={maxRows}
          state={cacheState}
          emptyMessage="No developer caches found."
          onToggle={caches.toggleSelection}
          onReviewAll={() => onNavigate({ page: 'caches', filter: null })}
          selectionDisabled={isDeleting || caches.isScanning}
        />
        <CategoryCard
          label={CATEGORIES.worktrees.label}
          color={CATEGORIES.worktrees.color}
          count={mergedWorktrees.worktrees.length}
          total={totals.worktrees}
          flags={(
            <>
              {worktreeCounts.dirty > 0 && <Chip tone="danger">{worktreeCounts.dirty} uncommitted</Chip>}
              {worktreeCounts.locked > 0 && <Chip tone="warn">{worktreeCounts.locked} locked</Chip>}
              {worktreeCounts.blocked > 0 && <Chip tone="warn">{worktreeCounts.blocked} changed since scan</Chip>}
              {worktreeCounts.stale > 0 && <Chip>{worktreeCounts.stale} registration only</Chip>}
            </>
          )}
          selectedCount={mergedWorktrees.selectedPaths.size}
          rows={worktreeRows(mergedWorktrees.worktrees, mergedWorktrees.selectedPaths, blocked)}
          maxRows={maxRows}
          state={worktreeState}
          emptyMessage="No merged worktrees in this folder."
          onToggle={mergedWorktrees.toggleSelection}
          onReviewAll={() => onNavigate({ page: 'worktrees' })}
          selectionDisabled={projectSelectionDisabled}
        />
        <CategoryCard
          label={CATEGORIES.node.label}
          color={CATEGORIES.node.color}
          count={nodeModules.folders.length}
          total={sumOf(nodeModules.folders, (folder) => folder.reclaimable_size)}
          flags={(
            <>
              {nodeModules.folders.length > 0 && <Chip>{managerSummary(nodeModules.folders)}</Chip>}
              {nodeInside > 0 && <Chip title={insideNote}>{nodeInside} inside worktrees</Chip>}
            </>
          )}
          selectedCount={nodeModules.selectedPaths.size}
          rows={nodeModulesRows(nodeModules.folders, nodeModules.selectedPaths, scanPath)}
          maxRows={maxRows}
          state={folderState}
          emptyMessage="No node_modules in this folder."
          onToggle={nodeModules.toggleSelection}
          onReviewAll={() => onNavigate({ page: 'node' })}
          selectionDisabled={projectSelectionDisabled}
        />
      </div>
    </>
  );
}
