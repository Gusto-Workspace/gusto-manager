const test = require("node:test");
const assert = require("node:assert/strict");
const { createCaptureProfile } = require("../services/design-lab/structural-capture-profile");

test("profil passif : phases et temps exclusifs sans double compter les opérations imbriquées", async () => {
  let clock = 0;
  const profile = createCaptureProfile(() => clock);
  clock = 2;
  profile.phase("mandatory_traversal");
  const value = await profile.time("capture", async () => {
    clock += 3;
    await profile.time("sanitization", async () => { clock += 7; });
    clock += 5;
    return "validated";
  }, { position: 585 });
  assert.equal(value, "validated");
  const first = profile.snapshot();
  assert.deepEqual(first.phases, { identify_scroller: 2, mandatory_traversal: 15 });
  const capture = first.operations.find((span) => span.operation === "capture");
  assert.equal(capture.durationMs, 15);
  assert.equal(capture.selfMs, 8);
  assert.equal(first.events.find((span) => span.operation === "capture").position, 585);
  clock += 2;
  await profile.time("capture", async () => { clock += 4; });
  assert.equal(first.operations.find((span) => span.operation === "capture").count, 1,
    "an earlier snapshot must not change when profiling continues");
  assert.equal(profile.snapshot().elapsedMs, 23);
});

test("profil passif : conserve exactement l'erreur du gate et termine le span en échec", async () => {
  let clock = 0;
  const profile = createCaptureProfile(() => clock);
  const error = Object.assign(new Error("quality gate"), { code: "incomplete_page_capture" });
  await assert.rejects(profile.time("image_gate", async () => { clock += 11; throw error; }),
    (actual) => actual === error);
  const snapshot = profile.snapshot();
  assert.equal(snapshot.events[0].failed, true);
  assert.equal(snapshot.operations[0].selfMs, 11);
  assert.equal(snapshot.phases.identify_scroller, 11);
});
