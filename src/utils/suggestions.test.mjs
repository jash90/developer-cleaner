import assert from "node:assert/strict";
import test from "node:test";

import {
  CACHE_LIKE_BUILD_KINDS,
  OLD_RUST_TARGET_DAYS,
  computeSuggestions,
  guardSelection,
  isUntouchedFor,
} from "./suggestions.ts";

const NOW = 1_800_000_000;
const DAY = 86_400;

const artifact = (path, kind, size, ageDays = 1) => ({
  path,
  kind,
  reclaimable_size: size,
  last_modified: ageDays === null ? null : NOW - ageDays * DAY,
});

const worktree = (path, overrides = {}) => ({
  path,
  size: 1_000,
  is_dirty: false,
  is_locked: false,
  has_ignored_files: false,
  state: "merged",
  ...overrides,
});

const cache = (path, kind, overrides = {}) => ({
  path,
  kind,
  label: path,
  reclaimable_size: 100,
  safety: "safe",
  cleanup: { type: "remove_dir" },
  note: null,
  ...overrides,
});

const input = (overrides = {}) => ({
  buildArtifacts: [],
  worktrees: [],
  blockedWorktreePaths: new Set(),
  caches: [],
  nowSeconds: NOW,
  ...overrides,
});

const byId = (suggestions, id) => suggestions.find((suggestion) => suggestion.id === id);

test("makes no suggestion from a category whose scan has not returned", () => {
  assert.deepEqual(
    computeSuggestions(input({ buildArtifacts: null, worktrees: null, caches: null })),
    [],
  );
});

test("omits rules with nothing to offer", () => {
  assert.deepEqual(computeSuggestions(input()), []);
});

test("orders suggestions safest first", () => {
  const suggestions = computeSuggestions(input({
    buildArtifacts: [
      artifact("/p/a/.nx", "nx_cache", 10),
      artifact("/p/b/target", "cargo_target", 500, 90),
    ],
    worktrees: [worktree("/w/clean")],
    caches: [
      cache("/c/old-store", "orphaned_store"),
      cache("/c/npm", "package_manager"),
    ],
  }));

  assert.deepEqual(suggestions.map((suggestion) => suggestion.id), [
    "abandoned-stores",
    "cache-build-folders",
    "clean-worktrees",
    "old-rust-targets",
    "package-manager-caches",
  ]);
});

test("offers one-click select only for clean worktrees and safe abandoned stores", () => {
  const suggestions = computeSuggestions(input({
    buildArtifacts: [
      artifact("/p/a/.nx", "nx_cache", 10),
      artifact("/p/b/target", "cargo_target", 500, 90),
    ],
    worktrees: [worktree("/w/clean")],
    caches: [
      cache("/c/old-store", "orphaned_store"),
      cache("/c/npm", "package_manager"),
    ],
  }));

  const selecting = suggestions.filter((suggestion) => suggestion.action.type === "select");
  assert.deepEqual(selecting.map((suggestion) => suggestion.id), ["abandoned-stores", "clean-worktrees"]);
  // Build folders are never selected by a suggestion.
  assert.ok(suggestions
    .filter((suggestion) => suggestion.category === "build")
    .every((suggestion) => suggestion.action.type === "review"));
});

test("clean worktrees leave out dirty, locked, stale and blocked ones", () => {
  const worktrees = [
    worktree("/w/clean", { size: 300 }),
    worktree("/w/squashed", { size: 200, state: "squashed" }),
    worktree("/w/dirty", { is_dirty: true }),
    worktree("/w/locked", { is_locked: true }),
    worktree("/w/stale", { state: "stale", size: 0 }),
    worktree("/w/blocked"),
  ];
  const suggestion = byId(computeSuggestions(input({
    worktrees,
    blockedWorktreePaths: new Map([["/w/blocked", "Changed since scan"]]),
  })), "clean-worktrees");

  assert.deepEqual(suggestion.action, {
    type: "select",
    category: "worktrees",
    paths: ["/w/clean", "/w/squashed"],
  });
  assert.equal(suggestion.size, 500);
  assert.equal(suggestion.title, "2 clean merged worktrees");
});

test("clean worktrees say when ignored files go with them", () => {
  const suggestion = byId(computeSuggestions(input({
    worktrees: [worktree("/w/a", { has_ignored_files: true }), worktree("/w/b")],
  })), "clean-worktrees");

  assert.match(suggestion.why, /Ignored files in 1 of them go too\./);
});

test("abandoned stores select only safe stores that are deleted outright", () => {
  const suggestion = byId(computeSuggestions(input({
    caches: [
      cache("/c/safe", "orphaned_store", { reclaimable_size: 900, label: "pnpm store v3 (abandoned)" }),
      cache("/c/review", "orphaned_store", { safety: "needs_review" }),
      cache("/c/prune", "orphaned_store", { cleanup: { type: "external_command" } }),
      cache("/c/npm", "package_manager"),
    ],
  })), "abandoned-stores");

  assert.deepEqual(suggestion.action, { type: "select", category: "caches", paths: ["/c/safe"] });
  assert.equal(suggestion.title, "pnpm store v3 (abandoned)");
  assert.equal(suggestion.size, 900);
});

test("cache-type build folders span several kinds and only open the filtered review", () => {
  const suggestion = byId(computeSuggestions(input({
    buildArtifacts: [
      artifact("/p/a/.nx", "nx_cache", 10),
      artifact("/p/b/.turbo", "turbo_cache", 20),
      artifact("/p/c/coverage", "coverage", 5),
      artifact("/p/d/.next", "next_build", 1_000),
      artifact("/p/e/Pods", "cocoapods", 1_000),
    ],
  })), "cache-build-folders");

  assert.equal(suggestion.action.type, "review");
  assert.deepEqual(suggestion.action.filter.kinds, ["nx_cache", "turbo_cache", "coverage"]);
  assert.ok(suggestion.action.filter.kinds.every((kind) => CACHE_LIKE_BUILD_KINDS.includes(kind)));
  assert.equal(suggestion.size, 35);
  assert.equal(suggestion.why, "3 .nx, .turbo and coverage folders. Recreated on the next run.");
});

test("old Rust targets count only known ages past the threshold and only open the review", () => {
  const suggestion = byId(computeSuggestions(input({
    buildArtifacts: [
      artifact("/p/old/target", "cargo_target", 400, OLD_RUST_TARGET_DAYS + 1),
      artifact("/p/edge/target", "cargo_target", 300, OLD_RUST_TARGET_DAYS),
      artifact("/p/new/target", "cargo_target", 200, OLD_RUST_TARGET_DAYS - 1),
      artifact("/p/unknown/target", "cargo_target", 100, null),
      artifact("/p/old-next/.next", "next_build", 50, 365),
    ],
  })), "old-rust-targets");

  assert.equal(suggestion.size, 700);
  assert.equal(suggestion.count, 2);
  assert.deepEqual(suggestion.action, {
    type: "review",
    filter: {
      category: "build",
      kinds: ["cargo_target"],
      untouchedForDays: OLD_RUST_TARGET_DAYS,
      label: "Rust targets untouched for 2+ months",
    },
  });
});

test("isUntouchedFor treats an unknown age as recent", () => {
  assert.equal(isUntouchedFor(null, 0, NOW), false);
  assert.equal(isUntouchedFor(NOW - 10 * DAY, 10, NOW), true);
  assert.equal(isUntouchedFor(NOW - 9 * DAY, 10, NOW), false);
});

test("package manager caches are review only, name their notes and flag prune estimates", () => {
  const suggestion = byId(computeSuggestions(input({
    caches: [
      cache("/c/npm", "package_manager", { reclaimable_size: 600 }),
      cache("/c/pnpm", "package_manager", { reclaimable_size: 0, cleanup: { type: "external_command" } }),
      cache("/c/gradle", "package_manager", {
        label: "Gradle caches",
        safety: "needs_review",
        note: "Offline builds fail until then.",
      }),
      cache("/c/node18", "runtime"),
    ],
  })), "package-manager-caches");

  assert.equal(suggestion.action.type, "review");
  assert.deepEqual(suggestion.action.filter.cacheKinds, ["package_manager"]);
  assert.equal(suggestion.size, 700);
  assert.equal(suggestion.isEstimate, true);
  assert.equal(suggestion.why, "Re-downloaded on demand. Gradle caches has a note to read first.");
});

test("guardSelection drops rows that stopped passing the rule since the suggestion", () => {
  const [stores, worktrees] = computeSuggestions(input({
    worktrees: [worktree("/w/a"), worktree("/w/b"), worktree("/w/c")],
    caches: [cache("/c/old", "orphaned_store")],
  }));

  // Since then: /w/a turned dirty, /w/b was blocked, /w/c is gone, /w/d is new.
  const current = {
    worktrees: [worktree("/w/a", { is_dirty: true }), worktree("/w/b"), worktree("/w/d")],
    blockedWorktreePaths: new Set(["/w/b"]),
    caches: [cache("/c/old", "orphaned_store", { safety: "needs_review" })],
  };

  assert.deepEqual(guardSelection(worktrees.action, current), []);
  assert.deepEqual(guardSelection(stores.action, current), []);
});

test("guardSelection passes rows that still qualify and never selects for a review", () => {
  const current = {
    worktrees: [worktree("/w/a"), worktree("/w/b", { is_locked: true })],
    blockedWorktreePaths: new Set(),
    caches: [cache("/c/old", "orphaned_store")],
  };

  assert.deepEqual(
    guardSelection({ type: "select", category: "worktrees", paths: ["/w/a", "/w/b"] }, current),
    ["/w/a"],
  );
  assert.deepEqual(
    guardSelection({ type: "select", category: "caches", paths: ["/c/old"] }, current),
    ["/c/old"],
  );
  assert.deepEqual(
    guardSelection({
      type: "review",
      filter: { category: "build", kinds: ["cargo_target"], label: "x" },
    }, current),
    [],
  );
});
