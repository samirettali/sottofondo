import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { genreList } from "../src/genre/index.ts";
import { acid } from "../src/genre/acid.ts";
import { techno } from "../src/genre/techno.ts";
import {
  defaultLaneStates,
  harmonyAt,
  lanesOf,
  patternIndexAt,
  rootInRange,
  scoreBar,
  scoreLane,
  type LaneState,
} from "../src/score.ts";
import { chordAt } from "../src/harmony/progression.ts";

const stringify = (events: ReturnType<typeof scoreBar>) =>
  events
    .map((e) => `${e.lane}:${e.patternStep}:${e.velocity.toFixed(4)}:${e.accent}:${e.midi ?? ""}`)
    .join("|");

test("lanes are declared in the engine's order: drums, bass, chords", () => {
  for (const genre of genreList()) {
    const lanes = lanesOf(genre);
    const expected =
      genre.drums.length +
      (genre.bass === undefined ? 0 : 1) +
      (genre.chords === undefined ? 0 : 1);
    assert.equal(lanes.length, expected, genre.id);
    lanes.forEach((lane, i) => assert.equal(lane.index, i));

    // The order is a contract: a lane index is a hash coordinate, so reordering would
    // change every seed's music.
    const kinds = lanes.map((l) => l.kind);
    assert.deepEqual(kinds, [...kinds].sort(byKind), `${genre.id} lanes are out of order`);
    assert.equal(lanes.filter((l) => l.kind === "bass").length, genre.bass === undefined ? 0 : 1);
    assert.equal(
      lanes.filter((l) => l.kind === "chords").length,
      genre.chords === undefined ? 0 : 1,
    );
  }
});

function byKind(a: string, b: string): number {
  const order = { drum: 0, bass: 1, chords: 2 } as Record<string, number>;
  return (order[a] ?? 0) - (order[b] ?? 0);
}

test("the same bar always scores identically", () => {
  for (const genre of genreList()) {
    const states = defaultLaneStates(genre);
    for (const bar of [0, 1, 17, 63, 512]) {
      assert.equal(
        stringify(scoreBar(genre, 42, bar, states)),
        stringify(scoreBar(genre, 42, bar, states)),
        `${genre.id} bar ${bar}`,
      );
    }
  }
});

// The property the whole architecture exists for.
test("seeking to a bar scores the same as playing to it", () => {
  const genre = acid;
  const states = defaultLaneStates(genre);
  const played: string[] = [];
  for (let bar = 0; bar <= 600; bar++) played.push(stringify(scoreBar(genre, 7, bar, states)));
  for (const bar of [0, 1, 63, 64, 65, 255, 600]) {
    assert.equal(stringify(scoreBar(genre, 7, bar, states)), played[bar], `bar ${bar}`);
  }
});

test("muting a lane cannot change what any other lane plays", () => {
  const genre = techno;
  const base = defaultLaneStates(genre);
  const lanes = lanesOf(genre);

  for (const muted of lanes) {
    const withMute: LaneState[] = base.map((s, i) =>
      i === muted.index ? { ...s, userMuted: true } : s,
    );
    for (let bar = 0; bar < 40; bar++) {
      for (const lane of lanes) {
        if (lane.index === muted.index) continue;
        assert.equal(
          stringify(scoreLane(genre, lane.index, 3, bar, base[lane.index]!)),
          stringify(scoreLane(genre, lane.index, 3, bar, withMute[lane.index]!)),
          `muting ${muted.name} moved ${lane.name} in bar ${bar}`,
        );
      }
    }
  }
});

test("a muted lane scores nothing", () => {
  const genre = acid;
  for (let bar = 0; bar < 20; bar++) {
    assert.deepEqual(scoreLane(genre, 0, 5, bar, { density: 1, userMuted: true }), []);
  }
});

test("changing one lane's density leaves the others alone", () => {
  const genre = techno;
  const base = defaultLaneStates(genre);
  const lanes = lanesOf(genre);
  const louder = base.map((s, i) => (i === 0 ? { ...s, density: 0.95 } : s));

  for (let bar = 0; bar < 30; bar++) {
    for (const lane of lanes.slice(1)) {
      assert.equal(
        stringify(scoreLane(genre, lane.index, 11, bar, base[lane.index]!)),
        stringify(scoreLane(genre, lane.index, 11, bar, louder[lane.index]!)),
        `${lane.name} moved in bar ${bar}`,
      );
    }
  }
});

test("adjacent seeds give unrelated music", () => {
  const genre = acid;
  const states = defaultLaneStates(genre);
  let same = 0;
  for (let bar = 0; bar < 50; bar++) {
    if (stringify(scoreBar(genre, 100, bar, states)) === stringify(scoreBar(genre, 101, bar, states))) {
      same++;
    }
  }
  assert.ok(same < 5, `${same} of 50 bars identical across adjacent seeds`);
});

test("a lane's pattern index wraps against the global bar", () => {
  // A seven-step lane in a sixteen-step bar: bar 1 starts at index 16 mod 7 = 2.
  assert.equal(patternIndexAt(techno, 7, 0, 0), 0);
  assert.equal(patternIndexAt(techno, 7, 0, 6), 6);
  assert.equal(patternIndexAt(techno, 7, 0, 7), 0);
  assert.equal(patternIndexAt(techno, 7, 1, 0), 2);
  assert.equal(patternIndexAt(techno, 7, 2, 0), 4);
  // A lane the length of a bar never drifts.
  for (let bar = 0; bar < 10; bar++) assert.equal(patternIndexAt(techno, 16, bar, 3), 3);
});

test("a polymetric lane lands somewhere new each bar", () => {
  const percIndex = techno.drums.findIndex((d) => d.name === "perc");
  const seen = new Set<string>();
  // Bars inside a peak section: the perc lane has an energy window and is out of the
  // intro entirely.
  for (let bar = 70; bar < 77; bar++) {
    const own = new Array<number>(7).fill(0);
    for (const ev of scoreLane(techno, percIndex, 9, bar, { density: 0.5, userMuted: false })) {
      own[ev.patternStep] = 1;
    }
    const inBar = Array.from({ length: 16 }, (_, i) => own[patternIndexAt(techno, 7, bar, i)] ?? 0);
    seen.add(inBar.join(""));
  }
  assert.ok(seen.size >= 6, `only ${seen.size} distinct placements over seven bars`);
});

test("scored velocities are in range and pitches are sane", () => {
  for (const genre of genreList()) {
    const states = defaultLaneStates(genre);
    for (let bar = 0; bar < 60; bar++) {
      for (const e of scoreBar(genre, 21, bar, states)) {
        assert.ok(e.velocity > 0 && e.velocity <= 1, `${genre.id} velocity ${e.velocity}`);
        if (e.midi !== undefined) {
          assert.ok(e.midi >= 0 && e.midi <= 127, `${genre.id} midi ${e.midi}`);
          assert.ok(Number.isInteger(e.midi));
        }
      }
    }
  }
});

// The bug behind "deep house sounds wrong": bass and chords each picked their own key.
test("the bass plays from the current chord's root wherever there is harmony", () => {
  for (const genre of genreList()) {
    if (genre.tonality === undefined || genre.bass === undefined) continue;
    const bass = lanesOf(genre).findIndex((l) => l.kind === "bass");
    const states = defaultLaneStates(genre);
    for (let bar = 0; bar < 200; bar++) {
      const harmony = harmonyAt(genre, 5, bar);
      assert.ok(harmony !== null);
      const chordRoot = (harmony.key + chordAt(harmony.progression, bar).root) % 12;
      for (const e of scoreLane(genre, bass, 5, bar, { ...states[bass]!, userMuted: false })) {
        const interval = (((e.midi ?? 0) - chordRoot) % 12 + 12) % 12;
        const allowed = genre.bass.bags.some((bag) => bag.some((i) => ((i % 12) + 12) % 12 === interval));
        assert.ok(allowed, `${genre.id} bar ${bar}: midi ${e.midi} is ${interval} above the chord root`);
      }
    }
  }
});

test("a chord root is placed nearest the centre of the register, not at its floor", () => {
  assert.equal(rootInRange(0, 33, 45), 36);
  assert.equal(rootInRange(9, 33, 45), 33); // 33 and 45 are equidistant from 39; the lower wins
  assert.equal(rootInRange(7, 33, 45), 43);
  assert.equal(rootInRange(2, 33, 45), 38);
  for (let pc = 0; pc < 12; pc++) {
    const n = rootInRange(pc, 33, 45);
    assert.ok(n >= 33 && n <= 45, `${pc} -> ${n}`);
    assert.equal(((n - pc) % 12 + 12) % 12, 0);
  }
});

test("a glide only ever follows a slide", () => {
  const genre = acid;
  const laneIndex = lanesOf(genre).findIndex((l) => l.kind === "bass");
  for (let bar = 0; bar < 200; bar++) {
    const events = scoreLane(genre, laneIndex, 15, bar, { density: 0.7, userMuted: false });
    events.forEach((e, i) => {
      if (e.glide !== true) return;
      const previous = events[i - 1];
      assert.ok(previous !== undefined, `bar ${bar}: a glide with nothing before it`);
      assert.equal(previous?.slide, true, `bar ${bar}: a glide after a note that did not slide`);
      assert.equal(previous?.patternStep, e.patternStep - 1);
    });
  }
});

/**
 * Musical decisions must not depend on transcendental functions: ECMAScript leaves
 * Math.sin, Math.pow and friends implementation-dependent, so a branch on one could pick
 * different notes in different browsers. They are fine for continuous parameters, which
 * is why this only covers the generation path.
 */
test("no transcendentals in the generation path", () => {
  const files = ["src/score.ts", "src/pattern", "src/arrange", "src/core/rng.ts"];
  const banned = /Math\s*\.\s*(sin|cos|tan|exp|log|log2|log10|atan|asin|acos|cbrt|hypot)\s*\(/;
  const offenders: string[] = [];

  const check = (path: string) => {
    if (statSync(path).isDirectory()) {
      for (const entry of readdirSync(path)) check(join(path, entry));
      return;
    }
    if (!path.endsWith(".ts")) return;
    if (banned.test(readFileSync(path, "utf8"))) offenders.push(path);
  };
  for (const f of files) check(f);
  assert.deepEqual(offenders, []);
});
