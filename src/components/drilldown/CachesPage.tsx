import type { useDevCaches } from '../../hooks/useDevCaches';
import {
  CACHE_GROUPS,
  CATEGORIES,
  cacheMethodLabel,
  formatAgeShort,
  isPruneTarget,
  shortenHome,
} from '../../utils/categories';
import { formatSize } from '../../utils/formatSize';
import { selectionState } from '../../utils/selection';
import { Checkbox, Chip, SizeBar, Spinner } from '../ui';
import type { CacheFilter } from '../view';
import { PageHeader, TextButton } from './PageHeader';

interface CachesPageProps {
  caches: ReturnType<typeof useDevCaches>;
  filter: CacheFilter | null;
  selectionDisabled: boolean;
  onClearFilter: () => void;
}

const ROW = 'grid grid-cols-[28px_minmax(170px,1.2fr)_minmax(120px,0.9fr)_48px_minmax(0,1.4fr)_150px] items-center gap-2';

export function CachesPage({ caches, filter, selectionDisabled, onClearFilter }: CachesPageProps) {
  const { targets, selectedIds, prunedPaths, warnings, isScanning } = caches;
  const visible = filter ? targets.filter((target) => filter.cacheKinds.includes(target.kind)) : targets;
  const total = visible.reduce((sum, target) => sum + target.reclaimable_size, 0);
  const isEstimate = visible.some(isPruneTarget);
  const shownSize = (target: (typeof targets)[number]) => (
    isPruneTarget(target) ? target.allocated_size : target.reclaimable_size
  );
  const max = visible.reduce((largest, target) => Math.max(largest, shownSize(target)), 0);
  const visibleSafe = visible.filter((target) => target.safety === 'safe').map((target) => target.path);
  const safeState = selectionState(visibleSafe, selectedIds);
  const disabled = selectionDisabled || isScanning;

  return (
    <>
      <PageHeader
        title="Developer caches"
        color={CATEGORIES.caches.color}
        total={total}
        totalIsEstimate={isEstimate}
        description="Shared caches outside your projects: package manager stores, superseded runtimes, unrotated logs. Entries with an official prune command are handed to that tool, which keeps whatever is still referenced."
        controls={(
          <>
            <TextButton onClick={() => void caches.scan()} disabled={isScanning || selectionDisabled}>
              {isScanning ? 'Scanning…' : 'Rescan caches'}
            </TextButton>
            <TextButton
              onClick={() => caches.setPathsSelected(visibleSafe, true)}
              disabled={disabled || visibleSafe.length === 0 || safeState.all}
            >
              Select safe
            </TextButton>
            <TextButton onClick={caches.deselectAll} disabled={disabled || selectedIds.size === 0}>
              Deselect all
            </TextButton>
          </>
        )}
        filter={filter ? { label: filter.label, shown: visible.length, of: targets.length, onClear: onClearFilter } : null}
      />
      {warnings.length > 0 && (
        <div className="flex-none px-6 py-2 bg-amber-50 border-b border-amber-100 text-[12px] text-amber-900">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      )}
      {caches.freedBytes > 0 && (
        <div className="flex-none px-6 py-2 bg-green-50 border-b border-green-100 text-[12px] text-green-800">
          Freed {formatSize(caches.freedBytes)}.
          {caches.lastCleanup
            .filter((result) => result.output)
            .map((result) => (
              <span key={result.path} className="block text-[11px] text-green-700 font-mono mt-0.5">{result.output}</span>
            ))}
        </div>
      )}
      <main className="flex-1 min-h-0 overflow-y-auto">
        {isScanning && targets.length === 0 && (
          <p className="px-6 py-10 flex items-center justify-center gap-2 text-slate-500">
            <Spinner /> Looking for caches…
          </p>
        )}
        {!isScanning && visible.length === 0 && (
          <p className="px-6 py-10 text-center text-slate-500">
            No developer caches found: npm, pnpm, bun, Gradle, uv and Node versions are looked for.
          </p>
        )}
        {CACHE_GROUPS.map((group) => {
          const items = visible
            .filter((target) => target.kind === group.kind)
            .sort((a, b) => shownSize(b) - shownSize(a));
          if (items.length === 0) return null;
          const groupTotal = items.reduce((sum, target) => sum + target.reclaimable_size, 0);
          const groupEstimate = items.some(isPruneTarget);
          return (
            <section key={group.kind} aria-label={group.title}>
              <header className="sticky top-0 z-10 px-4 py-2 bg-slate-50 border-y border-slate-200 flex items-baseline justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{group.title}</h2>
                  <p className="text-[11.5px] text-slate-500">{group.blurb}</p>
                </div>
                <span className="text-[12px] text-slate-500 tabular-nums whitespace-nowrap">
                  {groupEstimate ? 'at least ' : ''}{formatSize(groupTotal)}
                </span>
              </header>
              {items.map((target) => {
                const selected = selectedIds.has(target.path);
                const prune = isPruneTarget(target);
                const pruned = prunedPaths.has(target.path);
                const understated = !prune && target.logical_size > target.reclaimable_size * 1.2;
                return (
                  <label
                    key={target.path}
                    className={`block px-4 py-1.5 border-b border-slate-100 ${
                      selected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                    } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <div className={ROW}>
                      <Checkbox
                        label={`Select ${target.label}`}
                        checked={selected}
                        disabled={disabled}
                        onChange={() => caches.toggleSelection(target.path)}
                      />
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate font-medium">{target.label}</span>
                        {target.safety === 'needs_review' && <Chip tone="warn">read the note</Chip>}
                        {pruned && <Chip tone="ok">pruned</Chip>}
                      </span>
                      <span className="truncate font-mono text-[11px] text-slate-500">{cacheMethodLabel(target)}</span>
                      <span className="text-[11.5px] text-slate-500 tabular-nums">{formatAgeShort(target.last_modified)}</span>
                      <span className="truncate text-[11.5px] text-slate-400" title={target.path}>{shortenHome(target.path)}</span>
                      <span className="flex items-center justify-end gap-2 tabular-nums">
                        <SizeBar bytes={shownSize(target)} max={max} />
                        <span
                          className={`w-[66px] text-right whitespace-nowrap ${prune ? 'text-slate-400' : ''}`}
                          title={prune
                            ? (pruned
                              ? 'Size before the prune; rescan to measure it again'
                              : 'Current size. The prune keeps whatever is still referenced, so only part of this comes back.')
                            : understated
                              ? `${formatSize(target.logical_size)} nominal: shared or sparse data that deleting will not release`
                              : undefined}
                        >
                          {formatSize(shownSize(target))}
                        </span>
                      </span>
                    </div>
                    {(target.note || prune) && (
                      <p className="pl-[36px] text-[11.5px] text-slate-600">
                        {prune && (
                          <span className="text-slate-400">
                            {pruned ? 'Size before prune; rescan to re-measure. ' : 'Prune frees part of this. '}
                          </span>
                        )}
                        {target.note}
                      </p>
                    )}
                  </label>
                );
              })}
            </section>
          );
        })}
      </main>
    </>
  );
}
