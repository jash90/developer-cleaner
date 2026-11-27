import assert from "node:assert/strict";
import test from "node:test";

import { reclaimableOnVolume, spaceFor } from "./diskSpace.ts";

const GB = 1024 ** 3;
const volume = (mount_point) => ({ available_bytes: 10 * GB, total_bytes: 100 * GB, mount_point, volume_name: mount_point });

test("caches on another volume do not add to the free space forecast", () => {
  assert.equal(reclaimableOnVolume(30 * GB, 20 * GB, false), 10 * GB);
  assert.equal(reclaimableOnVolume(30 * GB, 20 * GB, true), 30 * GB);
});

test("a reading for another folder is not returned for the current one", () => {
  const reading = { path: "/Volumes/A/projects", space: volume("/Volumes/A") };
  assert.equal(spaceFor(reading, "/Volumes/B/projects"), null);
  assert.equal(spaceFor(reading, "/Volumes/A/projects"), reading.space);
  assert.equal(spaceFor(null, null), null);
});
