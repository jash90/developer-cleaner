import assert from "node:assert/strict";
import test from "node:test";

import { shortenHome } from "./categories.ts";

test("only the user's own home folder is shortened to ~", () => {
  const home = "/Users/anna";
  assert.equal(shortenHome("/Users/anna/Projects/shop", home), "~/Projects/shop");
  assert.equal(shortenHome("/Users/anna", home), "~");
  assert.equal(shortenHome("/Users/Shared/project", home), "/Users/Shared/project");
  assert.equal(shortenHome("/Users/bob/Projects", home), "/Users/bob/Projects");
  assert.equal(shortenHome("/Users/anna2/Projects", home), "/Users/anna2/Projects");
});

test("a trailing separator or a Windows home folder still shortens, an unknown home never does", () => {
  assert.equal(shortenHome("/home/dev/.cache/uv", "/home/dev/"), "~/.cache/uv");
  assert.equal(shortenHome("C:\\Users\\anna\\AppData", "C:\\Users\\anna"), "~\\AppData");
  assert.equal(shortenHome("/Users/anna/Projects", null), "/Users/anna/Projects");
});
