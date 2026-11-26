import { useNow } from '../../hooks/useClock';
import { shortenHome } from '../../utils/categories';
import { formatRelativeTime } from '../../utils/time';
import { Spinner } from '../ui';

interface ToolbarProps {
  /** `null` on the overview; a category's label on its drill-down page. */
  pageTitle: string | null;
  onBack: () => void;
  scanPath: string | null;
  isScanning: boolean;
  /** When the lists were last built, for "scanned 4 min ago". */
  listBuiltAt: number;
  canRescan: boolean;
  canChooseFolder: boolean;
  onRescan: () => void;
  onChooseFolder: () => void;
  onOpenSettings: () => void;
}

export function Toolbar({
  pageTitle,
  onBack,
  scanPath,
  isScanning,
  listBuiltAt,
  canRescan,
  canChooseFolder,
  onRescan,
  onChooseFolder,
  onOpenSettings,
}: ToolbarProps) {
  const now = useNow(listBuiltAt > 0, 30_000);
  const status = isScanning
    ? 'scanning…'
    : listBuiltAt > 0 ? `scanned ${formatRelativeTime(listBuiltAt, now)}` : null;

  return (
    <header className="h-[52px] flex-none flex items-center gap-3 px-4 border-b border-slate-200 bg-white">
      {pageTitle === null ? (
        <span className="font-semibold">Overview</span>
      ) : (
        <>
          <button type="button" onClick={onBack} className="text-blue-700 font-medium hover:text-blue-900">
            ‹ Overview
          </button>
          <span className="text-slate-300" aria-hidden="true">/</span>
          <span className="font-semibold truncate">{pageTitle}</span>
        </>
      )}
      <span className="text-slate-400 text-[12px] truncate min-w-0" title={scanPath ?? undefined}>
        {scanPath ? shortenHome(scanPath) : 'No folder chosen'}
        {status ? ` · ${status}` : ''}
      </span>
      <span className="flex-1" />
      {scanPath && (
        <button
          type="button"
          onClick={onRescan}
          disabled={!canRescan}
          className="h-7 px-2.5 rounded-md border border-slate-200 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Rescan
        </button>
      )}
      <button
        type="button"
        onClick={onOpenSettings}
        className="h-7 px-2.5 rounded-md border border-slate-200 hover:bg-slate-50"
      >
        Settings
      </button>
      <button
        type="button"
        onClick={onChooseFolder}
        disabled={!canChooseFolder}
        className="h-7 px-3 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
      >
        {isScanning && <Spinner className="h-3.5 w-3.5" />}
        Choose Folder…
      </button>
    </header>
  );
}
