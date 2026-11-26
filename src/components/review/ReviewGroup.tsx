import type { ReactNode } from 'react';
import { formatSize } from '../../utils/formatSize';

interface ReviewGroupItem {
  key: string;
  name: string;
  detail: string;
  /** Uncommitted work: the one thing shown in red. */
  danger?: boolean;
}

interface ReviewGroupProps {
  title: string;
  color: string;
  size: number;
  sizeIsEstimate?: boolean;
  items: ReviewGroupItem[];
  onUntick: (key: string) => void;
  /** What removing this category means, shown under its heading. */
  children: ReactNode;
}

/** One category in the review drawer: its total, what removal means, and every item to untick. */
export function ReviewGroup({
  title,
  color,
  size,
  sizeIsEstimate = false,
  items,
  onUntick,
  children,
}: ReviewGroupProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="py-3 border-b border-slate-100">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-sm" style={{ background: color }} aria-hidden="true" />
        <b>{title}</b>
        <span className="text-slate-500 tabular-nums">{items.length}</span>
        <span className="flex-1" />
        <span className="tabular-nums">{sizeIsEstimate ? 'at least ' : ''}{formatSize(size)}</span>
      </div>
      <div className="ml-4 mt-1 text-[11.5px] text-slate-600">{children}</div>
      <details className="ml-4 mt-1.5">
        <summary className="text-[11.5px] text-blue-700 cursor-pointer select-none">
          {items.length === 1 ? 'Show the item' : `Show all ${items.length}`}
        </summary>
        <ul className="mt-1 max-h-56 overflow-y-auto">
          {items.map((item) => (
            <li key={item.key}>
              <label className="flex items-start gap-2 py-0.5 cursor-pointer" title={item.detail}>
                <input
                  type="checkbox"
                  checked
                  aria-label={`Keep selected: ${item.name}`}
                  onChange={() => onUntick(item.key)}
                  className="mt-0.5 w-3.5 h-3.5 shrink-0 accent-blue-600"
                />
                <span className="min-w-0">
                  <span className={`font-medium ${item.danger ? 'text-red-700' : 'text-slate-800'}`}>{item.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{item.detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
