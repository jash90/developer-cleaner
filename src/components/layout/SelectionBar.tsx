import { formatSize } from '../../utils/formatSize';
import { Chip, Spinner } from '../ui';

interface SelectionBarProps {
  count: number;
  size: number;
  sizeIsEstimate: boolean;
  dirtyCount: number;
  isDeleting: boolean;
  canReview: boolean;
  onClear: () => void;
  onReview: () => void;
}

/** The selection from every screen, and the one way to remove it: through the review drawer. */
export function SelectionBar({
  count,
  size,
  sizeIsEstimate,
  dirtyCount,
  isDeleting,
  canReview,
  onClear,
  onReview,
}: SelectionBarProps) {
  if (count === 0 && !isDeleting) return null;
  return (
    <footer className="h-[50px] flex-none border-t border-slate-200 bg-white flex items-center gap-3 px-4">
      {isDeleting ? (
        <span className="flex items-center gap-2 font-medium">
          <Spinner /> Removing…
        </span>
      ) : (
        <>
          <span className="font-semibold tabular-nums">{count} selected</span>
          <span className="text-slate-400">·</span>
          <span className="tabular-nums">{sizeIsEstimate ? 'at least ' : ''}{formatSize(size)}</span>
          <span className="text-slate-400">to free</span>
          {dirtyCount > 0 && (
            <Chip tone="danger">{dirtyCount} with uncommitted changes</Chip>
          )}
        </>
      )}
      <span className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        disabled={isDeleting || count === 0}
        className="h-8 px-3 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={onReview}
        disabled={!canReview || count === 0}
        className="h-8 px-3.5 rounded-md bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Review and Remove…
      </button>
    </footer>
  );
}
