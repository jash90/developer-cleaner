import type { DiskSpace } from '../types';

/** A disk-space read and the folder it was read for. */
export interface DiskReading {
  path: string | null;
  space: DiskSpace | null;
}

/** The reading for `path`; null while only another folder's volume has been read. */
export function spaceFor(reading: DiskReading | null, path: string | null): DiskSpace | null {
  return reading !== null && reading.path === path ? reading.space : null;
}
