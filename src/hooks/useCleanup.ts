import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { useDevCaches } from './useDevCaches';
import { useMergedWorktrees } from './useMergedWorktrees';
import { useNodeModules, type NodeModulesDeletion } from './useNodeModules';
import { useBuildArtifacts, type BuildArtifactDeletion } from './useBuildArtifacts';
import {
  countOutcome,
  countRemovableWorktrees,
  createCleanupSummary,
  detectTrayMismatch,
  formatCleanupReport,
  isSelectableWorktree,
  runCleanupDeletion,
  runCleanupScans,
  runUnifiedCleanup,
  worktreesNeedingConsent,
} from '../utils/cleanupSummary';
import { formatSize } from '../utils/formatSize';
import type { TrayStats, WorktreeDeleteResult } from '../types';

/**
 * Ask the menu bar to recount. The count doubles as a check on the window's own list, and a
 * failed request is not worth surfacing: the next scheduled refresh arrives anyway.
 */
function refreshTray() {
  void invoke('refresh_tray_now').catch(() => {});
}

/**
 * Coordinates all three cleanup categories behind one "Remove Selected". The cache hook is
 * passed in rather than created here because its panel also works with no folder scanned.
 */
function toReclaimable(item: { path: string; reclaimable_size: number }) {
  return { path: item.path, size: item.reclaimable_size };
}

export function useCleanup(caches: ReturnType<typeof useDevCaches>) {
  const nodeModules = useNodeModules();
  const buildArtifacts = useBuildArtifacts();
  const mergedWorktrees = useMergedWorktrees();
  const scanNodeModulesOnly = nodeModules.scan;
  const replaceBuildArtifacts = buildArtifacts.replace;
  const deleteBuildArtifacts = buildArtifacts.deleteSelected;
  const reconcileBuildArtifacts = buildArtifacts.reconcileAfterCleanup;
  const clearBuildArtifactsError = buildArtifacts.clearError;
  const scanMergedWorktrees = mergedWorktrees.scan;
  const deleteNodeModules = nodeModules.deleteSelected;
  const reconcileNodeModules = nodeModules.reconcileAfterCleanup;
  const deleteMergedWorktrees = mergedWorktrees.deleteSelected;
  const clearNodeModulesError = nodeModules.clearError;
  const clearMergedWorktreesError = mergedWorktrees.clearError;
  const blockedWorktrees = mergedWorktrees.blockedReasons;
  const {
    targets: cacheTargets,
    selectedIds: selectedCachePaths,
    isCleaning: isCleaningCaches,
    isScanning: isScanningCaches,
    error: cachesError,
    cleanSelected: cleanCaches,
    clearError: clearCachesError,
  } = caches;
  const [lastReport, setLastReport] = useState<string[] | null>(null);
  const [scanPath, setScanPath] = useState<string | null>(null);
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);
  const [isCoordinatingDeletion, setIsCoordinatingDeletion] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const deletionInProgress = useRef(false);
  // Menu bar counts from before the list was last rebuilt describe a different moment, so only
  // the ones that arrive afterwards are compared with it.
  const [trayStats, setTrayStats] = useState<{ stats: TrayStats; receivedAt: number } | null>(null);
  const [listBuiltAt, setListBuiltAt] = useState(0);

  // One walk finds node_modules and build folders; the build folders go to their own list.
  const scanNodeModules = useCallback(async (path: string) => {
    replaceBuildArtifacts([]);
    const result = await scanNodeModulesOnly(path);
    replaceBuildArtifacts(result?.build_artifacts ?? []);
  }, [replaceBuildArtifacts, scanNodeModulesOnly]);

  useEffect(() => {
    const unlisten = listen<TrayStats>('tray-stats', (event) => {
      setTrayStats({ stats: event.payload, receivedAt: Date.now() });
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  const isScanning = isSelectingDirectory
    || nodeModules.isScanning
    || mergedWorktrees.isScanning;
  const isDeleting = isCoordinatingDeletion
    || nodeModules.isDeleting
    || buildArtifacts.isDeleting
    || mergedWorktrees.isDeleting
    || isCleaningCaches;
  // Kept apart from `isScanning`, which drives the full-page scan screen for the folder scan.
  const canDelete = !isDeleting && !isScanning && !isScanningCaches;

  const selectedCaches = useMemo(
    () => cacheTargets.filter((target) => selectedCachePaths.has(target.path)),
    [cacheTargets, selectedCachePaths],
  );

  // Totals count what a delete frees (`reclaimable_size`), the figure each row shows; the
  // logical size counts hard-linked and sparse data that deleting does not give back.
  const summary = useMemo(() => createCleanupSummary({
    nodeModules: nodeModules.folders
      .filter((folder) => nodeModules.selectedPaths.has(folder.path))
      .map(toReclaimable),
    buildArtifacts: buildArtifacts.targets
      .filter((target) => buildArtifacts.selectedPaths.has(target.path))
      .map(toReclaimable),
    worktrees: mergedWorktrees.worktrees.filter((worktree) => (
      mergedWorktrees.selectedPaths.has(worktree.path)
    )),
    caches: selectedCaches.map((target) => ({
      path: target.path,
      size: target.reclaimable_size,
      isEstimate: target.cleanup.type === 'external_command',
    })),
  }), [
    mergedWorktrees.selectedPaths,
    mergedWorktrees.worktrees,
    nodeModules.folders,
    nodeModules.selectedPaths,
    buildArtifacts.selectedPaths,
    buildArtifacts.targets,
    selectedCaches,
  ]);

  const availableSummary = useMemo(() => createCleanupSummary({
    nodeModules: nodeModules.folders.map(toReclaimable),
    buildArtifacts: buildArtifacts.targets.map(toReclaimable),
    worktrees: mergedWorktrees.worktrees.filter((worktree) => (
      isSelectableWorktree(worktree) && !blockedWorktrees.has(worktree.path)
    )),
  }), [blockedWorktrees, mergedWorktrees.worktrees, nodeModules.folders, buildArtifacts.targets]);

  const selectedWorktreesNeedingConsent = useMemo(() => worktreesNeedingConsent(
    mergedWorktrees.worktrees.filter((worktree) => (
      mergedWorktrees.selectedPaths.has(worktree.path)
    )),
  ), [mergedWorktrees.selectedPaths, mergedWorktrees.worktrees]);

  const scan = useCallback(async () => {
    if (isScanning || isDeleting) return;

    setIsSelectingDirectory(true);
    setPickerError(null);
    setLastReport(null);

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select folder to scan for cleanup candidates',
      });

      if (!selected) return;

      const path = selected as string;
      setScanPath(path);
      await runCleanupScans(path, scanNodeModules, scanMergedWorktrees);
      setListBuiltAt(Date.now());
      refreshTray();
    } catch (err) {
      setPickerError(`Failed to open directory picker: ${err}`);
    } finally {
      setIsSelectingDirectory(false);
    }
  }, [isDeleting, isScanning, scanMergedWorktrees, scanNodeModules]);

  /** Scan the same folder again, without going through the picker. */
  const rescan = useCallback(async () => {
    if (!scanPath || isScanning || isDeleting) return;
    setLastReport(null);
    await runCleanupScans(scanPath, scanNodeModules, scanMergedWorktrees);
    setListBuiltAt(Date.now());
    refreshTray();
  }, [isDeleting, isScanning, scanMergedWorktrees, scanNodeModules, scanPath]);

  // The window list is a snapshot from the last scan; the menu bar recounts every fifteen
  // minutes. When both describe the same folder and disagree, the list is the one that aged.
  const windowCount = countRemovableWorktrees(mergedWorktrees.worktrees, blockedWorktrees);
  const trayMismatch = detectTrayMismatch({
    stats: trayStats?.stats ?? null,
    statsReceivedAt: trayStats?.receivedAt ?? 0,
    listBuiltAt,
    scanPath,
    windowCount,
    isBusy: isScanning || isDeleting,
    scanFailed: mergedWorktrees.scanFailed,
  });

  const deleteSelected = useCallback(async () => {
    if (summary.totalCount === 0 || deletionInProgress.current || !canDelete) return;

    const nodeModulePaths = nodeModules.folders
      .filter((folder) => nodeModules.selectedPaths.has(folder.path))
      .map((folder) => folder.path);
    const buildArtifactPaths = buildArtifacts.targets
      .filter((target) => buildArtifacts.selectedPaths.has(target.path))
      .map((target) => target.path);
    const selectedWorktrees = mergedWorktrees.worktrees.filter((worktree) => (
      mergedWorktrees.selectedPaths.has(worktree.path)
    ));
    const requested = {
      nodeModules: nodeModulePaths.length,
      buildArtifacts: buildArtifactPaths.length,
      worktrees: selectedWorktrees.length,
      caches: selectedCaches.length,
    };

    deletionInProgress.current = true;
    setIsCoordinatingDeletion(true);
    setLastReport(null);

    try {
      const report = await runUnifiedCleanup(
        async () => {
          let deletion: NodeModulesDeletion = { results: [], deletedFolders: [] };
          let artifactDeletion: BuildArtifactDeletion = { results: [], deletedArtifacts: [] };
          let worktreeResults: WorktreeDeleteResult[] = [];
          await runCleanupDeletion(
            // Folders inside a selected worktree go first, so its size can be adjusted.
            () => Promise.all([
              deleteNodeModules(nodeModulePaths),
              deleteBuildArtifacts(buildArtifactPaths),
            ]),
            ([nodeModulesResult, artifactResult]) => {
              deletion = nodeModulesResult;
              artifactDeletion = artifactResult;
            },
            () => deleteMergedWorktrees(
              selectedWorktrees,
              [...deletion.deletedFolders, ...artifactDeletion.deletedArtifacts],
            ),
            (results) => {
              worktreeResults = results;
              const removedWorktreePaths = results
                .filter((result) => result.success)
                .map((result) => result.path);
              reconcileNodeModules(deletion.deletedFolders, removedWorktreePaths);
              reconcileBuildArtifacts(removedWorktreePaths);
            },
          );
          return {
            nodeModules: countOutcome(requested.nodeModules, deletion.results),
            buildArtifacts: countOutcome(requested.buildArtifacts, artifactDeletion.results),
            worktrees: countOutcome(requested.worktrees, worktreeResults),
          };
        },
        async () => countOutcome(requested.caches, await cleanCaches()),
        requested,
      );
      setLastReport(formatCleanupReport(report, formatSize));
    } finally {
      deletionInProgress.current = false;
      setIsCoordinatingDeletion(false);
      setListBuiltAt(Date.now());
      // The menu bar counts are now stale by definition.
      refreshTray();
    }
  }, [
    canDelete,
    cleanCaches,
    deleteMergedWorktrees,
    deleteNodeModules,
    deleteBuildArtifacts,
    mergedWorktrees.selectedPaths,
    mergedWorktrees.worktrees,
    nodeModules.folders,
    nodeModules.selectedPaths,
    reconcileNodeModules,
    reconcileBuildArtifacts,
    buildArtifacts.selectedPaths,
    buildArtifacts.targets,
    selectedCaches.length,
    summary.totalCount,
  ]);

  const clearError = useCallback(() => {
    setPickerError(null);
    clearNodeModulesError();
    clearBuildArtifactsError();
    clearMergedWorktreesError();
    clearCachesError();
  }, [clearCachesError, clearMergedWorktreesError, clearNodeModulesError, clearBuildArtifactsError]);

  // Every source is shown: one category's failure must not hide another's.
  const errors = [pickerError, nodeModules.error, buildArtifacts.error, mergedWorktrees.error, cachesError]
    .filter((message): message is string => Boolean(message));

  return {
    nodeModules,
    buildArtifacts,
    mergedWorktrees,
    scanPath,
    isScanning,
    isDeleting,
    canDelete,
    summary,
    totalSize: availableSummary.totalSize,
    selectedWorktreesNeedingConsent,
    trayMismatch,
    removableWorktreeCount: windowCount,
    errors,
    lastReport,
    scan,
    rescan,
    deleteSelected,
    clearError,
    clearReport: () => setLastReport(null),
  };
}
