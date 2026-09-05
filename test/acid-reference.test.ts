import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { referenceBar, referencePattern, type ReferenceVariant } from "../tools/acid-reference-score.ts";

test("the reference matches 622 events evaluated from the original code on strudel.cc", () => {
  // Captured from the live REPL on 2026-09-05, independently of this score adapter.
  // Include zero-gain drum events and complete spans, not only audible onsets.
  const names: Record<number, string> = { 40:"e2",52:"e3",43:"g2",46:"bb2",45:"a2",50:"d3",38:"d2",55:"g3" };
  const keys = ["s","note","gain","pan","room","attack","decay","sustain","release","ftype","cutoff","resonance","lpenv","lpattack","lpdecay","lpsustain","bank"];
  const rows = Array.from({ length: 16 }, (_, bar) => referenceBar(bar)).flat().map(e =>
    [e.begin, e.end, ...keys.map(k => k === "note" ? names[Number(e.sound.note)] ?? null : e.sound[k] ?? null)])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.equal(rows.length, 622);
  assert.equal(createHash("sha256").update(JSON.stringify(rows)).digest("hex"), "e67339bfd1fd625dc6dcffd38184a4dc69d5ec2996482c0c394a788914bfde96");
});

test("seeded edits preserve rests, anchors, endings and each bar's pitch pool", () => {
  const original = Array.from({ length: 4 }, (_, bar) => referenceBar(bar)).flat();
  for (let seed = 0; seed < 100; seed++) {
    const changed = Array.from({ length: 4 }, (_, bar) => referenceBar(bar, "variation", seed)).flat();
    assert.equal(changed.filter((e, i) => e.midi !== original[i]!.midi).length, 4);
    assert.deepEqual(changed.map(e => [e.laneId,e.begin,e.end]), original.map(e => [e.laneId,e.begin,e.end]));
    for (let bar = 0; bar < 4; bar++) {
      const pitches = (events: typeof original) => events.filter(e => e.kind === "bass" && Math.floor(e.begin) === bar).map(e => e.midi).sort();
      assert.deepEqual(pitches(changed), pitches(original));
    }
    changed.forEach((e, i) => {
      if (e.kind !== "bass" || (e.begin * 16) % 4 === 0 || e.begin % 1 >= .75) assert.deepEqual(e, original[i]);
    });
  }
});

test("auditions isolate the changed element", () => {
  for (let bar = 0; bar < 16; bar++) {
    const original = referenceBar(bar);
    for (const variant of ["biquad","303","generated","variation"] as ReferenceVariant[]) {
      const changed = referenceBar(bar, variant, 2);
      assert.deepEqual(changed.filter(e => e.kind === "drum"), original.filter(e => e.kind === "drum"));
      if (variant === "303") assert.deepEqual(changed, original);
      if (variant === "biquad") assert.deepEqual(changed.map(e => e.kind === "bass" ?
        { ...e, sound: { ...e.sound, ftype: "ladder" } } : e), original);
      if (variant === "generated") for (const e of changed.filter(e => e.kind === "bass")) {
        assert.equal(e.sound.ftype, "ladder"); assert.equal(e.end - e.begin, 1 / 16);
        assert.equal(e.sound.gain, [.55,.35,.4,.65][(e.begin * 16) % 4]);
      }
    }
  }
});

test("reference queries preserve onsets when fragmented or sought", () => {
  for (const variant of ["original","variation","generated"] as ReferenceVariant[]) {
    const pattern = referencePattern(variant, 7);
    const onsets = (haps: ReturnType<typeof pattern.queryArc>) => haps.filter(h => h.hasOnset()).map(h => [+h.whole.begin,+h.whole.end,h.value]);
    const distant = onsets(pattern.queryArc(600,604));
    for (let bar = 0; bar < 600; bar++) pattern.queryArc(bar,bar + 1);
    assert.deepEqual(onsets(Array.from({ length: 256 }, (_, i) => pattern.queryArc(600 + i / 64,600 + (i + 1) / 64)).flat()), distant);
  }
});
