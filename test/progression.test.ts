import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEGREES,
  MCGILL,
  chordAt,
  chooseKey,
  chooseProgression,
  progressionBars,
  walk,
  type HarmonyDef,
} from "../src/harmony/progression.ts";

test("the matrix is square, non-negative and has a zero diagonal", () => {
  assert.equal(MCGILL.length, DEGREES.length);
  MCGILL.forEach((row, i) => {
    assert.equal(row.length, DEGREES.length, `row ${i}`);
    assert.equal(row[i], 0, `row ${i} has a self-transition`);
    for (const p of row) assert.ok(p >= 0 && p <= 1);
  });
});

test("the matrix rows are normalised", () => {
  MCGILL.forEach((row, i) => {
    const sum = row.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.01, `row ${DEGREES[i]} sums to ${sum}`);
  });
});

test("the published headline probabilities are intact", () => {
  const p = (from: string, to: string) =>
    MCGILL[DEGREES.indexOf(from as never)]?.[DEGREES.indexOf(to as never)];
  assert.equal(p("V", "I"), 0.618);
  assert.equal(p("IV", "I"), 0.504);
  assert.equal(p("II", "V"), 0.465);
  assert.equal(p("I", "IV"), 0.347);
  assert.equal(p("bVII", "I"), 0.399);
  assert.equal(p("bVI", "bVII"), 0.286); // the Aeolian cadence
});

// The point of using a corpus rather than function theory.
test("the corpus permits retrogression, which textbook theory forbids", () => {
  const vToIv = MCGILL[DEGREES.indexOf("V")]?.[DEGREES.indexOf("IV")] ?? 0;
  assert.ok(vToIv > 0.15, `V->IV is ${vToIv}, too small to be the rock cadence`);
});

const POOL: HarmonyDef = {
  pool: [
    { chords: ["i7", "VII", "VI", "VII"], barsPerChord: 1, weight: 2 },
    { chords: ["i7", "iv7"], barsPerChord: 2 },
  ],
};

test("a pooled progression is chosen deterministically", () => {
  for (let epoch = 0; epoch < 20; epoch++) {
    const a = chooseProgression(POOL, 5, epoch, 0);
    const b = chooseProgression(POOL, 5, epoch, 0);
    assert.deepEqual(a.chords.map((c) => c.symbol), b.chords.map((c) => c.symbol));
    assert.equal(a.barsPerChord, b.barsPerChord);
  }
});

test("pool weights are respected", () => {
  let first = 0;
  for (let epoch = 0; epoch < 600; epoch++) {
    if (chooseProgression(POOL, 9, epoch, 0).chords.length === 4) first++;
  }
  const share = first / 600;
  assert.ok(Math.abs(share - 2 / 3) < 0.06, `weighted 2:1 gave ${share.toFixed(3)}`);
});

test("only pooled progressions appear when walkP is zero", () => {
  const shapes = new Set<string>();
  for (let epoch = 0; epoch < 200; epoch++) {
    shapes.add(chooseProgression(POOL, 1, epoch, 0).chords.map((c) => c.symbol).join("-"));
  }
  assert.deepEqual([...shapes].sort(), ["i7-VII-VI-VII", "i7-iv7"]);
});

test("a walked progression starts on the tonic and is the right length", () => {
  for (let epoch = 0; epoch < 50; epoch++) {
    const degrees = walk(4, 3, epoch, 0);
    assert.equal(degrees[0], "I");
    assert.equal(degrees.length, 4);
    for (const d of degrees) assert.ok(DEGREES.includes(d));
  }
});

test("a walk never repeats a chord immediately, because the diagonal is zero", () => {
  for (let epoch = 0; epoch < 200; epoch++) {
    const degrees = walk(6, 4, epoch, 0);
    for (let i = 1; i < degrees.length; i++) {
      assert.notEqual(degrees[i], degrees[i - 1], `epoch ${epoch}: ${degrees.join("-")}`);
    }
  }
});

test("a walk follows the corpus: IV and V dominate what comes after I", () => {
  const counts = new Map<string, number>();
  for (let epoch = 0; epoch < 3000; epoch++) {
    const second = walk(2, 6, epoch, 0)[1];
    if (second !== undefined) counts.set(second, (counts.get(second) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  assert.deepEqual(ranked.slice(0, 2).map(([d]) => d).sort(), ["IV", "V"]);
});

test("walkP mixes the two sources", () => {
  const mixed: HarmonyDef = { ...POOL, walkP: 0.5, walkLength: 4 };
  let walked = 0;
  for (let epoch = 0; epoch < 400; epoch++) {
    const symbols = chooseProgression(mixed, 2, epoch, 0).chords.map((c) => c.symbol).join("-");
    if (symbols !== "i7-VII-VI-VII" && symbols !== "i7-iv7") walked++;
  }
  assert.ok(walked > 120 && walked < 280, `${walked} of 400 walked`);
});

test("chordAt cycles, and holds each chord for its bars", () => {
  const progression = chooseProgression(
    { pool: [{ chords: ["i", "iv", "V", "i"], barsPerChord: 2 }] },
    1,
    0,
    0,
  );
  assert.equal(progressionBars(progression), 8);
  assert.equal(chordAt(progression, 0).symbol, "i");
  assert.equal(chordAt(progression, 1).symbol, "i");
  assert.equal(chordAt(progression, 2).symbol, "iv");
  assert.equal(chordAt(progression, 7).symbol, "i");
  assert.equal(chordAt(progression, 8).symbol, "i"); // wraps
  assert.equal(chordAt(progression, 10).symbol, "iv");
});

test("chordAt handles a bar before the start", () => {
  const progression = chooseProgression({ pool: [{ chords: ["i", "iv"], barsPerChord: 1 }] }, 1, 0, 0);
  assert.equal(chordAt(progression, -1).symbol, "iv");
});

test("keys respect the genre's preferences and are stable per epoch", () => {
  for (let epoch = 0; epoch < 100; epoch++) {
    const key = chooseKey([0, 5, 7], 8, epoch, 0);
    assert.ok([0, 5, 7].includes(key), `key ${key}`);
    assert.equal(key, chooseKey([0, 5, 7], 8, epoch, 0));
  }
  const any = new Set(Array.from({ length: 200 }, (_, e) => chooseKey(undefined, 8, e, 0)));
  assert.ok(any.size > 8, `only ${any.size} distinct keys with no preference`);
});
