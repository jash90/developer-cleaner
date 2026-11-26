/** What the backend returns for a scan the user stopped (`SCAN_STOPPED` in scan_cancel.rs). */
export const SCAN_STOPPED = 'Scan stopped';

export const isScanStopped = (error: unknown) => String(error) === SCAN_STOPPED;

/**
 * Remembers the stop requests sent to the backend, so a scan started right after one can wait
 * until the backend has seen it. Otherwise a stop that is still in flight could move the scan
 * generation after the new scan took its token, and end that scan instead.
 */
export function createStopGate(cancel: () => Promise<unknown>) {
  let pending: Promise<void> = Promise.resolve();
  return {
    /** Sends a stop; the returned promise rejects when the request fails. */
    stop(): Promise<unknown> {
      const request = cancel();
      const previous = pending;
      // A failed stop must not block the next scan, so the gate only waits for it to finish.
      pending = Promise.all([previous, request.catch(() => undefined)]).then(() => undefined);
      return request;
    },
    /** Resolves once every stop sent so far has finished, failed ones included. */
    settled: (): Promise<void> => pending,
  };
}
