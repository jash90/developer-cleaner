import type { BuildArtifact, CacheTarget, MergedWorktree, NodeModulesFolder } from '../../types';
import { buildKindInfo, cacheMethodLabel, isPruneTarget, relativeTo } from '../../utils/categories';
import { isSelectableWorktree } from '../../utils/cleanupSummary';
import type { CardRow } from './CategoryCard';

const bySizeDesc = (a: CardRow, b: CardRow) => b.size - a.size;

/** The project folder below the scanned root, e.g. `shop/apps/web` for its node_modules. */
function projectLocation(path: string, scanPath: string | null): string {
  const project = path.replace(/[/\\]node_modules$/, '');
  return relativeTo(project, scanPath);
}

export function nodeModulesRows(
  folders: NodeModulesFolder[],
  selected: ReadonlySet<string>,
  scanPath: string | null,
): CardRow[] {
  return folders.map((folder) => {
    const location = projectLocation(folder.path, scanPath);
    return {
      key: folder.path,
      name: folder.parent_project,
      sub: location === folder.parent_project
        ? folder.package_manager
        : `${location} · ${folder.package_manager}`,
      size: folder.reclaimable_size,
      title: folder.path,
      selected: selected.has(folder.path),
      disabled: false,
    };
  }).sort(bySizeDesc);
}

export function buildArtifactRows(
  artifacts: BuildArtifact[],
  selected: ReadonlySet<string>,
): CardRow[] {
  return artifacts.map((artifact) => {
    const info = buildKindInfo(artifact.kind);
    return {
      key: artifact.path,
      name: artifact.parent_project,
      sub: info.folder,
      size: artifact.reclaimable_size,
      // The cost note travels with every build-folder row, even on the overview.
      title: `${artifact.path}\n${info.label}: ${info.cost}`,
      selected: selected.has(artifact.path),
      disabled: false,
    };
  }).sort(bySizeDesc);
}

export function worktreeRows(
  worktrees: MergedWorktree[],
  selected: ReadonlySet<string>,
  blocked: ReadonlyMap<string, string>,
): CardRow[] {
  return worktrees.map((worktree) => ({
    key: worktree.path,
    name: worktree.branch,
    sub: worktree.repository_name,
    size: worktree.size,
    title: worktree.path,
    selected: selected.has(worktree.path),
    disabled: !isSelectableWorktree(worktree) || blocked.has(worktree.path),
    flag: worktree.is_dirty
      ? 'uncommitted' as const
      : worktree.is_locked
        ? 'locked' as const
        : blocked.has(worktree.path) ? 'blocked' as const : null,
  })).sort(bySizeDesc);
}

export function cacheRows(targets: CacheTarget[], selected: ReadonlySet<string>): CardRow[] {
  return targets.map((target) => {
    const prune = isPruneTarget(target);
    return {
      key: target.path,
      name: target.label,
      sub: cacheMethodLabel(target),
      // A prune keeps whatever is still referenced, so its row shows the current size, muted.
      size: prune ? target.allocated_size : target.reclaimable_size,
      sizeMuted: prune,
      sizeTitle: prune ? 'Current size. The prune frees part of this, known only once it runs.' : undefined,
      title: target.note ? `${target.path}\n${target.note}` : target.path,
      selected: selected.has(target.path),
      disabled: false,
    };
  }).sort(bySizeDesc);
}

/** "pnpm 36 · npm 35 · yarn 18", most used first. */
export function managerSummary(folders: NodeModulesFolder[]): string {
  const counts = new Map<string, number>();
  folders.forEach((folder) => counts.set(folder.package_manager, (counts.get(folder.package_manager) ?? 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([manager, count]) => `${manager} ${count}`)
    .join(' · ');
}
