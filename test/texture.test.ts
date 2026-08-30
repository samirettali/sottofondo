import { test } from "node:test";
import assert from "node:assert/strict";

import { bitCrushCurve } from "../src/audio/fx.ts";
import { genreList } from "../src/genre/index.ts";
import { lofi } from "../src/genre/lofi.ts";

test("the bit-crush curve quantises to the right number of levels", () => {
  for (const bits of [3, 4, 8]) {
    const levels = new Set(bitCrushCurve(bits, 8192));
    // 2^bits steps across [-1, 1], plus the clamped endpoints.
    assert.ok(levels.size <= 2 ** bits + 2, `${bits} bits gave ${levels.size} levels`);
    assert.ok(levels.size >= 2 ** bits - 2, `${bits} bits gave only ${levels.size} levels`);
  }
});

test("more bits means finer steps", () => {
  const coarse = new Set(bitCrushCurve(3, 8192)).size;
  const fine = new Set(bitCrushCurve(8, 8192)).size;
  assert.ok(fine > coarse * 4, `${coarse} vs ${fine}`);
});

test("the curve is monotonic and stays in range", () => {
  const curve = bitCrushCurve(6);
  for (let i = 1; i < curve.length; i++) {
    assert.ok(curve[i]! >= curve[i - 1]!, `not monotonic at ${i}`);
    assert.ok(curve[i]! >= -1 && curve[i]! <= 1, `out of range at ${i}`);
  }
});

test("the curve passes zero through zero, so it adds no DC", () => {
  const curve = bitCrushCurve(5, 4097);
  assert.equal(curve[2048], 0);
});

test("a degenerate bit depth does not produce NaN", () => {
  for (const bits of [0, 1, -4]) {
    for (const v of bitCrushCurve(bits)) assert.ok(Number.isFinite(v));
  }
});

// The rule the whole microtiming section rests on.
test("no genre uses random jitter, and lo-fi uses constant nudge instead", () => {
  for (const genre of genreList()) {
    for (const d of genre.drums) {
      assert.ok(
        (d.jitterMs ?? 0) === 0,
        `${genre.id}/${d.name} uses random jitter, which the literature says reduces groove`,
      );
    }
  }
  const snare = lofi.drums.find((d) => d.name === "snare");
  const hat = lofi.drums.find((d) => d.name === "hat");
  assert.ok((snare?.nudgeMs ?? 0) < 0, "the backbeat should be consistently early");
  assert.equal(hat?.nudgeMs ?? 0, 0, "the hat is the reference grid and stays on it");
  assert.ok((lofi.bass?.nudgeMs ?? 0) < (snare?.nudgeMs ?? 0), "the bass anticipates furthest");
});

test("lo-fi's nudges stay inside the perceptual range they are meant to sit in", () => {
  // Below about 5 ms nothing is perceptible; beyond 25 ms the studies find groove
  // falling away. The bass is deliberately further out, since a low, slow-attack sound
  // has a later and wider perceptual centre.
  for (const d of lofi.drums) {
    const nudge = Math.abs(d.nudgeMs ?? 0);
    assert.ok(nudge === 0 || (nudge >= 5 && nudge <= 25), `${d.name} nudges ${nudge} ms`);
  }
  assert.ok(Math.abs(lofi.bass?.nudgeMs ?? 0) <= 100);
});

test("lo-fi's swing is in Linn's useful band and is not mistaken for a triplet", () => {
  assert.ok(lofi.clock.swing >= 0.54 && lofi.clock.swing <= 0.62);
  assert.notEqual(lofi.clock.swing, 0.66); // 66% is not triplet swing; 66.67% is
});

test("texture settings are sane where a genre declares them", () => {
  for (const genre of genreList()) {
    const t = genre.fx.texture;
    if (t === undefined) continue;
    if (t.vinylDb !== undefined) assert.ok(t.vinylDb < 0, `${genre.id} vinyl is not attenuated`);
    if (t.bitDepth !== undefined) assert.ok(t.bitDepth >= 4 && t.bitDepth <= 16);
    if (t.wowHz !== undefined) assert.ok(t.wowHz > 0 && t.wowHz < 5);
    if (t.wowCents !== undefined) assert.ok(t.wowCents > 0 && t.wowCents < 60);
  }
});
