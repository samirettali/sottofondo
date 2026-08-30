import { test } from "node:test";
import assert from "node:assert/strict";

import {
  bjorklund,
  euclid,
  intervalVector,
  NAMED_RHYTHMS,
  namedRhythm,
  toBox,
} from "../src/pattern/euclid.ts";

/**
 * Transcribed from Toussaint's extended BRIDGES 2005 paper. These are the reference
 * values: if this table and the implementation disagree, the implementation is wrong.
 */
const TOUSSAINT: readonly (readonly [number, number, string])[] = [
  [2, 3, "xx."],
  [2, 5, "x.x.."],
  [3, 4, "xxx."],
  [3, 5, "x.x.x"],
  [3, 7, "x.x.x.."],
  [3, 8, "x..x..x."],
  [4, 7, "x.x.x.x"],
  [4, 9, "x.x.x.x.."],
  [4, 11, "x..x..x..x."],
  [5, 6, "xxxxx."],
  [5, 7, "x.xx.xx"],
  [5, 8, "x.xx.xx."],
  [5, 9, "x.x.x.x.x"],
  [5, 11, "x.x.x.x.x.."],
  [5, 12, "x..x.x..x.x."],
  [5, 13, "x..x.x..x.x.."],
  [5, 16, "x..x..x..x..x..."],
  [7, 8, "xxxxxxx."],
  [7, 12, "x.xx.x.xx.x."],
  [7, 16, "x..x.x.x..x.x.x."],
  [9, 16, "x.xx.x.x.xx.x.x."],
  [11, 24, "x..x.x.x.x.x..x.x.x.x.x."],
  [13, 24, "x.xx.x.x.x.x.xx.x.x.x.x."],
];

test("matches Toussaint's published table", () => {
  for (const [k, n, expected] of TOUSSAINT) {
    assert.equal(toBox(bjorklund(k, n)), expected, `E(${k},${n})`);
  }
});

test("interval vectors match the published ones", () => {
  assert.deepEqual(intervalVector(bjorklund(3, 8)), [3, 3, 2]); // tresillo (332)
  assert.deepEqual(intervalVector(bjorklund(5, 8)), [2, 1, 2, 1, 2]); // cinquillo
  assert.deepEqual(intervalVector(bjorklund(5, 16)), [3, 3, 3, 3, 4]); // bossa necklace
  assert.deepEqual(intervalVector(bjorklund(7, 12)), [2, 1, 2, 2, 1, 2, 2]);
});

test("onset count is exactly k, and length exactly n", () => {
  for (let n = 1; n <= 32; n++) {
    for (let k = 0; k <= n; k++) {
      const p = bjorklund(k, n);
      assert.equal(p.length, n, `E(${k},${n}) length`);
      assert.equal(p.reduce((a, b) => a + b, 0), k, `E(${k},${n}) onsets`);
    }
  }
});

test("every pattern starts on an onset when k > 0", () => {
  for (let n = 1; n <= 32; n++) {
    for (let k = 1; k <= n; k++) {
      assert.equal(bjorklund(k, n)[0], 1, `E(${k},${n}) does not start on an onset`);
    }
  }
});

test("intervals are maximally even: at most two distinct gap sizes, differing by one", () => {
  for (let n = 2; n <= 32; n++) {
    for (let k = 1; k <= n; k++) {
      const sizes = [...new Set(intervalVector(bjorklund(k, n)))].sort((a, b) => a - b);
      assert.ok(sizes.length <= 2, `E(${k},${n}) has gaps ${sizes.join(",")}`);
      if (sizes.length === 2) {
        assert.equal(sizes[1]! - sizes[0]!, 1, `E(${k},${n}) gaps ${sizes.join(",")}`);
      }
    }
  }
});

test("degenerate inputs are handled rather than thrown", () => {
  assert.deepEqual(bjorklund(0, 4), [0, 0, 0, 0]);
  assert.deepEqual(bjorklund(4, 4), [1, 1, 1, 1]);
  assert.deepEqual(bjorklund(9, 4), [1, 1, 1, 1]); // clamped
  assert.deepEqual(bjorklund(-1, 4), [0, 0, 0, 0]);
  assert.deepEqual(bjorklund(3, 0), []);
});

test("rotation shifts left and wraps, including negatives", () => {
  assert.equal(toBox(euclid(3, 8, 0)), "x..x..x.");
  assert.equal(toBox(euclid(3, 8, 1)), "..x..x.x");
  assert.equal(toBox(euclid(3, 8, 8)), "x..x..x.");
  assert.equal(toBox(euclid(3, 8, -1)), ".x..x..x");
});

test("rotation preserves the onset count", () => {
  for (let rot = -20; rot <= 20; rot++) {
    assert.equal(euclid(5, 16, rot).reduce((a, b) => a + b, 0), 5);
  }
});

test("the Bresenham formulation differs by rotation, which is why it is not used", () => {
  const bresenham = (k: number, n: number) =>
    Array.from({ length: n }, (_, i) => ((i * k) % n < k ? 1 : 0));
  const rotationsOf = (p: readonly number[]) =>
    new Set(p.map((_, r) => toBox([...p.slice(r), ...p.slice(0, r)])));

  // Same necklace, different rhythm: cinquillo versus habanera.
  assert.equal(toBox(bjorklund(5, 8)), "x.xx.xx.");
  assert.equal(toBox(bresenham(5, 8)), "x.x.xx.x");
  assert.ok(rotationsOf(bjorklund(5, 8)).has(toBox(bresenham(5, 8))));
});

test("named rhythms resolve to their published patterns", () => {
  assert.equal(toBox(namedRhythm("tresillo")), "x..x..x.");
  assert.equal(toBox(namedRhythm("cinquillo")), "x.xx.xx.");
  assert.equal(toBox(namedRhythm("habanera")), "x.x.xx.x");
  assert.equal(toBox(namedRhythm("standardPattern")), "x.x.xx.x.x.x");
  assert.equal(toBox(namedRhythm("bossaNecklace")), "x..x..x..x..x...");
});

test("the named table is well formed and unique", () => {
  const names = NAMED_RHYTHMS.map((r) => r.name);
  assert.equal(new Set(names).size, names.length);
  for (const r of NAMED_RHYTHMS) {
    assert.ok(r.k > 0 && r.k <= r.n, `${r.name} has k=${r.k}, n=${r.n}`);
    assert.equal(namedRhythm(r.name).length, r.n);
  }
});

test("an unknown rhythm name throws", () => {
  assert.throws(() => namedRhythm("nope"));
});
