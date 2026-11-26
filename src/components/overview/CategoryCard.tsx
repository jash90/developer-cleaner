import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { formatSize } from '../../utils/formatSize';
import { Checkbox, Chip, SizeBar } from '../ui';

export interface CardRow {
  key: string;
  name: string;
  sub: string;
  size: number;
  /** Tooltip for the row, e.g. the full path or what deleting it costs. */
  title?: string;
  /** Shown instead of the size's plain number, e.g. for a prune whose saving is unknown. */
  sizeTitle?: string;
  sizeMuted?: boolean;
  /** Red only for uncommitted work; a lock or a refused removal is amber. */
  flag?: 'uncommitted' | 'locked' | 'blocked' | null;
  selected: boolean;
  disabled: boolean;
}

export type CardState =
  | { kind: 'ready' }
  | { kind: 'scanning' }
  | { kind: 'waiting'; message: string; action?: ReactNode }
  | { kind: 'failed'; message: string };

interface CategoryCardProps {
  label: string;
  color: string;
  count: number;
  total: number;
  totalIsEstimate?: boolean;
  flags?: ReactNode;
  selectedCount: number;
  rows: CardRow[];
  /** The most rows to show; fewer when the card is too short for them. */
  maxRows: number;
  state: CardState;
  emptyMessage: string;
  onToggle: (key: string) => void;
  onReviewAll: () => void;
  selectionDisabled: boolean;
}

const ROW_HEIGHT = 26;

/** How many rows fit in the list area right now, measured, so "Largest N" matches the screen. */
function useFittingRows(maxRows: number) {
  const listRef = useRef<HTMLDivElement>(null);
  const [fitting, setFitting] = useState(maxRows);

  useLayoutEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const measure = () => {
      setFitting(Math.max(1, Math.floor(element.clientHeight / ROW_HEIGHT)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { listRef, rowsShown: Math.min(maxRows, fitting) };
}

export function CategoryCard({
  label,
  color,
  count,
  total,
  totalIsEstimate = false,
  flags,
  selectedCount,
  rows,
  maxRows,
  state,
  emptyMessage,
  onToggle,
  onReviewAll,
  selectionDisabled,
}: CategoryCardProps) {
  const { listRef, rowsShown } = useFittingRows(maxRows);
  const ready = state.kind === 'ready';
  const shown = ready ? rows.slice(0, rowsShown) : [];
  const max = shown.reduce((largest, row) => Math.max(largest, row.size), 0);

  return (
    <section
      aria-label={label}
      className="@container bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 min-w-0"
    >
      <div className="px-4 pt-3 pb-1 flex items-start gap-2">
        <span className="mt-1 w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h2 className="font-semibold text-[14px] truncate">{label}</h2>
            {ready && <span className="text-[12px] text-slate-500 tabular-nums">{count}</span>}
          </div>
          <div className="flex flex-wrap gap-1 mt-1 min-h-[18px]">{ready && flags}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[17px] font-semibold tabular-nums">
            {ready ? (
              <>
                {totalIsEstimate && <span className="text-[11px] font-normal text-slate-500">at least </span>}
                {formatSize(total)}
              </>
            ) : '…'}
          </div>
          {ready && selectedCount > 0 && (
            <div className="text-[11px] text-blue-700 tabular-nums">{selectedCount} selected</div>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-hidden px-4">
        {state.kind === 'scanning' && (
          <div className="h-full flex flex-col justify-center gap-2" aria-busy="true">
            {[90, 80, 70, 60, 50].slice(0, Math.max(1, rowsShown)).map((width) => (
              <div key={width} className="h-2.5 rounded bg-slate-100 animate-pulse" style={{ width: `${width}%` }} />
            ))}
            <p className="text-[11.5px] text-slate-400 mt-1">Scanning… results appear when this scan finishes.</p>
          </div>
        )}
        {(state.kind === 'waiting' || state.kind === 'failed') && (
          <div className="h-full flex flex-col items-start justify-center gap-2">
            <p className={`text-[12px] ${state.kind === 'failed' ? 'text-slate-700' : 'text-slate-500'}`}>
              {state.message}
            </p>
            {state.kind === 'waiting' && state.action}
          </div>
        )}
        {ready && rows.length === 0 && (
          <div className="h-full flex items-center text-[12px] text-slate-500">{emptyMessage}</div>
        )}
        {ready && shown.length > 0 && (
          <ul>
            {shown.map((row) => (
              <li
                key={row.key}
                title={row.title}
                className={`h-[26px] flex items-center gap-2 min-w-0 ${row.disabled ? 'text-slate-400' : ''}`}
              >
                <Checkbox
                  label={`Select ${row.name}`}
                  checked={row.selected}
                  disabled={row.disabled || selectionDisabled}
                  onChange={() => onToggle(row.key)}
                />
                <span className="truncate font-medium min-w-0">{row.name}</span>
                <span className="truncate text-[11.5px] text-slate-400 min-w-0 flex-1">{row.sub}</span>
                {row.flag === 'uncommitted' && <Chip tone="danger">uncommitted</Chip>}
                {row.flag === 'locked' && <Chip tone="warn">locked</Chip>}
                {row.flag === 'blocked' && <Chip tone="warn">changed</Chip>}
                {/* Narrow cards give the bar's room to the names. */}
                <span className="hidden @min-[360px]:inline-flex">
                  <SizeBar bytes={row.size} max={max} />
                </span>
                <span
                  className={`w-[66px] shrink-0 text-right whitespace-nowrap tabular-nums ${row.sizeMuted ? 'text-slate-400' : ''}`}
                  title={row.sizeTitle}
                >
                  {formatSize(row.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-4 py-2 border-t border-slate-100 flex justify-between items-center text-[12px]">
        <span className="text-slate-500 tabular-nums">
          {ready && rows.length > 0 ? `Largest ${shown.length} of ${count}` : ''}
        </span>
        <button
          type="button"
          onClick={onReviewAll}
          disabled={!ready}
          className="font-medium text-blue-700 hover:text-blue-900 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Review all ›
        </button>
      </div>
    </section>
  );
}
