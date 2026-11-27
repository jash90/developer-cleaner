import assert from "node:assert/strict";
import test from "node:test";

import { emptyListMessage, listState } from "./scanState.ts";

const base = { scanPath: "/projects", scanning: false, stopped: false, failed: false };

test("an empty list says nothing was found only after a scan that finished", () => {
  const found = "No merged worktrees found.";
  const message = (overrides) => emptyListMessage(listState({ ...base, ...overrides }), "merged worktrees", found);

  assert.equal(message({}), found);
  assert.notEqual(message({ scanning: true }), found);
  assert.notEqual(message({ stopped: true }), found);
  assert.notEqual(message({ failed: true }), found);
  assert.notEqual(message({ scanPath: null }), found);
});

test("a running scan wins over the flags left by the previous one", () => {
  assert.equal(listState({ ...base, scanning: true, stopped: true, failed: true }), "scanning");
  assert.equal(listState({ ...base, stopped: true, failed: true }), "stopped");
  assert.equal(listState({ ...base, scanPath: null, scanning: true }), "waiting");
});
