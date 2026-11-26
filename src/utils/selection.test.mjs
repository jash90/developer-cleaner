import assert from "node:assert/strict";
import test from "node:test";

import { isFilterShown } from "./selection.ts";

test("the active filter keeps its button after its last entry is removed", () => {
  assert.equal(isFilterShown("dirty", "dirty", 0), true);
});

test("an empty filter that is not active is hidden, and all is always shown", () => {
  assert.equal(isFilterShown("dirty", "all", 0), false);
  assert.equal(isFilterShown("dirty", "all", 2), true);
  assert.equal(isFilterShown("all", "dirty", 0), true);
});
