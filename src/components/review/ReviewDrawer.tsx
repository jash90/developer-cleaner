import { useEffect, useRef, useState } from 'react';
import type { BuildArtifact, CacheTarget, MergedWorktree, NodeModulesFolder } from '../../types';
import { BUILD_KINDS, CATEGORIES, cacheMethodLabel, shortenHome } from '../../utils/categories';
import { categoryTotals } from '../../utils/cleanupSummary';
import { formatSize } from '../../utils/formatSize';
import { ReviewGroup } from './ReviewGroup';

export interface ReviewSelection {
  nodeModules: NodeModulesFolder[];
  buildArtifacts: BuildArtifact[];
  worktrees: MergedWorktree[];
  caches: CacheTarget[];
}

interface ReviewDrawerProps {
  isOpen: boolean;
  selection: ReviewSelection;
  totalCount: number;
  totalSize: number;
  sizeIsEstimate: boolean;
  /** Selected worktrees with uncommitted changes: consent is given for these, by name. */
  needingConsent: MergedWorktree[];
  canDelete: boolean;
  onToggle: {
    node: (path: string) => void;
    build: (path: string) => void;
    worktree: (path: string) => void;
    cache: (path: string) => void;
  };
  onConfirm: () => void;
  onClose: () => void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function ReviewDrawer(props: ReviewDrawerProps) {
  return props.isOpen ? <ReviewDrawerBody {...props} /> : null;
}

function ReviewDrawerBody({
  selection,
  totalCount,
  totalSize,
  sizeIsEstimate,
  needingConsent,
  canDelete,
  onToggle,
  onConfirm,
  onClose,
}: ReviewDrawerProps) {
  const panel = useRef<HTMLElement>(null);
  // Taken while rendering, before "Keep Everything" takes focus, so closing can give it back.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      // A modal keeps Tab and Shift+Tab inside it; the page behind stays out of reach.
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active !== null && panel.current.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Deferred, so the remount StrictMode does in development does not pull focus out.
      setTimeout(() => {
        if (!mounted.current && opener?.isConnected) opener.focus();
      }, 0);
    };
  }, [opener]);

  const toCandidate = (item: { path: string; reclaimable_size: number }) => ({
    path: item.path,
    size: item.reclaimable_size,
  });
  const parts = categoryTotals({
    nodeModules: selection.nodeModules.map(toCandidate),
    buildArtifacts: selection.buildArtifacts.map(toCandidate),
    worktrees: selection.worktrees,
    caches: selection.caches.map(toCandidate),
  });
  const kindLines = BUILD_KINDS
    .map((info) => ({ ...info, count: selection.buildArtifacts.filter((item) => item.kind === info.kind).length }))
    .filter((info) => info.count > 0);
  const staleCount = selection.worktrees.filter((worktree) => worktree.state === 'stale').length;
  // The acknowledgement is remounted whenever the named worktrees change — including when one
  // is unticked here — so a tick given for one set never carries over to another.
  const consentKey = needingConsent.map((worktree) => worktree.path).sort().join('\n');

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Close review" className="absolute inset-0 bg-black/20" onClick={onClose} />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        className="absolute right-0 top-0 bottom-0 w-[460px] max-w-full bg-white shadow-2xl border-l border-slate-200 flex flex-col"
      >
        <div className="px-5 pt-5 pb-3 border-b border-slate-200">
          <h2 id="review-title" className="text-[16px] font-semibold tabular-nums">
            Review {totalCount} {totalCount === 1 ? 'item' : 'items'} · {sizeIsEstimate ? 'at least ' : ''}{formatSize(totalSize)}
          </h2>
          <p className="text-[12px] text-slate-500">
            Everything you picked on any screen, in one place. Untick to keep something.
          </p>
        </div>

        {/* A tab stop of its own, so the list scrolls from the keyboard and the focus trap knows it. */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Selected items"
          className="flex-1 min-h-0 overflow-y-auto px-5 text-[12.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/40"
        >
          {totalCount === 0 && <p className="py-6 text-slate-500">Nothing is selected.</p>}
          <ReviewGroup
            title="node_modules"
            color={CATEGORIES.node.color}
            size={parts.nodeModules}
            items={selection.nodeModules.map((folder) => ({
              key: folder.path,
              name: folder.parent_project,
              detail: shortenHome(folder.path),
            }))}
            onUntick={onToggle.node}
          >
            <p>Deleted permanently; the next install restores them.</p>
          </ReviewGroup>
          <ReviewGroup
            title="Build folders"
            color={CATEGORIES.build.color}
            size={parts.buildArtifacts}
            items={selection.buildArtifacts.map((artifact) => ({
              key: artifact.path,
              name: artifact.parent_project,
              detail: shortenHome(artifact.path),
            }))}
            onUntick={onToggle.build}
          >
            <ul className="space-y-1">
              {kindLines.map((info) => (
                <li key={info.kind}>
                  <b className="text-slate-800">{info.label}</b> · {info.count} — {info.cost}
                </li>
              ))}
            </ul>
          </ReviewGroup>
          <ReviewGroup
            title="Developer caches"
            color={CATEGORIES.caches.color}
            size={parts.caches}
            sizeIsEstimate={sizeIsEstimate}
            items={selection.caches.map((target) => ({
              key: target.path,
              name: target.label,
              detail: shortenHome(target.path),
            }))}
            onUntick={onToggle.cache}
          >
            <ul className="space-y-1">
              {selection.caches.map((target) => (
                <li key={target.path}>
                  <b className="text-slate-800">{target.label}</b> — <span className="font-mono text-[11px]">{cacheMethodLabel(target)}</span>
                  {target.note && <span className="block text-amber-800">{target.note}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-1">
              Re-downloaded on demand. A prune keeps whatever is still referenced; logs are emptied in place.
            </p>
          </ReviewGroup>
          <ReviewGroup
            title="Merged worktrees"
            color={CATEGORIES.worktrees.color}
            size={parts.worktrees}
            items={selection.worktrees.map((worktree) => ({
              key: worktree.path,
              name: `${worktree.branch} · ${worktree.repository_name}`,
              detail: shortenHome(worktree.path),
              danger: worktree.is_dirty,
            }))}
            onUntick={onToggle.worktree}
          >
            <p>
              Files are removed, including ignored files and untracked OS/watcher junk; Git branches are kept.
              {staleCount > 0 && ` ${staleCount} already gone from disk: only the leftover Git registration is pruned.`}
            </p>
          </ReviewGroup>
        </div>

        <ReviewActions
          key={consentKey}
          needingConsent={needingConsent}
          canConfirm={canDelete && totalCount > 0}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      </aside>
    </div>
  );
}

function ReviewActions({
  needingConsent,
  canConfirm,
  onConfirm,
  onClose,
}: {
  needingConsent: MergedWorktree[];
  canConfirm: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const needsConsent = needingConsent.length > 0;
  const allowed = canConfirm && (!needsConsent || acknowledged);
  const count = needingConsent.length;

  return (
    <>
      {/* Pinned above the buttons: losing work takes a deliberate second act, always in view. */}
      {needsConsent && (
        <div role="alert" className="mx-5 my-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px]">
          <p className="font-semibold text-red-800">
            {count === 1 ? '1 worktree has' : `${count} worktrees have`} uncommitted changes. They are not in any commit:
          </p>
          <ul className="mt-1.5 space-y-1 max-h-28 overflow-y-auto">
            {needingConsent.map((worktree) => (
              <li key={worktree.path}>
                <b className="text-red-900">{worktree.branch} · {worktree.repository_name}</b>
                <span className="block text-red-700 text-[11.5px] truncate" title={worktree.path}>
                  {shortenHome(worktree.path)}
                </span>
              </li>
            ))}
          </ul>
          <label className="mt-2.5 flex items-start gap-2 text-red-900 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-0.5 w-3.5 h-3.5 accent-red-600"
            />
            <span>
              {count === 1
                ? 'I understand the uncommitted changes in this worktree will be permanently lost.'
                : `I understand the uncommitted changes in these ${count} worktrees will be permanently lost.`}
            </span>
          </label>
        </div>
      )}
      <div className="px-5 py-4 border-t border-slate-200 flex gap-3">
        <button
          type="button"
          // The safe choice is the default: Return keeps everything.
          autoFocus
          onClick={onClose}
          className="flex-1 h-9 rounded-md border border-slate-300 font-medium hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus:ring-2 focus:ring-blue-500/40"
        >
          Keep Everything
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!allowed}
          title={allowed ? undefined : needsConsent && !acknowledged ? 'Tick the confirmation above first' : undefined}
          className="flex-1 h-9 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {needsConsent ? 'Remove and discard changes' : 'Remove'}
        </button>
      </div>
    </>
  );
}
