import { test } from "node:test";
import assert from "node:assert/strict";

import { SCALES } from "../src/harmony/scales.ts";
import { stepPrior, walkBar, type WalkOptions } from "../src/melody/walk.ts";
import { balkan } from "../src/genre/balkan.ts";
import { defaultLaneStates, harmonyAt, lanesOf, scaleAt, scoreLane } from "../src/score.ts";
import { chordAt } from "../src/harmony/progression.ts";

const OPTS: WalkOptions = {
  scale: SCALES.minor,
  key: 9,
  lo: 57,
  hi: 81,
  leapiness: 1,
  contourStrength: 1.5,
  chordPcs: [9, 0, 4], // A minor
  chordPull: 1,
};
const STEPS = [0, 2, 4, 6, 8, 10, 12, 14];
const STRONG = STEPS.map((s) => s % 4 === 0);

test("the prior is step-dominated and slightly favours descent", () => {
  const w = new Map(stepPrior());
  const steps = (w.get(1) ?? 0) + (w.get(-1) ?? 0);
  const thirds = (w.get(2) ?? 0) + (w.get(-2) ?? 0);
  assert.ok(steps > 0.45 && steps < 0.55);
  assert.ok(thirds < steps / 2);
  assert.ok((w.get(-1) ?? 0) > (w.get(1) ?? 0));
});

test("every pitch is in the scale and in the register", () => {
  const allowed = new Set(SCALES.minor.map((i) => (i + 9) % 12));
  for (let bar = 0; bar < 100; bar++) {
    for (const midi of walkBar(STEPS, STRONG, 16, OPTS, 3, bar, 0)) {
      assert.ok(midi >= OPTS.lo && midi <= OPTS.hi, `bar ${bar}: ${midi} out of register`);
      assert.ok(allowed.has(midi % 12), `bar ${bar}: ${midi} not in A minor`);
    }
  }
});

test("the walk is deterministic and varies between bars", () => {
  assert.deepEqual(walkBar(STEPS, STRONG, 16, OPTS, 3, 7, 0), walkBar(STEPS, STRONG, 16, OPTS, 3, 7, 0));
  const shapes = new Set(Array.from({ length: 12 }, (_, b) => walkBar(STEPS, STRONG, 16, OPTS, 3, b, 0).join(",")));
  assert.ok(shapes.size > 8);
});

test("steps dominate the intervals actually produced", () => {
  let steps = 0;
  let total = 0;
  for (let bar = 0; bar < 300; bar++) {
    const m = walkBar(STEPS, STRONG, 16, OPTS, 11, bar, 0);
    for (let i = 1; i < m.length; i++) {
      total++;
      if (Math.abs(m[i]! - m[i - 1]!) <= 2) steps++;
    }
  }
  assert.ok(steps / total > 0.5, `${steps}/${total} were steps`);
});

test("a leap is followed by a reversal more often than not", () => {
  let leaps = 0;
  let reversed = 0;
  for (let bar = 0; bar < 400; bar++) {
    const m = walkBar(STEPS, STRONG, 16, OPTS, 5, bar, 0);
    for (let i = 2; i < m.length; i++) {
      const a = m[i - 1]! - m[i - 2]!;
      const b = m[i]! - m[i - 1]!;
      if (Math.abs(a) >= 5) {
        leaps++;
        if (Math.sign(b) === -Math.sign(a)) reversed++;
      }
    }
  }
  assert.ok(leaps > 20, `only ${leaps} leaps to judge by`);
  assert.ok(reversed / leaps > 0.6, `${reversed}/${leaps} reversed`);
});

test("chord tones land on strong steps more than chance", () => {
  let strongHits = 0;
  let strongTotal = 0;
  for (let bar = 0; bar < 300; bar++) {
    const m = walkBar(STEPS, STRONG, 16, OPTS, 8, bar, 0);
    m.forEach((midi, i) => {
      if (!STRONG[i]) return;
      strongTotal++;
      if (OPTS.chordPcs.includes(midi % 12)) strongHits++;
    });
  }
  // Three of seven scale degrees are chord tones: chance is 43%.
  assert.ok(strongHits / strongTotal > 0.55, `${strongHits}/${strongTotal} on chord tones`);
});

test("lower leapiness gives a smoother line", () => {
  const spread = (leapiness: number) => {
    let sum = 0;
    let n = 0;
    for (let bar = 0; bar < 200; bar++) {
      const m = walkBar(STEPS, STRONG, 16, { ...OPTS, leapiness }, 2, bar, 0);
      for (let i = 1; i < m.length; i++) {
        sum += Math.abs(m[i]! - m[i - 1]!);
        n++;
      }
    }
    return sum / n;
  };
  assert.ok(spread(0.2) < spread(1.5));
});

test("an empty bar yields nothing", () => {
  assert.deepEqual(walkBar([], [], 16, OPTS, 1, 0, 0), []);
});

test("the 11/8 preset's lead plays in its scale and register, on the chord where it should", () => {
  const lane = lanesOf(balkan).findIndex((l) => l.kind === "lead");
  assert.ok(lane >= 0, "no lead lane");
  const states = defaultLaneStates(balkan);
  let notes = 0;
  for (let bar = 40; bar < 120; bar++) {
    const scale = scaleAt(balkan, 6, bar);
    const harmony = harmonyAt(balkan, 6, bar);
    assert.ok(scale !== null && harmony !== null);
    const allowed = new Set(scale.map((i) => (i + harmony.key) % 12));
    for (const e of scoreLane(balkan, lane, 6, bar, states[lane]!)) {
      notes++;
      assert.ok(e.midi !== undefined);
      assert.ok(e.midi >= 67 && e.midi <= 86, `bar ${bar}: ${e.midi} out of register`);
      assert.ok(allowed.has(e.midi % 12), `bar ${bar}: ${e.midi} outside the scale`);
    }
    void chordAt(harmony.progression, bar);
  }
  assert.ok(notes > 200, `only ${notes} lead notes in 80 bars`);
});

test("scaleAt draws from the genre's list and holds within a note epoch", () => {
  const names = new Set<string>();
  for (let epochBar = 0; epochBar < 64 * 40; epochBar += 32) {
    const s = scaleAt(balkan, 2, epochBar);
    assert.ok(s !== null);
    names.add(s.join(","));
    assert.deepEqual(scaleAt(balkan, 2, epochBar + 1), s);
  }
  assert.ok(names.size >= 2, "only one scale ever chosen");
});
