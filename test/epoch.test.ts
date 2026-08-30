import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EPOCHS,
  epochAt,
  epochStart,
  isMuted,
  variationStrength,
  type EpochSpec,
} from "../src/arrange/epoch.ts";
import { defaultVoice, realise } from "../src/pattern/gen.ts";

const SPEC: EpochSpec = { every: 16, p: 0.5, salt: EPOCHS.pattern };

test("an epoch is constant within its block", () => {
  // Whatever the epoch is at bar 0, every bar before the first boundary shares it.
  const first = epochAt(1, 0, SPEC);
  for (let bar = 0; bar < 16; bar++) assert.equal(epochAt(1, bar, SPEC), first);
});

test("epochs only ever advance", () => {
  let previous = 0;
  for (let bar = 0; bar < 2000; bar++) {
    const e = epochAt(7, bar, SPEC);
    assert.ok(e >= previous, `bar ${bar} went backwards`);
    previous = e;
  }
});

test("epochs change only at multiples of `every`", () => {
  for (let bar = 1; bar < 500; bar++) {
    if (epochAt(3, bar, SPEC) !== epochAt(3, bar - 1, SPEC)) {
      assert.equal(bar % SPEC.every, 0, `changed at bar ${bar}`);
    }
  }
});

test("probability governs how often the epoch advances", () => {
  const advances = (p: number) => epochAt(5, 1600, { every: 16, p, salt: 1 });
  assert.equal(advances(0), 0);
  assert.equal(advances(1), 100); // every boundary
  const half = advances(0.5);
  assert.ok(half > 30 && half < 70, `p=0.5 advanced ${half} times in 100 chances`);
});

test("seeking gives the same epoch as playing there", () => {
  const played: number[] = [];
  for (let bar = 0; bar <= 800; bar++) played.push(epochAt(9, bar, SPEC));
  assert.equal(played[800], epochAt(9, 800, SPEC));
  assert.equal(played[377], epochAt(9, 377, SPEC));
});

test("epochStart lands on the boundary the current epoch began at", () => {
  for (let bar = 0; bar < 300; bar++) {
    const start = epochStart(4, bar, SPEC);
    assert.equal(start % SPEC.every, 0);
    assert.ok(start <= bar);
    assert.equal(epochAt(4, start, SPEC), epochAt(4, bar, SPEC));
  }
});

// The reason this module exists.
test("a pattern keyed on the epoch repeats; keyed on the bar it never does", () => {
  const voice = defaultVoice({ type: "stepClassP" }, { density: 0.6 });
  const steps = (key: number) => realise(voice, 16, 2, key, 0).map((h) => h.step).join(",");

  const byBar = new Set(Array.from({ length: 16 }, (_, bar) => steps(bar)));
  const byEpoch = new Set(
    Array.from({ length: 16 }, (_, bar) => steps(epochAt(2, bar, SPEC))),
  );
  assert.ok(byBar.size > 12, `bars gave ${byBar.size} distinct patterns out of 16`);
  assert.ok(byEpoch.size <= 2, `epochs gave ${byEpoch.size} distinct patterns in 16 bars`);
});

test("the first block always plays in full", () => {
  for (let voice = 0; voice < 6; voice++) {
    for (let bar = 0; bar < 8; bar++) {
      assert.equal(isMuted(6, bar, voice, 8, 1), false, `voice ${voice} bar ${bar}`);
    }
  }
  // And muting resumes immediately after it.
  assert.equal(isMuted(6, 8, 0, 8, 1), true);
});

test("mutes hold for a whole block, not a bar", () => {
  for (let block = 1; block < 20; block++) {
    const expected = isMuted(6, block * 8, 1, 8, 0.5);
    for (let i = 0; i < 8; i++) {
      assert.equal(isMuted(6, block * 8 + i, 1, 8, 0.5), expected, `block ${block}`);
    }
  }
});

test("mute probability is honoured, and voices mute independently", () => {
  const rate = (voiceIndex: number, p: number) => {
    let muted = 0;
    for (let block = 1; block <= 400; block++) {
      if (isMuted(8, block * 8, voiceIndex, 8, p)) muted++;
    }
    return muted / 400;
  };
  assert.equal(rate(0, 0), 0);
  assert.ok(Math.abs(rate(0, 0.5) - 0.5) < 0.06);
  assert.ok(Math.abs(rate(1, 0.2) - 0.2) < 0.06);
  // Independence: the kick at 0.2 and a hat at 0.2 should not agree every time.
  let agree = 0;
  for (let block = 1; block <= 200; block++) {
    if (isMuted(8, block * 8, 0, 8, 0.5) === isMuted(8, block * 8, 1, 8, 0.5)) agree++;
  }
  assert.ok(agree < 190, "voices mute in lockstep");
});

test("variation strength marks phrase ends, in two tiers", () => {
  assert.equal(variationStrength(31), 1);
  assert.equal(variationStrength(15), 0.7);
  assert.equal(variationStrength(7), 0.45);
  assert.equal(variationStrength(3), 0.2);
  assert.equal(variationStrength(0), 0);
  assert.equal(variationStrength(5), 0);
  // A 32-bar boundary must outrank a 16, which outranks an 8.
  assert.ok(variationStrength(31) > variationStrength(15));
  assert.ok(variationStrength(15) > variationStrength(7));
});
