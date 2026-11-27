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

/**
 * What removing everything frees on the volume shown. The scanned folder's lists live on it by
 * definition; developer caches live under the home folder, so they count only when the home
 * folder is on the same volume.
 */
export function reclaimableOnVolume(total: number, cacheBytes: number, cachesOnVolume: boolean): number {
  return cachesOnVolume ? total : Math.max(0, total - cacheBytes);
}
