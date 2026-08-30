import { test } from "node:test";
import assert from "node:assert/strict";

import {
  autoSwing,
  beatOfStep,
  beatToTime,
  compositeCycleSteps,
  floorMod,
  gcd,
  lcm,
  patternIndex,
  setBpm,
  swingOffsetBeats,
  swingRatio,
  tempoMap,
  timeToBeat,
  track,
} from "../src/core/time.ts";

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

test("floorMod wraps negatives, unlike %", () => {
  assert.equal(floorMod(-1, 16), 15);
  assert.equal(floorMod(-17, 16), 15);
  assert.equal(floorMod(17, 16), 1);
  assert.equal(-1 % 16, -1); // the trap this exists to avoid
});

test("gcd and lcm", () => {
  assert.equal(gcd(12, 18), 6);
  assert.equal(lcm(4, 6), 12);
  assert.equal(lcm(5, 16), 80);
  assert.equal(lcm(0, 5), 0);
});

test("beat and time round-trip", () => {
  const map = tempoMap(120);
  close(beatToTime(map, 4), 2);
  close(timeToBeat(map, 2), 4);
  close(timeToBeat(map, beatToTime(map, 13.25)), 13.25);
});

test("a tempo change re-anchors instead of moving the past", () => {
  const a = tempoMap(120);
  const atTime = 2; // beat 4
  const b = setBpm(a, 240, atTime);
  close(b.anchorBeat, 4);
  close(beatToTime(b, 4), 2); // the anchor itself does not move
  close(beatToTime(b, 8), 3); // four beats now take one second, not two
});

test("beatOfStep is exact at the base grid", () => {
  const t = track(16);
  close(beatOfStep(t, 0), 0);
  close(beatOfStep(t, 4), 1);
  close(beatOfStep(t, 16), 4);
});

test("beatOfStep never accumulates error", () => {
  // The failure mode this guards: nextBeat += delta, over and over. A binary-exact
  // delta like 1/4 survives it, but a triplet grid does not.
  const triplets = track(12, { rateNum: 3, rateDen: 1 });
  const delta = 1 / 12;
  let accumulated = 0;
  for (let i = 0; i < 30_000; i++) accumulated += delta;
  const derived = beatOfStep(triplets, 30_000);
  assert.equal(derived, 2500); // exact, because it is one multiply
  assert.notEqual(accumulated, derived); // drifted
});

test("beatOfStep accepts fractional steps, for flams and rolls", () => {
  const t = track(16);
  close(beatOfStep(t, 3.5), 0.875);
});

test("a rate multiplier gives polyrhythm", () => {
  const triplets = track(12, { rateNum: 3, rateDen: 2 });
  close(beatOfStep(triplets, 3), 0.5); // three steps of this lane per half beat
  close(beatOfStep(triplets, 6), 1);
});

test("rotation moves content on the grid", () => {
  const t = track(8, { rotation: 3 });
  assert.equal(patternIndex(t, 0), 5);
  assert.equal(patternIndex(t, 3), 0);
  assert.equal(patternIndex(t, 2), 7);
});

test("offsetBeats delays a lane off the grid, independently of rotation", () => {
  const t = track(8, { offsetBeats: 0.125 });
  close(beatOfStep(t, 0), 0.125);
  assert.equal(patternIndex(t, 0), 0);
});

test("composite cycle is the LCM, and coprime lengths maximise it", () => {
  assert.equal(compositeCycleSteps([track(16)]), 16);
  assert.equal(compositeCycleSteps([track(5), track(16)]), 80);
  assert.equal(compositeCycleSteps([track(7), track(16)]), 112);
  assert.equal(compositeCycleSteps([track(5), track(7), track(16)]), 560);
  // Sharing a factor of 2 realigns early: 48, not 96.
  assert.equal(compositeCycleSteps([track(6), track(16)]), 48);
});

test("swing at 50% is straight", () => {
  for (let s = 0; s < 16; s++) assert.equal(swingOffsetBeats(s, 0.5), 0);
});

test("swing delays only the second sixteenth of each pair", () => {
  const even = [0, 2, 4, 6].map((s) => swingOffsetBeats(s, 0.62));
  const odd = [1, 3, 5, 7].map((s) => swingOffsetBeats(s, 0.62));
  assert.deepEqual(even, [0, 0, 0, 0]);
  for (const o of odd) assert.ok(o > 0, `expected a delay, got ${o}`);
});

test("swing magnitude matches the Linn ratio", () => {
  // 62% of an eighth-note pair, in beats: (0.62 - 0.5) * 0.5.
  close(swingOffsetBeats(1, 0.62), 0.06);
  // At 90 BPM one beat is 2/3 s, so that is 40 ms — the published figure.
  close(swingOffsetBeats(1, 0.62) * (60 / 90) * 1000, 40);
});

test("per-voice swing depth scales the offset", () => {
  close(swingOffsetBeats(1, 0.62, 16, 0.5), 0.03);
  assert.equal(swingOffsetBeats(1, 0.62, 16, 0), 0);
});

test("eighth-note swing delays every other eighth", () => {
  assert.equal(swingOffsetBeats(0, 0.66, 8), 0);
  assert.equal(swingOffsetBeats(1, 0.66, 8), 0); // mid-pair, not a pair boundary
  assert.ok(swingOffsetBeats(2, 0.66, 8) > 0);
});

test("swingRatio: 66.67% is a true triplet, 66% is not", () => {
  close(swingRatio(2 / 3), 2, 1e-9);
  assert.ok(Math.abs(swingRatio(0.66) - 1.941) < 0.001);
});

test("autoSwing reproduces the Friberg curve", () => {
  close(autoSwing(200), 2 / 3, 1e-9); // exactly 2:1 at 200 BPM
  assert.equal(autoSwing(100), 0.75); // clamped at the 3:1 ceiling
  assert.equal(autoSwing(300), 0.5); // straight at the top
  assert.ok(autoSwing(150) > autoSwing(250)); // monotonically falling
});

test("autoSwing holds the short note near 100 ms", () => {
  for (const bpm of [160, 180, 200, 220]) {
    const pair = 60 / bpm; // a beat, split into two swung eighths
    const short = pair * (1 - autoSwing(bpm));
    assert.ok(Math.abs(short - 0.1) < 0.001, `${bpm} BPM gave ${short * 1000} ms`);
  }
});
