import { useCallback, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ArtifactKind, BuildArtifact, DeleteResult } from '../types';
import {
  describeFailures,
  nodeModulesFailures,
  removeCandidatesWithinPaths,
} from '../utils/cleanupSummary';

export interface BuildArtifactDeletion {
  results: DeleteResult[];
  deletedArtifacts: BuildArtifact[];
}

/**
 * Build output and tool caches (Cargo `target`, `Pods`, `.next`, …). Found by the node_modules
 * scan — one walk serves both — but selected on their own: a rebuild costs far more than a
 * reinstall, so no node_modules "Select All" may sweep these in.
 */
export function useBuildArtifacts() {
  const [targets, setTargets] = useState<BuildArtifact[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedTargets = useMemo(
    () => [...targets].sort((a, b) => b.reclaimable_size - a.reclaimable_size),
    [targets],
  );

  /** Replace the list with a scan's findings; `[]` clears it when a scan starts or fails. */
  const replace = useCallback((next: BuildArtifact[]) => {
    setTargets(next);
    setSelectedPaths(new Set());
    setError(null);
  }, []);

  const toggleSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  /**
   * Tick or untick folders of one kind — the ones its group shows — leaving the other kinds as
   * they are. Paths of any other kind are ignored, so no call can select across kinds.
   */
  const setKindPathsSelected = useCallback((
    kind: ArtifactKind,
    paths: string[],
    selected: boolean,
  ) => {
    const ofKind = new Set(
      targets.filter((target) => target.kind === kind).map((target) => target.path),
    );
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      paths.filter((path) => ofKind.has(path))
        .forEach((path) => (selected ? next.add(path) : next.delete(path)));
      return next;
    });
  }, [targets]);

  const deselectAll = useCallback(() => setSelectedPaths(new Set()), []);

  const deleteSelected = useCallback(async (paths: string[]): Promise<BuildArtifactDeletion> => {
    if (paths.length === 0 || isDeleting) return { results: [], deletedArtifacts: [] };

    setIsDeleting(true);
    setError(null);

    try {
      const requested = new Set(paths);
      const deletionTargets = targets.filter((target) => requested.has(target.path));
      const results = await invoke<DeleteResult[]>('delete_build_artifacts', { paths });
      const deleted = new Set(
        results.filter((result) => result.success).map((result) => result.path),
      );

      setTargets((prev) => prev.filter((target) => !deleted.has(target.path)));
      setSelectedPaths((prev) => new Set(Array.from(prev).filter((path) => !deleted.has(path))));
      setError(describeFailures('build folder', nodeModulesFailures(results)));
      return {
        results,
        deletedArtifacts: deletionTargets.filter((target) => deleted.has(target.path)),
      };
    } catch (err) {
      setError(`Delete operation failed: ${err}`);
      return { results: [], deletedArtifacts: [] };
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, targets]);

  /**
   * Targets inside a worktree that was just removed went with it. Functional updates, because
   * this runs right after `deleteSelected` in the same cleanup, before a re-render.
   */
  const reconcileAfterCleanup = useCallback((removedWorktreePaths: string[]) => {
    if (removedWorktreePaths.length === 0) return;
    setTargets((prev) => removeCandidatesWithinPaths(prev, removedWorktreePaths));
    setSelectedPaths((current) => new Set(
      removeCandidatesWithinPaths(
        Array.from(current, (path) => ({ path, size: 0 })),
        removedWorktreePaths,
      ).map((candidate) => candidate.path),
    ));
  }, []);

  return {
    targets: sortedTargets,
    selectedPaths,
    isDeleting,
    error,
    replace,
    toggleSelection,
    setKindPathsSelected,
    deselectAll,
    deleteSelected,
    reconcileAfterCleanup,
    clearError: () => setError(null),
  };
}
