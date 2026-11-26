import { useState, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { NodeModulesFolder, ScanResult, DeleteResult, SortConfig } from '../types';
import {
  describeFailures,
  nodeModulesFailures,
  removeCandidatesWithinPaths,
} from '../utils/cleanupSummary';
import { isScanStopped } from '../utils/scanStop';

export interface NodeModulesDeletion {
  results: DeleteResult[];
  deletedFolders: NodeModulesFolder[];
}

export function useNodeModules() {
  const [folders, setFolders] = useState<NodeModulesFolder[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scanPath, setScanPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stopped by the user: the list is empty because the scan did not finish, not because
  // nothing was found.
  const [wasStopped, setWasStopped] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'size', direction: 'desc' });

  const sortedFolders = useMemo(() => {
    const sorted = [...folders].sort((a, b) => {
      let comparison = 0;

      switch (sortConfig.field) {
        case 'name':
          comparison = a.parent_project.localeCompare(b.parent_project);
          break;
        case 'size':
          // The figure each row shows: what a delete frees, not the nominal size, which counts
          // pnpm and bun hardlinks into a shared store that survives the delete.
          comparison = a.reclaimable_size - b.reclaimable_size;
          break;
        case 'manager':
          comparison = a.package_manager.localeCompare(b.package_manager);
          break;
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [folders, sortConfig]);

  /** Resolves to the full result, which also carries the build folders the same walk found. */
  const scan = useCallback(async (path: string): Promise<ScanResult | null> => {
    if (isScanning || isDeleting) return null;

    setIsScanning(true);
    setError(null);
    setWasStopped(false);
    setFolders([]);
    setSelectedPaths(new Set());
    setScanPath(path);

    try {
      const result = await invoke<ScanResult>('scan_for_node_modules', { path });
      setFolders(result.folders);
      return result;
    } catch (err) {
      if (isScanStopped(err)) setWasStopped(true);
      else setError(`Scan failed: ${err}`);
      return null;
    } finally {
      setIsScanning(false);
    }
  }, [isDeleting, isScanning]);

  const toggleSelection = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedPaths(new Set(folders.map(f => f.path)));
  }, [folders]);

  const deselectAll = useCallback(() => {
    setSelectedPaths(new Set());
  }, []);

  /** Tick or untick the given rows (e.g. the ones a filter shows), leaving the rest alone. */
  const setPathsSelected = useCallback((paths: string[], selected: boolean) => {
    const known = new Set(folders.map((folder) => folder.path));
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      paths.filter((path) => known.has(path))
        .forEach((path) => (selected ? next.add(path) : next.delete(path)));
      return next;
    });
  }, [folders]);

  const deleteSelected = useCallback(async (
    paths: string[],
  ): Promise<NodeModulesDeletion> => {
    if (paths.length === 0 || isDeleting || isScanning) return { results: [], deletedFolders: [] };

    setIsDeleting(true);
    setError(null);

    try {
      const selectedPathSet = new Set(paths);
      const deletionTargets = folders.filter((folder) => selectedPathSet.has(folder.path));
      const results = await invoke<DeleteResult[]>('delete_folders', { paths });

      const successfullyDeleted = new Set(
        results.filter((result) => result.success).map((result) => result.path),
      );
      const deletedFolders = deletionTargets.filter((folder) => (
        successfullyDeleted.has(folder.path)
      ));

      // The reclaimable total is derived from the rows left in the list, so dropping these rows
      // is the whole adjustment; what was actually freed comes from `removed_bytes`.
      setFolders(prev => prev.filter(f => !successfullyDeleted.has(f.path)));
      setSelectedPaths(prev => {
        const newSet = new Set(prev);
        successfullyDeleted.forEach(path => newSet.delete(path));
        return newSet;
      });

      setError(describeFailures('node_modules folder', nodeModulesFailures(results)));
      return { results, deletedFolders };
    } catch (err) {
      setError(`Delete operation failed: ${err}`);
      return { results: [], deletedFolders: [] };
    } finally {
      setIsDeleting(false);
    }
  }, [folders, isDeleting, isScanning]);

  const setSort = useCallback((field: SortConfig['field']) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  const reconcileAfterCleanup = useCallback((
    deletedFolders: NodeModulesFolder[],
    removedWorktreePaths: string[],
  ) => {
    const deletedPaths = new Set(deletedFolders.map((folder) => folder.path));
    const afterFolderDeletion = folders.filter((folder) => !deletedPaths.has(folder.path));
    const remainingFolders = removeCandidatesWithinPaths(
      afterFolderDeletion,
      removedWorktreePaths,
    );
    const remainingPaths = new Set(remainingFolders.map((folder) => folder.path));

    setFolders(remainingFolders);
    setSelectedPaths((current) => new Set(
      Array.from(current).filter((path) => remainingPaths.has(path)),
    ));
  }, [folders]);

  return {
    folders: sortedFolders,
    selectedPaths,
    isScanning,
    wasStopped,
    isDeleting,
    scanPath,
    error,
    sortConfig,
    scan,
    toggleSelection,
    selectAll,
    deselectAll,
    setPathsSelected,
    deleteSelected,
    reconcileAfterCleanup,
    setSort,
    clearError: () => setError(null),
  };
}
