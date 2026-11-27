import { CloseIcon } from '../ui';

interface BannersProps {
  report: string[] | null;
  errors: string[];
  onDismissReport: () => void;
  onDismissErrors: () => void;
}

/** What the last cleanup did, and every error from any category: one failure never hides another. */
export function Banners({ report, errors, onDismissReport, onDismissErrors }: BannersProps) {
  return (
    <>
      {report && report.length > 0 && (
        <div className="flex-none bg-green-50 border-b border-green-200 px-6 py-2.5 flex items-start justify-between gap-4">
          <ul className="text-green-800 text-[12.5px] space-y-0.5" aria-live="polite">
            {report.map((line) => <li key={line}>{line}</li>)}
          </ul>
          <button
            type="button"
            onClick={onDismissReport}
            className="text-green-600 hover:text-green-800"
            aria-label="Dismiss cleanup summary"
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {errors.length > 0 && (
        <div className="flex-none bg-red-50 border-b border-red-200 px-6 py-2.5 flex items-start justify-between gap-4 max-h-48 overflow-y-auto">
          <div className="text-red-700 text-[12.5px] space-y-2 min-w-0 break-words">
            {errors.map((message) => (
              <p key={message} className="whitespace-pre-line">{message}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={onDismissErrors}
            className="text-red-500 hover:text-red-700"
            aria-label="Dismiss error"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </>
  );
}
