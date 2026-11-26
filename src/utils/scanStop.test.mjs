import assert from "node:assert/strict";
import test from "node:test";

import { createStopGate } from "./scanStop.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((done) => setTimeout(done, 0));

test("a scan waits until the stop sent before it has reached the backend", async () => {
  const cancel = deferred();
  const gate = createStopGate(() => cancel.promise);
  let settled = false;

  void gate.stop();
  void gate.settled().then(() => {
    settled = true;
  });
  await tick();
  assert.equal(settled, false);

  cancel.resolve();
  await tick();
  assert.equal(settled, true);
});

test("a failed stop does not block the next scan, and its caller still sees the failure", async () => {
  const cancel = deferred();
  const gate = createStopGate(() => cancel.promise);

  const request = gate.stop();
  cancel.reject(new Error("ipc down"));

  await assert.rejects(request, /ipc down/);
  await gate.settled();
});

test("with no stop sent, a scan starts at once", async () => {
  const gate = createStopGate(() => Promise.resolve());
  await gate.settled();
});
