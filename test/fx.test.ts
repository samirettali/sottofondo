import { test } from "node:test";
import assert from "node:assert/strict";

import { delaySeconds } from "../src/audio/fx.ts";

test("delay divisions are correct at 120 BPM, where a beat is half a second", () => {
  assert.equal(delaySeconds("1/4", 120), 0.5);
  assert.equal(delaySeconds("1/8", 120), 0.25);
  assert.equal(delaySeconds("1/16", 120), 0.125);
  assert.equal(delaySeconds("3/16", 120), 0.375); // dotted eighth
  assert.equal(delaySeconds("1/2", 120), 1);
  assert.ok(Math.abs(delaySeconds("1/8T", 120) - 1 / 6) < 1e-12);
});

test("dotted eighth is three quarters of a beat at any tempo", () => {
  for (const bpm of [90, 128, 138, 174]) {
    assert.ok(Math.abs(delaySeconds("3/16", bpm) - (0.75 * 60) / bpm) < 1e-12);
  }
});

test("delay time falls as tempo rises", () => {
  assert.ok(delaySeconds("3/16", 174) < delaySeconds("3/16", 138));
});

test("every division fits inside the two-second buffer at usable tempos", () => {
  const values = ["1/16", "1/8T", "1/8", "3/16", "1/4", "1/2"] as const;
  for (const v of values) {
    assert.ok(delaySeconds(v, 60) <= 2, `${v} at 60 BPM overflows the delay line`);
  }
});
