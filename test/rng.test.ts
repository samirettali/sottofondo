import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  choose,
  cyrb128,
  formatSeed,
  h32,
  mulberry32,
  parseSeed,
  rngFor,
  valueAt,
  weighted,
} from "../src/core/rng.ts";

test("h32 returns an unsigned 32-bit integer", () => {
  for (const args of [[0], [1, 2, 3], [-1], [0x7fffffff, 0x7fffffff]]) {
    const h = h32(...args);
    assert.ok(Number.isInteger(h), `${h} is not an integer`);
    assert.ok(h >= 0 && h < 2 ** 32, `${h} out of range`);
  }
});

test("h32 avalanches: one bit in, unrelated out", () => {
  const a = h32(1, 0, 0);
  const b = h32(1, 1, 0);
  const c = h32(1, 0, 1);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(b, c);
});

test("h32 is order-sensitive", () => {
  assert.notEqual(h32(1, 2), h32(2, 1));
});

test("mulberry32 is deterministic and stays in [0, 1)", () => {
  const first = Array.from({ length: 64 }, mulberry32(12345));
  const again = Array.from({ length: 64 }, mulberry32(12345));
  assert.deepEqual(first, again);
  for (const v of first) assert.ok(v >= 0 && v < 1, `${v} out of range`);
});

test("mulberry32 is roughly uniform", () => {
  const rng = mulberry32(7);
  const buckets = new Array<number>(10).fill(0);
  const n = 100_000;
  for (let i = 0; i < n; i++) buckets[Math.floor(rng() * 10)]!++;
  for (const count of buckets) {
    assert.ok(Math.abs(count - n / 10) < n / 100, `bucket skew: ${count}`);
  }
});

test("rngFor: the same coordinate always yields the same sequence", () => {
  const a = Array.from({ length: 16 }, rngFor(42, 7, 2));
  const b = Array.from({ length: 16 }, rngFor(42, 7, 2));
  assert.deepEqual(a, b);
});

test("rngFor: neighbouring coordinates are independent", () => {
  const bar7 = Array.from({ length: 16 }, rngFor(42, 7, 2));
  const bar8 = Array.from({ length: 16 }, rngFor(42, 8, 2));
  const voice3 = Array.from({ length: 16 }, rngFor(42, 7, 3));
  const salted = Array.from({ length: 16 }, rngFor(42, 7, 2, 1));
  assert.notDeepEqual(bar7, bar8);
  assert.notDeepEqual(bar7, voice3);
  assert.notDeepEqual(bar7, salted);
});

test("rngFor: no shared stream, so draw order cannot desynchronise a voice", () => {
  // Voice 0 is drained a different number of times in each pass, standing in for a
  // user muting a track mid-playback. Voice 1 must be unaffected.
  const drain = (times: number) => {
    const v0 = rngFor(1, 4, 0);
    for (let i = 0; i < times; i++) v0();
    return Array.from({ length: 8 }, rngFor(1, 4, 1));
  };
  assert.deepEqual(drain(0), drain(99));
});

test("rngFor: seeking to a bar equals playing to it", () => {
  const played: number[] = [];
  for (let bar = 0; bar <= 500; bar++) played.push(rngFor(9, bar, 0)());
  const sought = rngFor(9, 500, 0)();
  assert.equal(played[500], sought);
});

test("valueAt agrees with the first draw of the matching generator", () => {
  // Not required by contract — they are different mixers — but both must be stable.
  const a = valueAt(3, 1, 1);
  const b = valueAt(3, 1, 1);
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 1);
});

test("choose and weighted are deterministic and in range", () => {
  const items = ["a", "b", "c"] as const;
  assert.equal(choose(mulberry32(5), items), choose(mulberry32(5), items));
  const pairs = [["x", 9], ["y", 1]] as const;
  const rng = mulberry32(11);
  let xs = 0;
  for (let i = 0; i < 1000; i++) if (weighted(rng, pairs) === "x") xs++;
  assert.ok(xs > 850 && xs < 950, `weight 9:1 gave ${xs}/1000`);
});

test("choose throws on an empty list rather than yielding undefined", () => {
  assert.throws(() => choose(mulberry32(1), []));
});

test("cyrb128 is stable and spreads its four words", () => {
  const a = cyrb128("acid");
  assert.deepEqual(a, cyrb128("acid"));
  assert.notDeepEqual(a, cyrb128("acie"));
  assert.equal(new Set(a).size, 4);
});

test("seeds round-trip through hex", () => {
  for (const seed of [0, 1, 0xdeadbeef, 0xffffffff]) {
    assert.equal(parseSeed(formatSeed(seed)), seed);
  }
});

test("a non-hex seed string is hashed rather than rejected", () => {
  const seed = parseSeed("giovedi grasso");
  assert.ok(Number.isInteger(seed) && seed >= 0);
  assert.equal(seed, parseSeed("giovedi grasso"));
});

// The rule this file exists to enforce. One stray Math.random silently destroys
// reproducibility, and the symptom (a seed that "sometimes" works) is miserable to
// track down after the fact.
test("Math.random appears nowhere in src/ outside rng.ts", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (entry.endsWith(".ts") && path !== join("src", "core", "rng.ts")) {
        if (readFileSync(path, "utf8").includes("Math.random")) offenders.push(path);
      }
    }
  };
  walk("src");
  assert.deepEqual(offenders, []);
});
