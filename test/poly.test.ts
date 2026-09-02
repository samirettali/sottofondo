import { test } from "node:test";
import assert from "node:assert/strict";

import { pulseCoefficients } from "../src/audio/poly.ts";

test("a 50% pulse is a square: odd harmonics only, falling as 1/k", () => {
  const { real, imag } = pulseCoefficients(0.5, 16);
  assert.equal(real[0], 0, "DC must be removed");
  for (let k = 1; k <= 16; k++) {
    assert.equal(imag[k], 0);
    // Float32 storage: compare at single precision, not double.
    if (k % 2 === 0) assert.ok(Math.abs(real[k]!) < 1e-6, `even harmonic ${k} present`);
    else assert.ok(Math.abs(Math.abs(real[k]!) - 2 / (k * Math.PI)) < 1e-6, `harmonic ${k}`);
  }
});

test("a narrower pulse keeps more of its even harmonics — the thin NES lead", () => {
  const square = pulseCoefficients(0.5, 16).real;
  const thin = pulseCoefficients(0.125, 16).real;
  assert.ok(Math.abs(thin[2]!) > Math.abs(square[2]!));
  assert.ok(Math.abs(thin[4]!) > Math.abs(square[4]!));
  // And less fundamental, which is why it sits behind the wider one.
  assert.ok(Math.abs(thin[1]!) < Math.abs(square[1]!));
});

test("duty is clamped away from silence at both ends", () => {
  for (const d of [0, 1, -3, 7]) {
    const { real } = pulseCoefficients(d, 8);
    assert.ok(real.some((v) => Math.abs(v) > 1e-6), `duty ${d} produced silence`);
    for (const v of real) assert.ok(Number.isFinite(v));
  }
});

test("harmonic count is honoured", () => {
  assert.equal(pulseCoefficients(0.25, 32).real.length, 33);
});
