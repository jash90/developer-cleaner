import { CATEGORIES } from '../../utils/categories';
import { formatSize } from '../../utils/formatSize';
import type { ReviewFilter, Suggestion } from '../../utils/suggestions';

interface SuggestionListProps {
  suggestions: Suggestion[];
  /** Shown under the list, e.g. why folder suggestions are missing. */
  footnote: string | null;
  /** Whether every path a "Select" would add is already selected. */
  isApplied: (suggestion: Suggestion) => boolean;
  onSelect: (suggestion: Suggestion) => void;
  onReview: (filter: ReviewFilter) => void;
  actionsDisabled: boolean;
}

export function SuggestionList({
  suggestions,
  footnote,
  isApplied,
  onSelect,
  onReview,
  actionsDisabled,
}: SuggestionListProps) {
  return (
    <section aria-label="Suggestions" className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 h-full">
      <div className="px-4 pt-3 pb-2 flex items-baseline justify-between">
        <h2 className="font-semibold text-[14px]">Suggestions</h2>
        <span className="text-[11.5px] text-slate-500">Safest first</span>
      </div>
      <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
        {suggestions.map((suggestion) => {
          const { action } = suggestion;
          const applied = action.type === 'select' && isApplied(suggestion);
          return (
            <li key={suggestion.id} className="px-4 py-2.5 flex items-start gap-3">
              <span
                className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                style={{ background: CATEGORIES[suggestion.category].color }}
                aria-hidden="true"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{suggestion.title}</div>
                <div className="text-[11.5px] text-slate-500 leading-snug">{suggestion.why}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="tabular-nums font-semibold whitespace-nowrap">
                  {suggestion.isEstimate && <span className="text-[10.5px] font-normal text-slate-500">at least </span>}
                  {formatSize(suggestion.size)}
                </div>
                {action.type === 'select' ? (
                  <button
                    type="button"
                    onClick={() => onSelect(suggestion)}
                    disabled={actionsDisabled || applied}
                    className="mt-1 h-6 px-2 rounded-md text-[11.5px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {applied ? 'Selected' : suggestion.count === 1 ? 'Select' : `Select ${suggestion.count}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onReview(action.filter)}
                    className="mt-1 h-6 px-2 rounded-md text-[11.5px] font-medium border border-slate-200 text-slate-700 hover:bg-slate-50"
                  >
                    Review
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {suggestions.length === 0 && !footnote && (
          <li className="px-4 py-3 text-[12px] text-slate-500">Nothing to suggest right now.</li>
        )}
        {footnote && <li className="px-4 py-3 text-[12px] text-slate-400">{footnote}</li>}
      </ul>
    </section>
  );
}
