import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SECTIONS,
  densityAt,
  energyAt,
  laneIsIn,
  sectionAt,
  type SectionDef,
} from "../src/arrange/energy.ts";
import { genreList } from "../src/genre/index.ts";
import { house } from "../src/genre/house.ts";
import { defaultLaneStates, lanesOf, scoreLane } from "../src/score.ts";

const FORM: SectionDef[] = [
  { name: "intro", bars: 4, energy: 0.2 },
  { name: "build", bars: 4, energy: 0.3, energyTo: 0.9 },
  { name: "main", bars: 8, energy: 1 },
];

test("sections cover the form and cycle", () => {
  assert.equal(sectionAt(FORM, 0)?.name, "intro");
  assert.equal(sectionAt(FORM, 3)?.name, "intro");
  assert.equal(sectionAt(FORM, 4)?.name, "build");
  assert.equal(sectionAt(FORM, 8)?.name, "main");
  assert.equal(sectionAt(FORM, 15)?.name, "main");
  assert.equal(sectionAt(FORM, 16)?.name, "intro"); // wraps
  assert.equal(sectionAt(FORM, 100)?.name, sectionAt(FORM, 100 % 16)?.name);
});

test("a section without energyTo holds its level", () => {
  for (let bar = 0; bar < 4; bar++) assert.equal(sectionAt(FORM, bar)?.energy, 0.2);
});

test("a build ramps across its bars and arrives at its target", () => {
  const energies = [4, 5, 6, 7].map((b) => sectionAt(FORM, b)?.energy ?? 0);
  assert.ok(Math.abs(energies[0]! - 0.3) < 1e-9);
  assert.ok(Math.abs(energies.at(-1)! - 0.9) < 1e-9);
  for (let i = 1; i < energies.length; i++) {
    assert.ok(energies[i]! > energies[i - 1]!, "the ramp is not monotonic");
  }
});

test("energy never leaves [0, 1]", () => {
  const wild: SectionDef[] = [{ name: "x", bars: 4, energy: -2, energyTo: 5 }];
  for (let bar = 0; bar < 4; bar++) {
    const e = sectionAt(wild, bar)?.energy ?? 0;
    assert.ok(e >= 0 && e <= 1, `${e}`);
  }
});

test("degenerate forms do not throw", () => {
  assert.equal(sectionAt([], 0), null);
  assert.equal(sectionAt([{ name: "z", bars: 0, energy: 0.5 }], 3)?.name, "z");
  assert.ok((sectionAt(FORM, -5)?.energy ?? -1) >= 0);
});

test("a genre with no sections sits at a flat middle", () => {
  const { sections: _dropped, ...arrangement } = house.arrangement;
  const flat = { ...house, arrangement };
  for (const bar of [0, 7, 99]) assert.equal(energyAt(flat, bar), 0.5);
});

test("lane windows admit and exclude", () => {
  assert.equal(laneIsIn(0.5, undefined), true);
  assert.equal(laneIsIn(0.5, {}), true);
  assert.equal(laneIsIn(0.1, { minEnergy: 0.25 }), false);
  assert.equal(laneIsIn(0.9, { minEnergy: 0.25 }), true);
  // A maximum is how a pad clears the way for a drop.
  assert.equal(laneIsIn(0.95, { maxEnergy: 0.8 }), false);
  assert.equal(laneIsIn(0.5, { minEnergy: 0.25, maxEnergy: 0.8 }), true);
});

test("densityAt moves the base value and leaves it alone at zero swing", () => {
  assert.equal(densityAt(0.5, 0, 0), 0.5);
  assert.equal(densityAt(0.5, 1, 0), 0.5);
  assert.equal(densityAt(0.5, 0.5, 0.3), 0.5); // mid energy is neutral
  assert.ok(densityAt(0.5, 1, 0.3) > 0.5);
  assert.ok(densityAt(0.5, 0, 0.3) < 0.5);
  assert.ok(densityAt(0.9, 1, 0.5) <= 1);
  assert.ok(densityAt(0.1, 0, 0.5) >= 0);
});

test("the default form builds, drops out and builds again", () => {
  const energies = Array.from(
    { length: DEFAULT_SECTIONS.reduce((a, s) => a + s.bars, 0) },
    (_, bar) => sectionAt(DEFAULT_SECTIONS, bar)?.energy ?? 0,
  );
  assert.ok(Math.max(...energies) > 0.9);
  assert.ok(Math.min(...energies) < 0.3);
});

// What the curve is for.
test("house takes the kick out in the breakdown and brings it back", () => {
  const states = defaultLaneStates(house);
  const kick = lanesOf(house).findIndex((l) => l.name === "kick");
  const sections = house.arrangement.sections ?? [];
  const breakdown = sections.findIndex((s) => s.name === "breakdown");
  const start = sections.slice(0, breakdown).reduce((a, s) => a + s.bars, 0);

  // Silent for every bar of the breakdown, and sounding for most of the section before
  // it. "Most" rather than "all" because the mute roll still varies things within a
  // section — that is its job, and the two mechanisms are deliberately separate.
  for (let bar = start; bar < start + 16; bar++) {
    assert.equal(
      scoreLane(house, kick, 1, bar, states[kick]!).length,
      0,
      `the kick sounded in breakdown bar ${bar}`,
    );
  }
  let before = 0;
  for (let bar = start - 32; bar < start; bar++) {
    if (scoreLane(house, kick, 1, bar, states[kick]!).length > 0) before++;
  }
  assert.ok(before > 20, `the kick sounded in only ${before} of the 32 bars before it`);
});

test("chords carry the breakdown, since they are what it is made of", () => {
  const states = defaultLaneStates(house);
  const chords = lanesOf(house).findIndex((l) => l.kind === "chords");
  const sections = house.arrangement.sections ?? [];
  const breakdown = sections.findIndex((s) => s.name === "breakdown");
  const start = sections.slice(0, breakdown).reduce((a, s) => a + s.bars, 0);

  let sounding = 0;
  for (let bar = start; bar < start + 16; bar++) {
    if (scoreLane(house, chords, 1, bar, states[chords]!).length > 0) sounding++;
  }
  assert.ok(sounding > 8, `chords sounded in only ${sounding} of 16 breakdown bars`);
});

test("every genre's form is well formed", () => {
  for (const genre of genreList()) {
    const sections = genre.arrangement.sections;
    if (sections === undefined) continue;
    for (const s of sections) {
      assert.ok(s.bars > 0, `${genre.id}/${s.name} has no bars`);
      assert.ok(s.bars % 4 === 0, `${genre.id}/${s.name} is ${s.bars} bars, not a phrase`);
      assert.ok(s.energy >= 0 && s.energy <= 1, `${genre.id}/${s.name} energy`);
      if (s.energyTo !== undefined) {
        assert.ok(s.energyTo >= 0 && s.energyTo <= 1, `${genre.id}/${s.name} energyTo`);
      }
    }
    // A form that never varies is not a form.
    const levels = sections.flatMap((s) => [s.energy, s.energyTo ?? s.energy]);
    assert.ok(Math.max(...levels) - Math.min(...levels) > 0.3, `${genre.id} form is flat`);
  }
});

test("energy filters are configured in the direction they claim", () => {
  for (const genre of genreList()) {
    const f = genre.fx.energyFilter;
    if (f === undefined) continue;
    assert.ok(f.lo > 0 && f.hi > 0, `${genre.id} has a non-positive cutoff`);
    assert.notEqual(f.lo, f.hi, `${genre.id}'s filter does not move`);
    // A lowpass opens as energy rises; a highpass gets out of the way, so it descends.
    if (f.type === "lowpass") assert.ok(f.hi > f.lo, `${genre.id}'s lowpass closes as it lifts`);
    else assert.ok(f.hi < f.lo, `${genre.id}'s highpass rises as it lifts`);
  }
});

test("a lane is never left with nothing to play in every section", () => {
  for (const genre of genreList()) {
    const states = defaultLaneStates(genre);
    const total = (genre.arrangement.sections ?? []).reduce((a, s) => a + s.bars, 0) || 64;
    for (const lane of lanesOf(genre)) {
      let sounded = false;
      for (let bar = 0; bar < total && !sounded; bar++) {
        if (scoreLane(genre, lane.index, 3, bar, states[lane.index]!).length > 0) sounded = true;
      }
      assert.ok(sounded, `${genre.id}/${lane.name} never plays anywhere in the form`);
    }
  }
});
