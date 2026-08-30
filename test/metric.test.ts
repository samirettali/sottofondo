import { test } from "node:test";
import assert from "node:assert/strict";

import { METRIC_16, metricFromGrouping, metricWeight } from "../src/pattern/metric.ts";
import { balkan } from "../src/genre/balkan.ts";
import { defaultLaneStates, lanesOf, scoreLane, stepsPerBeat } from "../src/score.ts";
import { genreList } from "../src/genre/index.ts";

const KOPANITSA = [4, 4, 6, 4, 4]; // 2+2+3+2+2 eighths on a sixteenth grid

test("a grouping produces one weight per step", () => {
  const curve = metricFromGrouping(KOPANITSA, 22);
  assert.equal(curve.length, 22);
  for (const w of curve) assert.ok(w > 0 && w <= 1, `${w}`);
});

test("the downbeat is strongest and every beat head is strong", () => {
  const curve = metricFromGrouping(KOPANITSA, 22);
  const heads = [0, 4, 8, 14, 18];
  assert.equal(curve[0], 1);
  for (const head of heads.slice(1)) {
    assert.ok(curve[head]! > 0.5, `beat head ${head} is weak at ${curve[head]}`);
    assert.ok(curve[head]! < curve[0]!, `beat head ${head} outranks the downbeat`);
  }
  // Everything that is not a beat head is weaker than every beat head.
  const weakest = Math.min(...heads.map((h) => curve[h]!));
  for (let i = 0; i < 22; i++) {
    if (heads.includes(i)) continue;
    assert.ok(curve[i]! < weakest, `step ${i} is as strong as a beat head`);
  }
});

// The reason the tabulated curves cannot be used here.
test("the long beat's head takes a stronger accent than the short beats'", () => {
  const curve = metricFromGrouping(KOPANITSA, 22);
  assert.ok(curve[8]! > curve[4]!, "the three-beat should outrank the twos");
  assert.ok(curve[8]! > curve[14]!);
});

test("2+2+3 and 3+2+2 are not rotations of each other", () => {
  const a = metricFromGrouping([4, 4, 6], 14);
  const b = metricFromGrouping([6, 4, 4], 14);
  const rotations = new Set(a.map((_, r) => [...a.slice(r), ...a.slice(0, r)].join(",")));
  assert.ok(!rotations.has(b.join(",")), "the two groupings collapsed to one shape");
});

test("the tabulated curve would get the long beat wrong", () => {
  // Step 8 of a 2+2+3+2+2 bar is a beat head. The 16-step divisive table has no opinion
  // about a 22-step bar, and the generated fallback treats 8 as a weak subdivision.
  const generated = metricWeight(8, 22);
  const grouped = metricFromGrouping(KOPANITSA, 22)[8]!;
  assert.ok(grouped > generated, `grouped ${grouped} vs generated ${generated}`);
});

test("a grouping matching 4/4 broadly agrees with the tabulated curve", () => {
  // Four equal beats of four sixteenths: the strong positions should be the same ones.
  const curve = metricFromGrouping([4, 4, 4, 4], 16);
  const strongest = [...curve.keys()].sort((a, b) => curve[b]! - curve[a]!).slice(0, 4);
  const tabulated = [...METRIC_16.keys()].sort((a, b) => METRIC_16[b]! - METRIC_16[a]!).slice(0, 4);
  assert.deepEqual([...strongest].sort((a, b) => a - b), [...tabulated].sort((a, b) => a - b));
});

test("degenerate groupings do not throw", () => {
  assert.equal(metricFromGrouping([], 8).length, 8);
  assert.equal(metricFromGrouping([0, 0], 8).length, 8);
  // A grouping longer than the bar is truncated rather than overflowing.
  assert.equal(metricFromGrouping([100], 4).length, 4);
});

test("stepsPerBeat is taken from the genre, not assumed", () => {
  assert.equal(stepsPerBeat(balkan), 4);
  for (const genre of genreList()) {
    assert.ok(stepsPerBeat(genre) > 0, `${genre.id}`);
  }
});

test("the odd metre plays, and its accents land on the beat heads", () => {
  const states = defaultLaneStates(balkan);
  const hat = lanesOf(balkan).findIndex((l) => l.name === "hat");
  const heads = new Set([0, 4, 8, 14, 18]);
  let onHead = 0;
  let accentsOnHead = 0;
  let accents = 0;

  for (let bar = 32; bar < 132; bar++) {
    for (const e of scoreLane(balkan, hat, 4, bar, states[hat]!)) {
      if (heads.has(e.patternStep)) onHead++;
      if (e.accent) {
        accents++;
        if (heads.has(e.patternStep)) accentsOnHead++;
      }
    }
  }
  assert.ok(onHead > 0, "nothing landed on a beat head at all");
  assert.ok(accents > 0, "nothing was accented");
  // Five of twenty-two steps are heads, so chance alone would put 23% of accents there.
  assert.ok(accentsOnHead / accents > 0.5, `only ${accentsOnHead}/${accents} accents on heads`);
});

test("the bar really is eleven eighths, not a rounded 4/4", () => {
  assert.equal(balkan.clock.stepsPerBar, 22);
  assert.equal(balkan.clock.grouping?.reduce((a, b) => a + b, 0), 22);
  assert.notEqual(balkan.clock.stepsPerBar % 4, 0);
});
