import type { useNodeModules } from '../../hooks/useNodeModules';
import type { SortField } from '../../types';
import { CATEGORIES, formatAgeShort, relativeTo } from '../../utils/categories';
import { formatSize } from '../../utils/formatSize';
import { emptyListMessage, type ListState } from '../../utils/scanState';
import { selectionState } from '../../utils/selection';
import { Checkbox, SizeBar } from '../ui';
import { PageHeader, TextButton } from './PageHeader';

interface NodeModulesPageProps {
  nodeModules: ReturnType<typeof useNodeModules>;
  scanPath: string | null;
  /** Whether the list is a finished scan's answer, so an empty one is not read as "none found". */
  state: ListState;
  selectionDisabled: boolean;
}

const COLUMNS = 'grid-cols-[28px_minmax(140px,1fr)_minmax(140px,1.4fr)_64px_minmax(0,1fr)_52px_140px]';

function SortHeader({
  field,
  label,
  sort,
  onSort,
  align = 'left',
}: {
  field: SortField;
  label: string;
  sort: ReturnType<typeof useNodeModules>['sortConfig'];
  onSort: (field: SortField) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.field === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`hover:text-slate-900 ${active ? 'text-slate-800' : ''} ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {label}{active ? (sort.direction === 'asc' ? ' ▴' : ' ▾') : ''}
    </button>
  );
}

export function NodeModulesPage({ nodeModules, scanPath, state, selectionDisabled }: NodeModulesPageProps) {
  const { folders, selectedPaths, sortConfig, setSort } = nodeModules;
  const paths = folders.map((folder) => folder.path);
  const header = selectionState(paths, selectedPaths);
  const total = folders.reduce((sum, folder) => sum + folder.reclaimable_size, 0);
  const max = folders.reduce((largest, folder) => Math.max(largest, folder.reclaimable_size), 0);

  return (
    <>
      <PageHeader
        title="node_modules"
        color={CATEGORIES.node.color}
        total={total}
        description="Deleted permanently; the next install restores them. Sizes are what a delete frees: pnpm and bun hardlinks into a shared store survive it and are not counted."
        controls={(
          <>
            <TextButton onClick={nodeModules.selectAll} disabled={selectionDisabled || header.all}>Select all</TextButton>
            <TextButton onClick={nodeModules.deselectAll} disabled={selectionDisabled || header.count === 0}>Deselect all</TextButton>
          </>
        )}
      />
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className={`sticky top-0 z-10 grid ${COLUMNS} items-center gap-2 h-7 px-4 bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500`}>
          <Checkbox
            label="Select all node_modules folders"
            checked={header.all}
            indeterminate={header.some}
            disabled={selectionDisabled || paths.length === 0}
            onChange={() => nodeModules.setPathsSelected(paths, !header.all)}
          />
          <SortHeader field="name" label="Project" sort={sortConfig} onSort={setSort} />
          <span>Location</span>
          <SortHeader field="manager" label="Manager" sort={sortConfig} onSort={setSort} />
          <span>Packages</span>
          <span>Changed</span>
          <SortHeader field="size" label="Size" sort={sortConfig} onSort={setSort} align="right" />
        </div>
        {folders.length === 0 && (
          <p className="px-6 py-10 text-center text-slate-500">
            {emptyListMessage(state, 'node_modules folders', 'No node_modules folders in this folder.')}
          </p>
        )}
        {folders.map((folder) => {
          const selected = selectedPaths.has(folder.path);
          const nominal = folder.size > folder.reclaimable_size * 1.2;
          return (
            <label
              key={folder.path}
              title={folder.path}
              className={`grid ${COLUMNS} items-center gap-2 h-[30px] px-4 border-b border-slate-100 ${
                selected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
              } ${selectionDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <Checkbox
                label={`Select node_modules in ${folder.parent_project}`}
                checked={selected}
                disabled={selectionDisabled}
                onChange={() => nodeModules.toggleSelection(folder.path)}
              />
              <span className="truncate font-medium">{folder.parent_project}</span>
              <span className="truncate text-[12px] text-slate-500">
                {relativeTo(folder.path.replace(/[/\\]node_modules$/, ''), scanPath)}
              </span>
              <span className="text-[12px] text-slate-600">{folder.package_manager}</span>
              <span className="truncate text-[11.5px] text-slate-400">
                {folder.top_packages.map((pkg) => pkg.name).join(', ')}
              </span>
              <span className="text-[11.5px] text-slate-500 tabular-nums">{formatAgeShort(folder.last_modified)}</span>
              <span
                className="flex items-center justify-end gap-2 tabular-nums"
                title={nominal
                  ? `${formatSize(folder.size)} nominal. ${folder.package_manager === 'pnpm' || folder.package_manager === 'bun'
                    ? 'Most files here are hardlinks into the shared store; the data survives this delete, so only the difference is freed.'
                    : 'Shared, sparse or cloud-evicted files: deleting releases less than the nominal size.'}`
                  : undefined}
              >
                <SizeBar bytes={folder.reclaimable_size} max={max} />
                <span className="w-[66px] text-right whitespace-nowrap">{formatSize(folder.reclaimable_size)}</span>
              </span>
            </label>
          );
        })}
      </main>
    </>
  );
}
