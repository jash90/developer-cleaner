/** What the backend returns for a scan the user stopped (`SCAN_STOPPED` in scan_cancel.rs). */
export const SCAN_STOPPED = 'Scan stopped';

export const isScanStopped = (error: unknown) => String(error) === SCAN_STOPPED;
