import test from "node:test";
import assert from "node:assert/strict";
import { performedBar, performedPattern, type AcidSource } from "../tools/acid-performance-score.ts";
import { referenceBar } from "../tools/acid-reference-score.ts";
import { createStudy, studyBar } from "../tools/acid-studies-score.ts";

const sources: AcidSource[] = ["reference", createStudy("pressure"),
  ...Array.from({ length: 64 }, (_, seed) => createStudy("pressure", "generated", seed))];

test("performance preserves every pitch and onset and the complete drum score", () => {
  for (const source of sources) for (let bar = 0; bar < 32; bar++) {
    const before = source === "reference" ? referenceBar(bar) : studyBar(source, bar);
    const after = performedBar(source, bar);
    const notes = (events: typeof before) => events.filter(e => e.laneId === "acid").map(e => [e.begin,e.midi]);
    const drums = (events: typeof before) => events.filter(e => e.laneId !== "acid").sort((a,b) => a.begin - b.begin || (a.laneId < b.laneId ? -1 : 1));
    assert.deepEqual(notes(after), notes(before));
    assert.deepEqual(drums(after), drums(before));
    const acid = after.filter(e => e.laneId === "acid");
    acid.forEach((event, i) => {
      assert(event.begin < event.end && event.end <= (acid[i+1]?.begin ?? bar + 1));
      assert(event.sound.ftype === "ladder" && event.sound.s === "sawtooth");
      assert(Number(event.sound.cutoff) >= 170 && Number(event.sound.cutoff) <= 1700);
      if (event.accent) assert(Number(event.sound.lpdecay) >= .16);
      else assert(Number(event.sound.lpdecay) < .16);
    });
  }
});

test("knob movement changes repeated notes without depending on the written seed", () => {
  assert.deepEqual(performedBar(createStudy("pressure", "written", 1), 9), performedBar(createStudy("pressure", "written", 99), 9));
  const acid = (bar: number) => performedBar("reference", bar).filter(e => e.laneId === "acid");
  assert.deepEqual(acid(0).map(e => e.midi), acid(4).map(e => e.midi));
  assert.notDeepEqual(acid(0).map(e => e.sound.cutoff), acid(4).map(e => e.sound.cutoff));
  assert(new Set(acid(0).map(e => e.sound.cutoff)).size > 4);
  // Curve boundaries are continuous (sampled at onsets, without adding an LFO).
  const last = acid(15).at(-1)!, first = acid(16)[0]!;
  assert(Math.abs(Number(last.sound.cutoff) - Number(first.sound.cutoff)) < 60);
});

test("bell replies reserve a gap without changing surviving notes or drum timing", () => {
  for (const source of sources) {
    let replies = 0;
    for (let bar = 0; bar < 32; bar++) {
      const dry = performedBar(source, bar), wet = performedBar(source, bar, true);
      const bells = wet.filter(e => e.laneId === "bell");
      if (!bells.length) { assert.deepEqual(wet, dry); continue; }
      replies++;
      assert.equal(bar % 8, 7);
      assert.equal(bells.length, 2);
      assert.deepEqual(wet.filter(e => e.laneId !== "bell"), dry.filter(e => e.laneId !== "acid" || e.begin < bar + .5));
      for (const bell of bells) {
        assert(!wet.some(e => e.laneId === "acid" && e.begin < bell.end && e.end > bell.begin));
        assert(bell.begin >= bar + .625 && bell.end < bar + 1);
      }
    }
    assert(replies >= 2 && replies <= 4);
  }
});

test("shaped scores seek and fragment deterministically, including optional replies", () => {
  for (const source of sources.slice(0,4)) for (const bell of [false,true]) {
    const pattern = performedPattern(source, bell);
    const onsets = (haps: ReturnType<typeof pattern.queryArc>) => haps.filter(h => h.hasOnset()).map(h => [+h.whole.begin,+h.whole.end,h.value]);
    const expected = onsets(pattern.queryArc(600,608));
    for (let bar = 0; bar < 600; bar++) pattern.queryArc(bar,bar + 1);
    assert.deepEqual(onsets(Array.from({ length: 512 }, (_, i) => pattern.queryArc(600+i/64,600+(i+1)/64)).flat()), expected);
    assert.deepEqual(pattern.queryArc(-1,0), []);
  }
  assert.throws(() => performedBar(createStudy("crosscurrent"), 0), /available for Pressure/);
});
