import type { DiskSpace } from '../../types';
import { CATEGORIES, CATEGORY_ORDER, type CategoryId } from '../../utils/categories';
import { formatSize } from '../../utils/formatSize';
import { formatDuration } from '../../utils/time';
import { useNow } from '../../hooks/useClock';

export type HeroPart = number | 'scanning' | 'unscanned';

const bytesOf = (part: HeroPart) => (typeof part === 'number' ? part : 0);

export interface HeroScan {
  /** What is being scanned, e.g. "node_modules and build folders". */
  subject: string;
  startedAt: number;
  /** How long the last complete scan of this folder took, if known. */
  expectedMs: number | null;
  onStop?: () => void;
  isStopping?: boolean;
}

interface HeroProps {
  /** Reclaimable bytes per category, each byte counted once, or why there is no figure yet. */
  parts: Record<CategoryId, HeroPart>;
  total: number;
  totalIsEstimate: boolean;
  disk: DiskSpace | null;
  scanLabel: string | null;
  scan: HeroScan | null;
}

/**
 * The bar is the whole volume: what else is on it, then each category's share, then what is
 * free now. The parts are clamped to the used space, since a cache can sit on another volume.
 */
function diskSegments(disk: DiskSpace, parts: HeroProps['parts']) {
  const used = Math.max(0, disk.total_bytes - disk.available_bytes);
  const known = CATEGORY_ORDER.map((id) => ({ id, bytes: bytesOf(parts[id]) }));
  const sum = known.reduce((total, part) => total + part.bytes, 0);
  const scale = sum > used && sum > 0 ? used / sum : 1;
  const segments = known.map((part) => ({ ...part, bytes: part.bytes * scale }));
  const other = Math.max(0, used - sum * scale);
  const percent = (bytes: number) => `${(bytes / disk.total_bytes) * 100}%`;
  return { other: percent(other), segments: segments.map((part) => ({ ...part, width: percent(part.bytes) })) };
}

function ScanProgress({ scan, scanLabel }: { scan: HeroScan; scanLabel: string | null }) {
  const now = useNow(true);
  const elapsed = Math.max(0, now - scan.startedAt);
  // Never shown as finished while still running, even when this scan is slower than the last.
  const fraction = scan.expectedMs ? Math.min(0.97, elapsed / scan.expectedMs) : null;

  return (
    <div className="mt-3 flex items-center gap-3 text-[12px]">
      <span className="font-medium truncate min-w-0">
        Scanning {scanLabel ?? 'the folder'} for {scan.subject}
      </span>
      <div
        className="flex-1 min-w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-label="Scan progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
      >
        {fraction === null ? (
          <div className="h-full w-1/3 bg-blue-600/70 rounded-full animate-pulse" />
        ) : (
          <div className="h-full bg-blue-600 transition-[width] duration-1000 ease-linear" style={{ width: `${fraction * 100}%` }} />
        )}
      </div>
      <span className="tabular-nums text-slate-500 whitespace-nowrap">
        {formatDuration(elapsed)}
        {scan.expectedMs ? ` of about ${formatDuration(scan.expectedMs)}` : ' elapsed'}
      </span>
      {scan.onStop && (
        <button
          type="button"
          onClick={scan.onStop}
          disabled={scan.isStopping}
          className="h-6 px-2 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          {scan.isStopping ? 'Stopping…' : 'Stop'}
        </button>
      )}
    </div>
  );
}

export function Hero({ parts, total, totalIsEstimate, disk, scanLabel, scan }: HeroProps) {
  const freeAfter = disk ? Math.min(disk.total_bytes, disk.available_bytes + total) : 0;
  const bar = disk && disk.total_bytes > 0 ? diskSegments(disk, parts) : null;

  return (
    <section className="flex-none bg-white border-b border-slate-200 px-6 py-4" aria-label="Summary">
      <div className="flex items-end gap-6">
        <div className="shrink-0">
          <div
            className="text-[12px] text-slate-500"
            title={totalIsEstimate ? 'A prune frees an amount known only once it has run, so it adds to this.' : undefined}
          >
            {scan ? 'Found so far' : 'You can reclaim'}{totalIsEstimate ? ' at least' : ''}
          </div>
          <div className="text-[30px] leading-none font-semibold tabular-nums mt-1" data-testid="hero-total">
            {formatSize(total)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {disk && (
            <div className="flex justify-between gap-4 text-[11.5px] text-slate-500 mb-1.5">
              <span className="truncate" title={disk.mount_point}>
                {disk.volume_name || disk.mount_point} · {formatSize(disk.total_bytes)}
              </span>
              <span className="tabular-nums whitespace-nowrap">
                {formatSize(disk.available_bytes)} free
                {!scan && total > 0 && (
                  <>
                    {' → '}<b className="text-slate-800">{formatSize(freeAfter)}</b> if everything here is removed
                  </>
                )}
              </span>
            </div>
          )}
          {bar && (
            <div
              className="h-3 rounded-full bg-slate-100 overflow-hidden flex"
              role="img"
              aria-label={`${formatSize(disk?.available_bytes ?? 0)} free; ${formatSize(total)} of the used space can be reclaimed`}
            >
              <span className="bg-slate-300" style={{ width: bar.other }} />
              {bar.segments.map((segment) => (
                <span
                  key={segment.id}
                  style={{ width: segment.width, background: CATEGORIES[segment.id].color }}
                  title={`${CATEGORIES[segment.id].label}: ${formatSize(bytesOf(parts[segment.id]))}`}
                />
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11.5px] text-slate-600">
            {CATEGORY_ORDER.map((id) => (
              <span key={id} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2 h-2 rounded-sm" style={{ background: CATEGORIES[id].color }} aria-hidden="true" />
                {CATEGORIES[id].label}
                <b className="tabular-nums">
                  {parts[id] === 'scanning' ? '…' : parts[id] === 'unscanned' ? '—' : formatSize(bytesOf(parts[id]))}
                </b>
              </span>
            ))}
            {bar && (
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-2 h-2 rounded-sm bg-slate-300" aria-hidden="true" />
                Everything else
              </span>
            )}
          </div>
        </div>
      </div>
      {scan && <ScanProgress scan={scan} scanLabel={scanLabel} />}
    </section>
  );
}
