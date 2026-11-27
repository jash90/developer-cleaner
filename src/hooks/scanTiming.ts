/**
 * How long the last complete folder scan of a path took, so the next scan of it can show
 * progress against a real figure. A per-viewer convenience: it lives in this browser's storage,
 * which can be missing or throw, and then the scan simply shows elapsed time only.
 */
const KEY_PREFIX = 'developer-cleaner:last-folder-scan-ms:';

export function readLastScanDuration(path: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(`${KEY_PREFIX}${path}`));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveLastScanDuration(path: string, durationMs: number): void {
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${path}`, String(Math.round(durationMs)));
  } catch {
    // Storage unavailable: the next scan shows elapsed time without an estimate.
  }
}
