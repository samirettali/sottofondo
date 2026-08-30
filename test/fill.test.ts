import { test } from "node:test";
import assert from "node:assert/strict";

import { fillBonus, hasFill } from "../src/arrange/fill.ts";
import { variationStrength } from "../src/arrange/epoch.ts";
import { genreList } from "../src/genre/index.ts";
import { house } from "../src/genre/house.ts";
import { defaultLaneStates, lanesOf, scoreLane } from "../src/score.ts";

const FILL = { amount: 0.4, span: 0.25 };

test("no fill away from a phrase boundary", () => {
  for (const bar of [0, 1, 2, 4, 5, 6, 8]) {
    assert.equal(fillBonus(FILL, 16, bar), null, `bar ${bar}`);
    assert.equal(hasFill(FILL, bar), false);
  }
});

test("a fill lands on phrase boundaries, in two tiers", () => {
  const peak = (bar: number) => Math.max(...(fillBonus(FILL, 16, bar) ?? [0]));
  assert.ok(peak(3) > 0);
  assert.ok(peak(7) > peak(3));
  assert.ok(peak(15) > peak(7));
  assert.ok(peak(31) > peak(15));
});

test("the fill occupies only the end of the bar", () => {
  const bonus = fillBonus(FILL, 16, 15);
  assert.ok(bonus !== null);
  for (let i = 0; i < 12; i++) assert.equal(bonus![i], 0, `step ${i} should be untouched`);
  assert.ok(bonus![15]! > 0);
});

test("the fill ramps rather than switching on", () => {
  const bonus = fillBonus(FILL, 16, 15) ?? [];
  for (let i = 13; i < 16; i++) {
    assert.ok(bonus[i]! > bonus[i - 1]!, `not ramping at ${i}`);
  }
});

test("span controls how much of the bar is affected", () => {
  const narrow = fillBonus({ amount: 0.4, span: 0.125 }, 16, 15) ?? [];
  const wide = fillBonus({ amount: 0.4, span: 0.5 }, 16, 15) ?? [];
  assert.equal(narrow.filter((x) => x > 0).length, 1);
  assert.ok(wide.filter((x) => x > 0).length > 5);
});

test("the bonus never exceeds the declared amount", () => {
  for (const bar of [3, 7, 15, 31]) {
    for (const v of fillBonus(FILL, 16, bar) ?? []) {
      assert.ok(v <= FILL.amount + 1e-9, `${v} exceeds ${FILL.amount}`);
    }
  }
});

test("degenerate fills are inert", () => {
  assert.equal(fillBonus(undefined, 16, 15), null);
  assert.equal(fillBonus({ amount: 0 }, 16, 15), null);
  assert.equal(fillBonus({ amount: -1 }, 16, 15), null);
  const clamped = fillBonus({ amount: 0.3, span: 99 }, 16, 15);
  assert.equal(clamped?.length, 16);
});

test("a fill only ever adds notes", () => {
  const lane = lanesOf(house).findIndex((l) => l.name === "shaker");
  const states = defaultLaneStates(house);
  // Compare a phrase-end bar against the same bar's pattern with no fill declared.
  const withFill = house;
  const drums = withFill.drums.map((d) => (d.name === "shaker" ? omitFill(d) : d));
  const without = { ...withFill, drums };

  for (const bar of [7, 15, 31, 39, 47]) {
    const a = scoreLane(without, lane, 5, bar, states[lane]!).map((e) => e.patternStep);
    const b = scoreLane(withFill, lane, 5, bar, states[lane]!).map((e) => e.patternStep);
    for (const step of a) {
      assert.ok(b.includes(step), `bar ${bar}: the fill removed step ${step}`);
    }
    assert.ok(b.length >= a.length, `bar ${bar}: the fill made the bar sparser`);
  }
});

test("phrase-end bars really are busier than the bars before them", () => {
  const lane = lanesOf(house).findIndex((l) => l.name === "shaker");
  const states = defaultLaneStates(house);
  let ends = 0;
  let middles = 0;
  // Sampled over many phrases: any single bar is subject to the mute roll and chaos.
  for (let phrase = 4; phrase < 60; phrase++) {
    ends += scoreLane(house, lane, 9, phrase * 8 + 7, states[lane]!).length;
    middles += scoreLane(house, lane, 9, phrase * 8 + 5, states[lane]!).length;
  }
  assert.ok(ends > middles, `phrase ends ${ends} vs middles ${middles}`);
});

// The two constraints the mechanism has, stated as tests so a preset cannot quietly
// declare an inert fill.
test("a fill is never declared on a mask lane, where it can do nothing", () => {
  for (const genre of genreList()) {
    for (const d of genre.drums) {
      if (d.fill === undefined) continue;
      assert.notEqual(
        d.gen.type,
        "mask",
        `${genre.id}/${d.name}: a mask has no latent strength for a fill to admit`,
      );
    }
  }
});

test("a fill is never declared on a lane dense enough to be saturated", () => {
  for (const genre of genreList()) {
    for (const d of genre.drums) {
      if (d.fill === undefined) continue;
      const peak = d.density + (d.densitySwing ?? 0);
      assert.ok(peak < 0.7, `${genre.id}/${d.name} peaks at ${peak}, too dense to fill`);
    }
  }
});

test("no genre fills on the kick", () => {
  // A kick that gets busier at every phrase end sounds like a mistake, not a fill.
  for (const genre of genreList()) {
    const kick = genre.drums.find((d) => d.kitVoice === "kick");
    assert.equal(kick?.fill, undefined, `${genre.id} fills on the kick`);
  }
});

test("fill amounts stay modest across the registry", () => {
  for (const genre of genreList()) {
    for (const d of genre.drums) {
      if (d.fill === undefined) continue;
      assert.ok(d.fill.amount > 0 && d.fill.amount <= 0.5, `${genre.id}/${d.name}`);
      assert.ok((d.fill.span ?? 0.25) <= 0.5, `${genre.id}/${d.name} fills half the bar`);
    }
  }
});

test("variationStrength and hasFill agree", () => {
  for (let bar = 0; bar < 64; bar++) {
    assert.equal(hasFill(FILL, bar), variationStrength(bar) > 0, `bar ${bar}`);
  }
});

function omitFill<T extends { fill?: unknown }>(d: T): T {
  const { fill: _dropped, ...rest } = d;
  return rest as T;
}
