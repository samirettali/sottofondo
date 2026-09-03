import { test } from "node:test";
import assert from "node:assert/strict";

import type { GenreDef } from "../src/genre/schema.ts";
import { genreList } from "../src/genre/index.ts";
import { lanesOf, laneSilent, scoreLane, type LaneKind } from "../src/score.ts";

/**
 * A preset has to state what it is, early, on any seed.
 *
 * This is not a stylistic preference. Two presets used to open with thirty-two bars below
 * the energy their own voices need: techno's bass arrived a minute in, and progressive
 * had no drums at all until then. Handed thirty seconds of either — which is what anyone
 * who presses play actually hears — a listener called progressive "ambient drone, no
 * percussion" and techno "drum and bass".
 *
 * So: within the first eight bars, and on every seed, a preset sounds at least one drum
 * lane, and at least one melodic voice if it has any.
 */

/** Enough seeds that a lane which is empty one time in forty is caught rather than met. */
const SEEDS = Array.from({ length: 200 }, (_, i) => i * 977 + 1);
const OPENING_BARS = 8;

/** The density a lane starts at, which is what the engine hands the scorer. */
function densityOf(genre: GenreDef, laneIndex: number): number {
  const lanes = lanesOf(genre);
  const lane = lanes[laneIndex];
  if (lane === undefined) return 0.5;
  if (lane.kind === "drum") return genre.drums[laneIndex]?.density ?? 0.5;
  if (lane.kind === "bass") return genre.bass?.density ?? 0.5;
  if (lane.kind === "chords") return genre.chords?.density ?? 0.5;
  return genre.lead?.density ?? 0.5;
}

function hitsInOpening(genre: GenreDef, laneIndex: number, seed: number): number {
  const state = { density: densityOf(genre, laneIndex), userMuted: false };
  let hits = 0;
  for (let bar = 0; bar < OPENING_BARS; bar++) {
    if (laneSilent(genre, laneIndex, seed, bar, state)) continue;
    hits += scoreLane(genre, laneIndex, seed, bar, state).length;
  }
  return hits;
}

test("every preset states itself inside eight bars, on every seed", () => {
  for (const genre of genreList()) {
    const lanes = lanesOf(genre);
    const of = (kind: LaneKind) => lanes.filter((lane) => lane.kind === kind);
    const melodic = [...of("bass"), ...of("chords"), ...of("lead")];
    const drums = of("drum");

    for (const seed of SEEDS) {
      // Ambient is the one preset entitled to open without percussion: its three lanes
      // are a drone, a pad and a bell, and a beat would be the defect.
      if (drums.length > 0 && genre.id !== "ambient") {
        const hits = drums.reduce((sum, lane) => sum + hitsInOpening(genre, lane.index, seed), 0);
        assert.ok(hits > 0, `${genre.id} seed ${seed}: no drums in the first ${OPENING_BARS} bars`);
      }

      if (melodic.length > 0) {
        const hits = melodic.reduce((sum, lane) => sum + hitsInOpening(genre, lane.index, seed), 0);
        assert.ok(
          hits > 0,
          `${genre.id} seed ${seed}: nothing melodic in the first ${OPENING_BARS} bars`,
        );
      }
    }
  }
});

/**
 * No bar is ever completely empty.
 *
 * The mute roll may thin an arrangement; emptying it is the failure this guards. The cap
 * itself is tested directly in `epoch.test.ts`; this is the end-to-end version of it,
 * across every preset and the energy curve as well.
 */
test("no bar of any preset falls completely silent", () => {
  for (const genre of genreList()) {
    const lanes = lanesOf(genre);
    for (const seed of SEEDS) {
      for (let bar = 0; bar < 96; bar++) {
        const sounding = lanes.filter(
          (lane) =>
            !laneSilent(genre, lane.index, seed, bar, {
              density: densityOf(genre, lane.index),
              userMuted: false,
            }),
        ).length;
        assert.ok(sounding > 0, `${genre.id} seed ${seed} bar ${bar}: every lane silent`);
      }
    }
  }
});
