import { useState } from 'react';
import type { useMergedWorktrees } from '../../hooks/useMergedWorktrees';
import type { MergedWorktree } from '../../types';
import { CATEGORIES } from '../../utils/categories';
import { isSelectableWorktree } from '../../utils/cleanupSummary';
import { formatSize } from '../../utils/formatSize';
import { selectionState } from '../../utils/selection';
import { isCleanWorktree } from '../../utils/suggestions';
import { Checkbox, Chip, SizeBar } from '../ui';
import { PageHeader, SegmentButton, TextButton } from './PageHeader';

interface WorktreesPageProps {
  mergedWorktrees: ReturnType<typeof useMergedWorktrees>;
  total: number;
  trayMismatch: { trayCount: number; windowCount: number } | null;
  onRescan: () => void;
  busy: boolean;
  selectionDisabled: boolean;
}

type Segment = 'all' | 'clean' | 'dirty' | 'locked' | 'stale' | 'blocked';

const ROW = 'grid grid-cols-[28px_minmax(170px,1.3fr)_minmax(110px,0.8fr)_minmax(130px,1fr)_minmax(0,1.4fr)_140px] items-center gap-2';

function StatusChips({ worktree, blockedReason }: { worktree: MergedWorktree; blockedReason?: string }) {
  return (
    <span className="flex gap-1 overflow-hidden">
      {worktree.is_dirty && (
        <Chip tone="danger" title="Not in any commit: lost if you remove this worktree">Uncommitted changes</Chip>
      )}
      {worktree.is_locked && (
        <Chip tone="warn" title={worktree.lock_reason ?? 'Locked: removal disabled'}>
          Locked{worktree.lock_reason ? `: ${worktree.lock_reason}` : ''}
        </Chip>
      )}
      {blockedReason && (
        <Chip tone="warn" title={`${blockedReason}. Rescan to check it again.`}>{blockedReason}</Chip>
      )}
      {worktree.state === 'stale' && (
        <Chip title="Removing this only prunes the leftover Git entry">Registration only</Chip>
      )}
      {worktree.is_detached && <Chip>detached</Chip>}
      {worktree.has_ignored_files && !worktree.is_locked && (
        <Chip title="Ignored files are removed with the worktree">ignored files</Chip>
      )}
      {worktree.junk_file_count > 0 && !worktree.is_locked && (
        <Chip title="Untracked OS/watcher noise (.DS_Store, watcher cookies), removed with the worktree">
          {worktree.junk_file_count} junk
        </Chip>
      )}
    </span>
  );
}

export function WorktreesPage({
  mergedWorktrees,
  total,
  trayMismatch,
  onRescan,
  busy,
  selectionDisabled,
}: WorktreesPageProps) {
  const [segment, setSegment] = useState<Segment>('all');
  const { worktrees, selectedPaths, blockedReasons, diagnostics } = mergedWorktrees;
  const sorted = [...worktrees].sort((a, b) => b.size - a.size);
  const matches: Record<Segment, (worktree: MergedWorktree) => boolean> = {
    all: () => true,
    clean: (worktree) => isCleanWorktree(worktree, blockedReasons),
    dirty: (worktree) => worktree.is_dirty,
    locked: (worktree) => worktree.is_locked,
    stale: (worktree) => worktree.state === 'stale',
    blocked: (worktree) => blockedReasons.has(worktree.path),
  };
  const visible = sorted.filter(matches[segment]);
  const removable = (worktree: MergedWorktree) => isSelectableWorktree(worktree) && !blockedReasons.has(worktree.path);
  const visibleRemovable = visible.filter(removable).map((worktree) => worktree.path);
  const header = selectionState(visibleRemovable, selectedPaths);
  const max = visible.reduce((largest, worktree) => Math.max(largest, worktree.size), 0);
  const count = (key: Segment) => sorted.filter(matches[key]).length;
  const segments: Array<{ key: Segment; label: string; tone?: string }> = [
    { key: 'all', label: 'All' },
    { key: 'clean', label: 'Clean' },
    { key: 'dirty', label: 'Uncommitted', tone: 'text-red-600' },
    { key: 'locked', label: 'Locked' },
    { key: 'stale', label: 'Registration only' },
    { key: 'blocked', label: 'Changed since scan' },
  ];

  return (
    <>
      <PageHeader
        title="Merged worktrees"
        color={CATEGORIES.worktrees.color}
        total={total}
        description="Merged into a base branch (including squash merges). Removing deletes the files, including ignored files and untracked OS/watcher junk, and keeps the Git branch."
        controls={segments
          .filter((item) => item.key === 'all' || count(item.key) > 0)
          .map((item) => (
            <SegmentButton
              key={item.key}
              label={item.label}
              count={count(item.key)}
              tone={item.tone}
              active={segment === item.key}
              onClick={() => setSegment(item.key)}
            />
          ))}
      />
      {trayMismatch && (
        <div role="status" className="flex-none px-6 py-2 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900 flex items-center gap-3">
          <span>
            The menu bar counts {trayMismatch.trayCount} removable worktree{trayMismatch.trayCount === 1 ? '' : 's'} here,
            this list shows {trayMismatch.windowCount}. Worktrees changed since the last scan; this list may be out of date.
          </span>
          <button
            type="button"
            onClick={onRescan}
            disabled={busy}
            className="ml-auto h-6 px-2 rounded bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
          >
            Rescan now
          </button>
        </div>
      )}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className={`sticky top-0 z-10 ${ROW} h-7 px-4 bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500`}>
          <Checkbox
            label="Select all removable worktrees shown"
            checked={header.all}
            indeterminate={header.some}
            disabled={selectionDisabled || visibleRemovable.length === 0}
            onChange={() => mergedWorktrees.setPathsSelected(visibleRemovable, !header.all)}
          />
          <span>Branch</span>
          <span>Repository</span>
          <span>Merged</span>
          <span>Status</span>
          <span className="text-right text-slate-800">Size ▾</span>
        </div>
        {visible.length === 0 && (
          <p className="px-6 py-10 text-center text-slate-500">
            {worktrees.length === 0
              ? 'No merged worktrees found. Branches are compared with each repository’s remote base branches.'
              : 'No worktrees in this group.'}
          </p>
        )}
        {visible.map((worktree) => {
          const selected = selectedPaths.has(worktree.path);
          const blockedReason = blockedReasons.get(worktree.path);
          const disabled = !removable(worktree) || selectionDisabled;
          return (
            <label
              key={`${worktree.repository_path}:${worktree.path}`}
              title={worktree.path}
              className={`${ROW} h-[30px] px-4 border-b border-slate-100 ${
                selected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
              } ${!removable(worktree) ? 'text-slate-400' : ''} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Checkbox
                label={`Select ${worktree.branch}`}
                checked={selected}
                disabled={disabled}
                onChange={() => mergedWorktrees.toggleSelection(worktree.path)}
              />
              <span className="truncate font-medium">{worktree.branch}</span>
              <span className="truncate text-[12px] text-slate-500" title={worktree.repository_path}>
                {worktree.repository_name}
              </span>
              <span className="truncate text-[11.5px] text-slate-400">
                {worktree.state === 'stale'
                  ? `directory missing${worktree.stale_reason ? ` (${worktree.stale_reason})` : ''}`
                  : `${worktree.state === 'squashed' ? 'squash-merged' : 'merged'} → ${worktree.base_branch}`}
              </span>
              <StatusChips worktree={worktree} blockedReason={blockedReason} />
              <span className="flex items-center justify-end gap-2 tabular-nums">
                <SizeBar bytes={worktree.size} max={max} />
                <span className="w-[66px] text-right whitespace-nowrap">{formatSize(worktree.size)}</span>
              </span>
            </label>
          );
        })}
        {diagnostics.length > 0 && (
          <details className="px-6 py-3">
            <summary className="text-[12px] text-slate-500 cursor-pointer select-none">
              Base branches compared ({diagnostics.length} repositories)
            </summary>
            <ul className="mt-2 space-y-1">
              {diagnostics.map((note) => (
                <li key={note} className="text-[11px] text-slate-500 break-all">{note}</li>
              ))}
            </ul>
          </details>
        )}
        {visibleRemovable.length > 0 && (
          <div className="px-6 py-3 flex gap-2">
            <TextButton onClick={() => mergedWorktrees.deselectAll()} disabled={selectionDisabled || selectedPaths.size === 0}>
              Deselect all worktrees
            </TextButton>
          </div>
        )}
      </main>
    </>
  );
}
