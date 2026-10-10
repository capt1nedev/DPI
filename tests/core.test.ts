import test from "node:test";
import assert from "node:assert/strict";
import {
  aimDelta,
  candidates,
  cm360,
  DEFAULT_SETTINGS,
  edpi,
  equivalentSensitivity,
  hitsTarget,
  nextCandidate,
  parseSavedData,
  recommendation,
  score,
  targetAt,
  TRIAL_MS,
  validateSettings,
  type Trial,
  type Variant,
} from "../src/core.ts";

const settings = { dpi: 1600, sensitivity: 0.3 };
function trial(
  variant: Variant,
  hits: number,
  extra: Partial<Trial> = {},
): Trial {
  const candidate = candidates(settings).find((c) => c.variant === variant)!;
  return {
    ...candidate,
    id: `${variant}-${hits}`,
    baseline: settings.sensitivity,
    hits,
    shots: hits,
    elapsedMs: TRIAL_MS,
    reactionMs: Array(hits).fill(700),
    inputMode: "raw",
    completedAt: "2026-10-10T12:00:00Z",
    ...extra,
  };
}

test("physical turn distance and DPI conversion preserve eDPI", () => {
  assert.equal(edpi(settings), 480);
  assert.ok(Math.abs(cm360(settings) - 27.214285714285715) < 1e-10);
  assert.equal(equivalentSensitivity(settings, 800), 0.6);
  assert.equal(cm360({ dpi: 800, sensitivity: 0.6 }), cm360(settings));
  assert.equal(aimDelta(100, 0.3), 2.1);
});
test("invalid settings cannot produce an accepted setup", () => {
  for (const dpi of [0, 99, 32001, 1600.5, NaN, Infinity])
    assert.ok(validateSettings(dpi, 0.3));
  for (const sens of [0, -1, 0.009, 10.1, NaN, Infinity])
    assert.ok(validateSettings(1600, sens));
  assert.equal(validateSettings(1600, 0.3), null);
});
test("test candidates and alternating order remain balanced", () => {
  assert.deepEqual(
    candidates(settings).map((c) => c.sensitivity),
    [0.255, 0.3, 0.345],
  );
  const done: Trial[] = [];
  const order: Variant[] = [];
  for (let i = 0; i < 6; i++) {
    const next = nextCandidate(settings, done);
    order.push(next.variant);
    done.push(trial(next.variant, 10));
  }
  assert.deepEqual(order, [
    "current",
    "lower",
    "higher",
    "higher",
    "lower",
    "current",
  ]);
  assert.equal(
    nextCandidate({ dpi: 800, sensitivity: 0.3 }, done).variant,
    "current",
  );
});
test("score penalizes missed shots and includes the whole trial", () => {
  assert.equal(score(trial("current", 10, { shots: 20 })), 12);
  assert.equal(score(trial("current", 0, { shots: 0 })), 0);
});
test("recommendations require repeated trials with comparable input", () => {
  assert.equal(recommendation([trial("higher", 20)], settings).variant, null);
  const done = ["lower", "current", "higher", "lower", "current", "higher"].map(
    (v) => trial(v as Variant, v === "higher" ? 20 : 10),
  );
  assert.equal(recommendation(done, settings).variant, "higher");
  assert.equal(
    recommendation([...done, trial("higher", 20)], settings).variant,
    null,
  );
  assert.equal(
    recommendation(
      done.map((t, i) => (i === 0 ? { ...t, inputMode: "adjusted" } : t)),
      settings,
    ).variant,
    null,
  );
  assert.equal(
    recommendation(done, { dpi: 800, sensitivity: 0.3 }).variant,
    null,
  );
  assert.equal(
    recommendation(
      done.map((t) => ({ ...t, hits: 10, shots: 10 })),
      settings,
    ).variant,
    "current",
  );
  assert.equal(
    recommendation(
      done.map((t) => ({ ...t, hits: 0, shots: 0 })),
      settings,
    ).variant,
    null,
  );
});
test("variable repeat scores do not yield an overconfident recommendation", () => {
  const done = [
    trial("lower", 8),
    trial("lower", 9),
    trial("current", 10),
    trial("current", 10),
    trial("higher", 30),
    trial("higher", 4),
  ];
  assert.equal(recommendation(done, settings).variant, null);
});
test("targets are deterministic, separated, and angular hit detection is correct", () => {
  assert.deepEqual(targetAt(10), targetAt(10));
  for (let i = 0; i < 100; i++) {
    const target = targetAt(i);
    assert.ok(
      target.yaw >= -23 &&
        target.yaw <= 23 &&
        target.pitch >= -11 &&
        target.pitch <= 11,
    );
    assert.equal(hitsTarget(target.yaw, target.pitch, target), true);
    assert.equal(hitsTarget(target.yaw + 5, target.pitch, target), false);
    if (i) {
      const previous = targetAt(i - 1);
      assert.ok(
        Math.hypot(target.yaw - previous.yaw, target.pitch - previous.pitch) >=
          9,
      );
    }
  }
});
test("saved data recovers from corrupt storage and excludes incomplete or forged results", () => {
  assert.deepEqual(parseSavedData("{broken").settings, DEFAULT_SETTINGS);
  const good = trial("current", 10);
  const input = {
    version: 1,
    settings,
    swipeCm: 15,
    trials: [
      good,
      { ...good, elapsedMs: 5000 },
      { ...good, shots: 0 },
      { ...good, variant: "<script>" },
      { ...good, reactionMs: [-1] },
    ],
    rangeChecks: [],
  };
  assert.deepEqual(parseSavedData(JSON.stringify(input)).trials, [good]);
  assert.equal(
    parseSavedData(JSON.stringify({ ...input, swipeCm: -5 })).swipeCm,
    15,
  );
});
