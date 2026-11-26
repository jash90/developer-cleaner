import { useCallback, useState } from 'react';
import { useCleanup } from './hooks/useCleanup';
import { useDevCaches } from './hooks/useDevCaches';
import { useDiskSpace } from './hooks/useDiskSpace';
import { useSettings } from './hooks/useSettings';
import { BuildFoldersPage } from './components/drilldown/BuildFoldersPage';
import { CachesPage } from './components/drilldown/CachesPage';
import { NodeModulesPage } from './components/drilldown/NodeModulesPage';
import { WorktreesPage } from './components/drilldown/WorktreesPage';
import { Banners } from './components/layout/Banners';
import { SelectionBar } from './components/layout/SelectionBar';
import { Toolbar } from './components/layout/Toolbar';
import { Overview } from './components/overview/Overview';
import type { HeroScan } from './components/overview/Hero';
import { ReviewDrawer } from './components/review/ReviewDrawer';
import { SettingsPanel } from './components/SettingsPanel';
import type { View } from './components/view';
import { CATEGORIES, shortenHome } from './utils/categories';

const PAGE_TITLES: Record<Exclude<View['page'], 'overview'>, string> = {
  node: CATEGORIES.node.label,
  build: CATEGORIES.build.label,
  worktrees: CATEGORIES.worktrees.label,
  caches: CATEGORIES.caches.label,
};

function App() {
  const caches = useDevCaches();
  const cleanup = useCleanup(caches);
  const settings = useSettings();
  const [view, setView] = useState<View>({ page: 'overview' });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const {
    nodeModules,
    buildArtifacts,
    mergedWorktrees,
    scanPath,
    isScanning,
    isScanningFolders,
    isScanningWorktrees,
    isDeleting,
    canDelete,
    summary,
    selectedWorktreesNeedingConsent,
  } = cleanup;
  const disk = useDiskSpace(scanPath, isScanning || isDeleting);
  // Caches live under the home folder; they count toward the scanned volume only if it holds it.
  const homeDisk = useDiskSpace(null, isScanning || isDeleting);
  const cachesOnDiskVolume = disk !== null && homeDisk !== null && disk.mount_point === homeDisk.mount_point;
  const projectSelectionDisabled = isDeleting || isScanning;

  const closeReview = useCallback(() => setReviewOpen(false), []);
  const confirmRemoval = () => {
    setReviewOpen(false);
    void cleanup.deleteSelected();
  };

  const timing = cleanup.folderScanTiming;
  // The folder walk is the long one, so its last duration is the estimate; once it is done,
  // a worktree scan still running shows elapsed time only.
  const heroScan: HeroScan | null = !timing || !(isScanningFolders || isScanningWorktrees)
    ? null
    : isScanningFolders
      ? {
        subject: isScanningWorktrees ? 'node_modules, build folders and merged worktrees' : 'node_modules and build folders',
        startedAt: timing.startedAt,
        expectedMs: timing.expectedMs,
        onStop: cleanup.stopScan,
        isStopping: cleanup.isStopping,
      }
      : {
        subject: 'merged worktrees',
        startedAt: timing.startedAt,
        expectedMs: null,
        onStop: cleanup.stopScan,
        isStopping: cleanup.isStopping,
      };

  const selection = {
    nodeModules: nodeModules.folders.filter((folder) => nodeModules.selectedPaths.has(folder.path)),
    buildArtifacts: buildArtifacts.targets.filter((target) => buildArtifacts.selectedPaths.has(target.path)),
    worktrees: mergedWorktrees.worktrees.filter((worktree) => mergedWorktrees.selectedPaths.has(worktree.path)),
    caches: caches.targets.filter((target) => caches.selectedIds.has(target.path)),
  };

  const page = (() => {
    switch (view.page) {
      case 'overview':
        return (
          <Overview
            cleanup={cleanup}
            caches={caches}
            disk={disk}
            cachesOnVolume={cachesOnDiskVolume}
            scan={heroScan}
            scanLabel={scanPath ? shortenHome(scanPath) : null}
            onNavigate={setView}
            onChooseFolder={() => void cleanup.scan()}
          />
        );
      case 'node':
        return (
          <NodeModulesPage
            nodeModules={nodeModules}
            scanPath={scanPath}
            state={cleanup.folderListState}
            selectionDisabled={projectSelectionDisabled}
          />
        );
      case 'build':
        return (
          <BuildFoldersPage
            buildArtifacts={buildArtifacts}
            filter={view.filter}
            listBuiltAt={cleanup.foldersListedAt}
            scanPath={scanPath}
            state={cleanup.folderListState}
            selectionDisabled={projectSelectionDisabled}
            onClearFilter={() => setView({ page: 'build', filter: null })}
          />
        );
      case 'worktrees':
        return (
          <WorktreesPage
            mergedWorktrees={mergedWorktrees}
            total={cleanup.totals.worktrees}
            trayMismatch={cleanup.trayMismatch}
            state={cleanup.worktreeListState}
            onRescan={() => void cleanup.rescan()}
            busy={isScanning || isDeleting}
            selectionDisabled={projectSelectionDisabled}
          />
        );
      case 'caches':
        return (
          <CachesPage
            caches={caches}
            filter={view.filter}
            selectionDisabled={isDeleting}
            onClearFilter={() => setView({ page: 'caches', filter: null })}
          />
        );
    }
  })();

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 text-[13px] overflow-hidden">
      <Toolbar
        pageTitle={view.page === 'overview' ? null : PAGE_TITLES[view.page]}
        onBack={() => setView({ page: 'overview' })}
        scanPath={scanPath}
        isScanning={isScanning}
        scanStopped={cleanup.scanStopped}
        listBuiltAt={cleanup.listBuiltAt}
        canRescan={!isScanning && !isDeleting}
        canChooseFolder={!isScanning && !isDeleting}
        onRescan={() => void cleanup.rescan()}
        onChooseFolder={() => void cleanup.scan()}
        onOpenSettings={() => setShowSettings(true)}
      />
      <Banners
        report={cleanup.lastReport}
        errors={cleanup.errors}
        onDismissReport={cleanup.clearReport}
        onDismissErrors={cleanup.clearError}
      />
      {/* The tray mismatch lives on the worktree page; elsewhere a short pointer leads there. */}
      {cleanup.trayMismatch && view.page !== 'worktrees' && (
        <div role="status" className="flex-none px-6 py-1.5 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900 flex items-center gap-3">
          The menu bar counts {cleanup.trayMismatch.trayCount} removable worktrees here, this list shows
          {' '}{cleanup.trayMismatch.windowCount}. The worktree list may be out of date.
          <button
            type="button"
            onClick={() => void cleanup.rescan()}
            disabled={isScanning || isDeleting}
            className="ml-auto h-6 px-2 rounded bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            Rescan now
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 flex flex-col">{page}</div>
      <SelectionBar
        count={summary.totalCount}
        size={summary.totalSize}
        sizeIsEstimate={summary.hasEstimate}
        dirtyCount={selectedWorktreesNeedingConsent.length}
        isDeleting={isDeleting}
        canReview={!isDeleting}
        onClear={cleanup.clearSelection}
        onReview={() => setReviewOpen(true)}
      />

      <ReviewDrawer
        isOpen={reviewOpen}
        selection={selection}
        totalCount={summary.totalCount}
        totalSize={summary.totalSize}
        sizeIsEstimate={summary.hasEstimate}
        needingConsent={selectedWorktreesNeedingConsent}
        canDelete={canDelete}
        onToggle={{
          node: nodeModules.toggleSelection,
          build: buildArtifacts.toggleSelection,
          worktree: mergedWorktrees.toggleSelection,
          cache: caches.toggleSelection,
        }}
        onConfirm={confirmRemoval}
        onClose={closeReview}
      />

      <SettingsPanel
        isOpen={showSettings}
        settings={settings.settings}
        dockToggleAvailable={settings.dockToggleAvailable}
        isBusy={settings.isBusy || !settings.isLoaded}
        error={settings.error}
        onSetHideDock={(hidden) => void settings.setHideDock(hidden)}
        onAddFolder={() => void settings.addFolder()}
        onRemoveFolder={(folder) => void settings.removeFolder(folder)}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}

export default App;
