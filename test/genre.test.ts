import { test } from "node:test";
import assert from "node:assert/strict";

import { epochAt, EPOCHS } from "../src/arrange/epoch.ts";
import { GENRES, defaultGenre, genreList } from "../src/genre/index.ts";
import { acid } from "../src/genre/acid.ts";
import { techno } from "../src/genre/techno.ts";
import { compositeCycleSteps, track } from "../src/core/time.ts";
import { defaultVoice, realise } from "../src/pattern/gen.ts";
import { chooseNoteSet, defaultNoteVoice, realiseNotes } from "../src/pattern/notes.ts";

test("the registry is consistent", () => {
  for (const [id, genre] of Object.entries(GENRES)) {
    assert.equal(id, genre.id, "registry key must be the genre id");
  }
  assert.ok(genreList().includes(defaultGenre));
});

test("every genre is internally well formed", () => {
  for (const genre of genreList()) {
    const { bpm } = genre.clock;
    assert.ok(bpm.min <= bpm.default && bpm.default <= bpm.max, `${genre.id} tempo range`);
    assert.ok(genre.clock.swing >= 0.5 && genre.clock.swing <= 0.75, `${genre.id} swing`);
    assert.ok(genre.clock.stepsPerBar % 4 === 0, `${genre.id} grid`);
    assert.ok(genre.drums.length > 0, `${genre.id} has no drums`);
    assert.ok(genre.version >= 1, `${genre.id} version`);
    assert.ok(genre.refs.length > 0, `${genre.id} cites no reference tracks`);

    const names = genre.drums.map((d) => d.name);
    if (genre.bass !== undefined) names.push(genre.bass.name);
    assert.equal(new Set(names).size, names.length, `${genre.id} has duplicate voice names`);

    // A send that names a voice which does not exist is a silent no-op, so catch it here.
    for (const send of genre.fx.delay.sends) {
      assert.ok(names.includes(send), `${genre.id} sends unknown voice "${send}"`);
    }
    for (const target of genre.fx.sidechain.targets) {
      assert.ok(names.includes(target), `${genre.id} ducks unknown voice "${target}"`);
    }

    for (const d of genre.drums) {
      assert.ok(d.density >= 0 && d.density <= 1, `${genre.id}/${d.name} density`);
      // The literature is consistent that random microtiming does not add groove.
      assert.ok((d.jitterMs ?? 0) <= 8, `${genre.id}/${d.name} jitter is too large`);
    }
  }
});

// The acid preset is a port of the reference implementation, so it has a right answer.
test("acid keeps the eight interval bags verbatim", () => {
  assert.equal(acid.bass?.bags.length, 8);
  assert.deepEqual(acid.bass?.bags[3], [0], "the drone bag");
  assert.deepEqual(acid.bass?.bags[6], [0, 0, 0, 0, 12, 13, 16, 19, 22, 24, 25]);
  for (const bag of acid.bass?.bags ?? []) {
    assert.ok(bag.includes(0), "every bag must contain the root");
  }
});

test("acid's bass sits in the reference's register", () => {
  assert.deepEqual(acid.bass?.rootRange, [28, 42]); // E1 to F#2
});

test("acid keeps the reference's accent and slide odds", () => {
  assert.equal(acid.bass?.accentP, 0.3);
  assert.equal(acid.bass?.slideP, 0.1);
});

test("acid keeps the reference's 303 settings and autopilot cadence", () => {
  assert.deepEqual(acid.bass?.synth, { cutoff: 400, resonance: 15, envMod: 4000, decay: 0.5 });
  assert.equal(acid.arrangement.newPatternEvery, 16);
  assert.equal(acid.arrangement.newNotesEvery, 64);
  assert.equal(acid.arrangement.newNotesP, 0.2);
  assert.equal(acid.arrangement.muteEvery, 8);
  assert.equal(acid.fx.delay.noteValue, "3/16"); // dotted eighth
});

test("acid is straight and has no harmony, both deliberately", () => {
  assert.equal(acid.clock.swing, 0.5);
  assert.equal(acid.fx.sidechain.db, 0); // acid does not pump
  for (const d of acid.drums) assert.equal(d.swingDepth ?? 0, 0);
});

/**
 * The reference's gate probabilities are 0.6/0.5/0.3/0.1 by metric class, which works out
 * at 5.8 onsets per sixteen steps. This engine expresses the same shape as a density
 * against the metric curve, so the number is the thing to hold onto rather than the four
 * probabilities.
 */
test("acid's 303 lands near the reference's 5.8 onsets per bar", () => {
  const bass = acid.bass;
  assert.ok(bass !== undefined);
  const voice = defaultNoteVoice({
    gen: bass.gen,
    density: bass.density,
    chaos: bass.chaos ?? 0,
    accentP: bass.accentP,
    slideP: bass.slideP,
  });
  const spec = { every: 16, p: 0.5, salt: EPOCHS.pattern };

  let notes = 0;
  const bars = 2000;
  for (let bar = 0; bar < bars; bar++) {
    const epoch = epochAt(1234, bar, spec);
    const set = chooseNoteSet(bass.bags, bass.rootRange, 1234, 0, 0);
    notes += realiseNotes(voice, set, 16, 1234, epoch, 0).length;
  }
  const perBar = notes / bars;
  assert.ok(perBar > 5.0 && perBar < 6.6, `${perBar.toFixed(2)} onsets per bar`);
});

test("acid's kick is four on the floor and its open hat is on the offbeats", () => {
  const kick = acid.drums.find((d) => d.name === "kick");
  const openHat = acid.drums.find((d) => d.name === "open hat");
  assert.deepEqual(kick?.gen, { type: "mask", steps: [0, 4, 8, 12] });
  assert.deepEqual(openHat?.gen, { type: "mask", steps: [2, 6, 10, 14] });

  const hits = realise(
    defaultVoice(kick!.gen, { density: kick!.density }),
    16,
    1,
    0,
    0,
  ).map((h) => h.step);
  assert.deepEqual(hits, [0, 4, 8, 12]);
});

test("techno's perc lane is polymetric against the bar", () => {
  const perc = techno.drums.find((d) => d.name === "perc");
  assert.equal(perc?.len, 7);
  const lanes = techno.drums.map((d) => track(d.len ?? techno.clock.stepsPerBar));
  // Seven against sixteen is coprime, so the figure lands somewhere new for seven bars.
  assert.equal(compositeCycleSteps(lanes), 112);
});

test("two lanes may share one kit voice", () => {
  const closed = techno.drums.filter((d) => d.kitVoice === "closedHat");
  assert.equal(closed.length, 2, "a steady lane and a ghost lane on the same voice");
  assert.notEqual(closed[0]?.name, closed[1]?.name);
});

test("acid's kick drops out far less often than anything else", () => {
  const kick = acid.drums.find((d) => d.name === "kick");
  for (const d of acid.drums) {
    if (d.name === "kick") continue;
    assert.ok((kick?.muteP ?? 0) < (d.muteP ?? 0), `kick vs ${d.name}`);
  }
});
