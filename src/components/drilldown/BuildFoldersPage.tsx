import type { useBuildArtifacts } from '../../hooks/useBuildArtifacts';
import type { BuildArtifact } from '../../types';
import { BUILD_KINDS, CATEGORIES, formatAgeShort, relativeTo } from '../../utils/categories';
import { formatSize } from '../../utils/formatSize';
import { emptyListMessage, type ListState } from '../../utils/scanState';
import { selectionState } from '../../utils/selection';
import { isUntouchedFor } from '../../utils/suggestions';
import { Checkbox, SizeBar } from '../ui';
import type { BuildFilter } from '../view';
import { PageHeader, TextButton } from './PageHeader';

interface BuildFoldersPageProps {
  buildArtifacts: ReturnType<typeof useBuildArtifacts>;
  filter: BuildFilter | null;
  /** When the list was built, so "untouched for" means the same as in the suggestion. */
  listBuiltAt: number;
  scanPath: string | null;
  /** Whether the list is a finished scan's answer, so an empty one is not read as "none found". */
  state: ListState;
  selectionDisabled: boolean;
  onClearFilter: () => void;
}

const ROW = 'grid grid-cols-[28px_minmax(140px,1fr)_minmax(160px,2fr)_56px_140px] items-center gap-2';

export function BuildFoldersPage({
  buildArtifacts,
  filter,
  listBuiltAt,
  scanPath,
  state,
  selectionDisabled,
  onClearFilter,
}: BuildFoldersPageProps) {
  const { targets, selectedPaths } = buildArtifacts;
  const passes = (artifact: BuildArtifact) => !filter || (
    filter.kinds.includes(artifact.kind)
    && (filter.untouchedForDays === undefined
      || isUntouchedFor(artifact.last_modified, filter.untouchedForDays, listBuiltAt / 1000))
  );
  const visible = targets.filter(passes);
  const groups = BUILD_KINDS
    .map((info) => ({ ...info, items: visible.filter((artifact) => artifact.kind === info.kind) }))
    .filter((group) => group.items.length > 0);
  const total = visible.reduce((sum, artifact) => sum + artifact.reclaimable_size, 0);
  const max = visible.reduce((largest, artifact) => Math.max(largest, artifact.reclaimable_size), 0);

  return (
    <>
      <PageHeader
        title="Build folders"
        color={CATEGORIES.build.color}
        total={total}
        description="Offered only where the tool that made the folder left its marks beside and inside it, and never when Git tracks anything inside. Select each kind on its own: what a delete costs differs a lot between them."
        controls={(
          <TextButton
            onClick={buildArtifacts.deselectAll}
            disabled={selectionDisabled || selectedPaths.size === 0}
          >
            Deselect all
          </TextButton>
        )}
        filter={filter ? { label: filter.label, shown: visible.length, of: targets.length, onClear: onClearFilter } : null}
      />
      <main className="flex-1 min-h-0 overflow-y-auto">
        {groups.length === 0 && (
          <p className="px-6 py-10 text-center text-slate-500">
            {emptyListMessage(state, 'build folders', 'No build folders to show.')}
          </p>
        )}
        {groups.map((group) => {
          const paths = group.items.map((artifact) => artifact.path);
          const header = selectionState(paths, selectedPaths);
          const groupTotal = group.items.reduce((sum, artifact) => sum + artifact.reclaimable_size, 0);
          const ofKind = targets.filter((artifact) => artifact.kind === group.kind).length;
          return (
            <section key={group.kind} aria-label={group.label}>
              {/* Sticky, so what a delete of this kind costs stays in view beside its rows. */}
              <label className="sticky top-0 z-10 flex items-start gap-3 px-4 py-2 bg-slate-50 border-y border-slate-200 cursor-pointer">
                <Checkbox
                  label={`Select all ${group.label} folders${filter ? ' shown' : ''}`}
                  checked={header.all}
                  indeterminate={header.some}
                  disabled={selectionDisabled}
                  onChange={() => buildArtifacts.setKindPathsSelected(group.kind, paths, !header.all)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-semibold">{group.label}</span>
                    <code className="text-[11.5px] text-slate-500">{group.folder}</code>
                    <span className="text-[12px] text-slate-500 tabular-nums">
                      {group.items.length}{group.items.length !== ofKind ? ` of ${ofKind}` : ''}
                      {' · '}{formatSize(groupTotal)}
                    </span>
                    {header.count > 0 && (
                      <span className="text-[11px] text-blue-700 tabular-nums">{header.count} selected</span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-slate-600">
                    <span className="font-medium text-slate-700">What you lose: </span>{group.cost}
                  </p>
                </div>
              </label>
              {group.items.map((artifact) => {
                const selected = selectedPaths.has(artifact.path);
                return (
                  <label
                    key={artifact.path}
                    title={artifact.path}
                    className={`${ROW} h-[30px] px-4 border-b border-slate-100 ${
                      selected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                    } ${selectionDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <Checkbox
                      label={`Select ${group.folder} in ${artifact.parent_project}`}
                      checked={selected}
                      disabled={selectionDisabled}
                      onChange={() => buildArtifacts.toggleSelection(artifact.path)}
                    />
                    <span className="truncate font-medium">{artifact.parent_project}</span>
                    <span className="truncate text-[12px] text-slate-500">{relativeTo(artifact.path, scanPath)}</span>
                    <span className="text-[11.5px] text-slate-500 tabular-nums">{formatAgeShort(artifact.last_modified)}</span>
                    <span className="flex items-center justify-end gap-2 tabular-nums">
                      <SizeBar bytes={artifact.reclaimable_size} max={max} />
                      <span className="w-[66px] text-right whitespace-nowrap">{formatSize(artifact.reclaimable_size)}</span>
                    </span>
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
