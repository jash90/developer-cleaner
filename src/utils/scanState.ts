/**
 * Where a folder-scan list stands. An empty list means "nothing found" only when it is
 * `ready`; in every other state it is empty because the scan has not given a full answer.
 */
export type ListState = 'waiting' | 'scanning' | 'stopped' | 'failed' | 'ready';

export function listState(input: {
  scanPath: string | null;
  scanning: boolean;
  stopped: boolean;
  failed: boolean;
}): ListState {
  if (!input.scanPath) return 'waiting';
  if (input.scanning) return 'scanning';
  if (input.stopped) return 'stopped';
  if (input.failed) return 'failed';
  return 'ready';
}

export const STOPPED_MESSAGE = 'Scan stopped before it finished. Rescan to see these.';
export const FAILED_MESSAGE = 'The scan failed; the message above says why.';

/** What an empty list says in each state; `emptyMessage` is for a finished scan that found nothing. */
export function emptyListMessage(state: ListState, what: string, emptyMessage: string): string {
  switch (state) {
    case 'waiting':
      return `Choose a folder to find ${what} in it.`;
    case 'scanning':
      return `Scanning for ${what}…`;
    case 'stopped':
      return STOPPED_MESSAGE;
    case 'failed':
      return FAILED_MESSAGE;
    case 'ready':
      return emptyMessage;
  }
}
