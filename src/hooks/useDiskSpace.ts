import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DiskSpace } from '../types';
import { spaceFor, type DiskReading } from '../utils/diskSpace';

/**
 * Free space on the volume holding `path`, or on the home folder's volume before any scan.
 *
 * Re-read whenever the app goes idle: at start, when a scan or rescan finishes, and when a
 * cleanup finishes — the moments the number can have changed because of this app. A new folder
 * is read at once, even mid-scan, and until that read returns the hook yields `null` rather
 * than the previous folder's volume. A failed read also yields `null`, which hides the
 * indicator rather than showing a wrong figure.
 */
export function useDiskSpace(path: string | null, isBusy: boolean): DiskSpace | null {
  const [reading, setReading] = useState<DiskReading | null>(null);
  // The folder of the last read that returned; a busy app re-reads only a different one.
  const readPath = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (isBusy && readPath.current === path) return;

    // A slower, older read must not overwrite a newer one.
    let current = true;
    const settle = (space: DiskSpace | null) => {
      if (!current) return;
      readPath.current = path;
      setReading({ path, space });
    };
    invoke<DiskSpace>('get_disk_space', { path })
      .then((result) => settle(result.total_bytes > 0 ? result : null))
      .catch(() => settle(null));

    return () => {
      current = false;
    };
  }, [path, isBusy]);

  return spaceFor(reading, path);
}
