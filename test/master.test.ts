import { test } from "node:test";
import assert from "node:assert/strict";

import { tanhCurve } from "../src/audio/master.ts";

test("the curve is correctly indexed: the endpoints are exactly -1 and +1", () => {
  // The spec maps input -1 to curve[0] and +1 to curve[N-1], so the divisor is N-1.
  // Dividing by N (as MDN's example does) leaves the curve half a step off.
  for (const n of [64, 256, 2048]) {
    const c = tanhCurve(3, n);
    assert.equal(c[n - 1], 1, `n=${n} top`);
    assert.equal(c[0], -1, `n=${n} bottom`);
  }
});

test("the curve is unity-gain at full scale", () => {
  for (const drive of [0.5, 1.6, 5, 50]) {
    assert.ok(Math.abs(tanhCurve(drive)[2047]! - 1) < 1e-12, `drive ${drive}`);
  }
});

test("the curve is odd, so it emits no DC with no input", () => {
  const c = tanhCurve(4, 1025); // odd length puts a sample exactly at zero
  assert.ok(Math.abs(c[512]!) < 1e-12, `f(0) = ${c[512]}`);
  for (let i = 0; i < 512; i++) {
    assert.ok(Math.abs(c[i]! + c[1024 - i]!) < 1e-12, `asymmetric at ${i}`);
  }
});

test("the curve is monotonic and bounded", () => {
  // Non-decreasing rather than strictly increasing: at high drive the tails saturate to
  // the same float, which is the point of a limiter.
  const c = tanhCurve(8);
  for (let i = 1; i < c.length; i++) {
    assert.ok(c[i]! >= c[i - 1]!, `not monotonic at ${i}`);
    assert.ok(c[i]! >= -1 && c[i]! <= 1, `out of range at ${i}`);
  }
  assert.ok(c[1400]! > c[1300]!, "flat where it should still be rising");
});

test("more drive compresses harder in the middle", () => {
  const gentle = tanhCurve(0.5);
  const hard = tanhCurve(8);
  const quarter = Math.floor(2048 * 0.625); // input +0.25
  assert.ok(hard[quarter]! > gentle[quarter]!);
});

test("a degenerate drive does not produce NaN", () => {
  for (const c of [tanhCurve(0), tanhCurve(-1)]) {
    for (const v of c) assert.ok(Number.isFinite(v));
  }
});
