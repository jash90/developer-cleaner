import type { ReactNode } from 'react';
import { formatSize } from '../../utils/formatSize';

interface PageHeaderProps {
  title: string;
  color: string;
  total: number;
  totalIsEstimate?: boolean;
  description: ReactNode;
  controls?: ReactNode;
  /** When the page shows only part of the category: what, and a way back to all of it. */
  filter?: { label: string; shown: number; of: number; onClear: () => void } | null;
}

export function PageHeader({
  title,
  color,
  total,
  totalIsEstimate = false,
  description,
  controls,
  filter,
}: PageHeaderProps) {
  return (
    <>
      <section className="flex-none bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <h1 className="text-[17px] font-semibold flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
            {title}
            <span className="text-slate-400 font-normal tabular-nums">
              {totalIsEstimate ? 'at least ' : ''}{formatSize(total)}
            </span>
          </h1>
          <p className="text-[12px] text-slate-500 max-w-3xl">{description}</p>
        </div>
        {controls && <div className="flex items-center gap-1.5 flex-wrap">{controls}</div>}
      </section>
      {filter && (
        <div className="flex-none px-6 py-1.5 bg-blue-50 border-b border-blue-100 text-[12px] text-blue-900 flex items-center gap-3">
          <span>
            Showing <b>{filter.label}</b>
            <span className="tabular-nums"> · {filter.shown} of {filter.of}</span>
          </span>
          <button type="button" onClick={filter.onClear} className="ml-auto font-medium text-blue-700 hover:text-blue-900">
            Show all
          </button>
        </div>
      )}
    </>
  );
}

export function SegmentButton({
  label,
  count,
  active,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-7 px-2.5 rounded-md text-[12px] flex items-center gap-1.5 ${
        active ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
      <span className={`tabular-nums ${active ? 'text-slate-300' : tone ?? 'text-slate-500'}`}>{count}</span>
    </button>
  );
}

export function TextButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 px-2.5 rounded-md text-[12px] font-medium text-slate-700 ring-1 ring-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
