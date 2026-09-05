import test from "node:test";
import assert from "node:assert/strict";
import { createStudy, gesture, STUDIES, STUDY_IDS, studyBar, studyForSeed, studyPattern, studySection } from "../tools/acid-studies-score.ts";

test("authored gestures fit two beats and tension resolves inside its gesture", () => {
  for (const spec of Object.values(STUDIES)) {
    for (const cell of Object.values(spec.vocabulary).flat()) {
      const notes = gesture(cell);
      notes.forEach((n, i) => {
        assert(n.step >= 0 && n.step + n.length <= 8);
        assert(n.gain > 0 && n.gain <= 1);
        if (n.degree === 3) {
          assert.equal(notes[i + 1]?.degree, 4);
          assert.equal(notes[i + 1]?.step, n.step + 1);
          assert(n.gain < notes[i + 1]!.gain);
        }
      });
    }
    spec.vocabulary.endings.forEach(cell => assert.equal(gesture(cell).at(-1)!.degree, 0));
  }
});

test("generated studies retain the statement and tonic closure across 1500 seeds", () => {
  for (const id of STUDY_IDS) for (let seed = 0; seed < 500; seed++) {
    const plan = createStudy(id, "generated", seed);
    const call = gesture(STUDIES[id].vocabulary.calls[plan.decisions.call]!);
    assert.deepEqual(plan.motif[0]!.filter(n => n.step < 8), call);
    assert(plan.motif.slice(1).some(bar => JSON.stringify(bar.filter(n => n.step < 8)) === JSON.stringify(call)));
    assert.equal(plan.motif[3]!.at(-1)!.degree, 0);
    assert.equal(plan.form.reduce((a,b) => a + b), 32);
    for (const bar of plan.motif) {
      assert(bar.length > 0);
      bar.forEach((n,i) => { assert(n.step + n.length <= (bar[i + 1]?.step ?? 16)); });
    }
  }
});

test("seeds vary relative notes and rhythm, independently of tempo and timbre", () => {
  for (const id of STUDY_IDS) {
    const shapes = new Set(Array.from({ length: 256 }, (_, seed) => {
      const plan = createStudy(id, "generated", seed);
      return JSON.stringify(plan.motif.map(bar => bar.map(n => [n.step,n.degree,n.length])));
    }));
    assert(shapes.size > 100, `${id}: only ${shapes.size} relative motifs`);
    assert.deepEqual(createStudy(id, "written", 1).motif, createStudy(id, "written", 500).motif);
  }
  assert.equal(new Set(Array.from({ length: 100 }, (_, seed) => studyForSeed(seed))).size, 3);
});

test("arrangements leave a real break and return, and the bell answers in reserved space", () => {
  for (const id of STUDY_IDS) for (let seed = 0; seed < 20; seed++) {
    const plan = createStudy(id, "generated", seed);
    for (let bar = 0; bar < 32; bar++) {
      const events = studyBar(plan, bar), section = studySection(plan, bar);
      assert(events.every(e => e.begin >= bar && e.end > e.begin && e.end <= bar + 1));
      if (section.name === "space") assert(!events.some(e => e.laneId === "bd"));
      if (section.name === "return") assert(events.some(e => e.laneId === "bd"));
      if (section.name === "build" && section.local === section.length - 1) assert(events.every(e => e.begin < bar + .5));
      for (const bell of events.filter(e => e.laneId === "bell")) {
        assert(!events.some(e => e.laneId === "acid" && e.begin < bell.end && e.end > bell.begin));
      }
    }
  }
});

test("study queries preserve complete spans through fragmentation and distant seeking", () => {
  for (const id of STUDY_IDS) {
    const plan = createStudy(id, "generated", 42), pattern = studyPattern(plan);
    const onsets = (haps: ReturnType<typeof pattern.queryArc>) => haps.filter(h => h.hasOnset()).map(h => [+h.whole.begin,+h.whole.end,h.value]);
    const expected = onsets(pattern.queryArc(600,604));
    for (let bar = 0; bar < 600; bar++) pattern.queryArc(bar,bar + 1);
    assert.deepEqual(onsets(Array.from({ length: 256 }, (_, i) => pattern.queryArc(600 + i/64,600 + (i+1)/64)).flat()), expected);
    assert.deepEqual(studyBar(createStudy(id, "generated", 42), 602), studyBar(plan, 602));
  }
});
