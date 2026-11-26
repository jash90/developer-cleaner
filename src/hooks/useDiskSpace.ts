import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DiskSpace } from '../types';

/**
 * Free space on the volume holding `path`, or on the home folder's volume before any scan.
 *
 * Re-read whenever the app goes idle: at start, when a scan or rescan finishes, and when a
 * cleanup finishes — the moments the number can have changed because of this app. A failed
 * read yields `null`, which hides the indicator rather than showing a wrong figure.
 */
export function useDiskSpace(path: string | null, isBusy: boolean): DiskSpace | null {
  const [space, setSpace] = useState<DiskSpace | null>(null);

  useEffect(() => {
    if (isBusy) return;

    // A slower, older read must not overwrite a newer one.
    let current = true;
    invoke<DiskSpace>('get_disk_space', { path })
      .then((result) => {
        if (current) setSpace(result.total_bytes > 0 ? result : null);
      })
      .catch(() => {
        if (current) setSpace(null);
      });

    return () => {
      current = false;
    };
  }, [path, isBusy]);

  return space;
}
