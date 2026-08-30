import { test } from "node:test";
import assert from "node:assert/strict";

import {
  hasRhythmicOddity,
  reverseSides,
  timeline,
  TIMELINES,
} from "../src/pattern/clave.ts";
import { bjorklund, intervalVector, toBox } from "../src/pattern/euclid.ts";

test("each timeline's box and interval vector agree", () => {
  for (const t of TIMELINES) {
    assert.deepEqual(
      intervalVector(timeline(t.name)),
      [...t.intervals],
      `${t.name} intervals`,
    );
  }
});

test("the sixteen-pulse claves have five onsets in sixteen steps", () => {
  for (const t of TIMELINES.filter((x) => x.box.length === 16)) {
    const p = timeline(t.name);
    assert.equal(p.length, 16);
    assert.equal(p.reduce((a, b) => a + b, 0), 5, t.name);
  }
});

// The error this whole module exists to prevent.
test("son clave is NOT E(5,16); the bossa clave is a rotation of it", () => {
  assert.notEqual(toBox(timeline("son")), toBox(bjorklund(5, 16)));
  assert.equal(toBox(bjorklund(5, 16)), "x..x..x..x..x..."); // 3-3-3-3-4
  assert.equal(toBox(timeline("bossa")), "x..x..x...x..x.."); // 3-3-4-3-3
});

test("son is not even a rotation of E(5,16) — it is only almost maximally even", () => {
  const euclidean = bjorklund(5, 16);
  const rotations = new Set(
    euclidean.map((_, r) => toBox([...euclidean.slice(r), ...euclidean.slice(0, r)])),
  );
  assert.ok(!rotations.has(toBox(timeline("son"))));
  assert.ok(!rotations.has(toBox(timeline("rumba"))));
  assert.ok(rotations.has(toBox(timeline("bossa"))));
});

test("the six claves are distinct", () => {
  const claves = TIMELINES.filter((t) => t.box.length === 16).map((t) => toBox(timeline(t.name)));
  assert.equal(new Set(claves).size, claves.length);
});

test("rhythmic oddity is rotation-invariant", () => {
  for (const t of TIMELINES) {
    const expected = hasRhythmicOddity(timeline(t.name));
    for (let r = 0; r < t.box.length; r++) {
      assert.equal(hasRhythmicOddity(timeline(t.name, r)), expected, `${t.name} rot ${r}`);
    }
  }
});

test("son, rumba and bossa have rhythmic oddity; shiko, gahu and soukous do not", () => {
  for (const name of ["son", "rumba", "bossa"]) {
    assert.equal(hasRhythmicOddity(timeline(name)), true, name);
  }
  // Shiko and gahu each place onsets exactly eight pulses apart; soukous does too, at
  // steps 3 and 11. So oddity separates the claves but does not characterise them.
  for (const name of ["shiko", "gahu", "soukous"]) {
    assert.equal(hasRhythmicOddity(timeline(name)), false, name);
  }
});

test("reverseSides gives the 2-3 form and is its own inverse", () => {
  const son = timeline("son");
  assert.equal(toBox(son), "x..x..x...x.x..."); // 3-2
  const twoThree = reverseSides(son);
  assert.equal(toBox(twoThree), "..x.x...x..x..x."); // 2-3
  assert.deepEqual(reverseSides(twoThree), son);
});

test("rotation wraps and preserves onsets", () => {
  assert.deepEqual(timeline("son", 16), timeline("son"));
  assert.equal(timeline("son", -1).reduce((a, b) => a + b, 0), 5);
});

test("an unknown timeline throws", () => {
  assert.throws(() => timeline("clave-de-mi-nonna"));
});
