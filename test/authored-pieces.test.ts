import { test } from "node:test";
import assert from "node:assert/strict";
import { createPiece, PIECE_IDS, readPiece } from "../tools/authored-pieces-score.ts";

test("written pieces are finite, complete scores with valid notes and mono gates", () => {
  for (const id of PIECE_IDS) {
    const score = createPiece(id), scheduled = score.pattern.queryArc(0, score.bars).map(h => h.value);
    assert.ok(score.events.length > 0);
    assert.deepEqual(createPiece(id).events, score.events);
    assert.equal(score.sections[0]!.begin, 0);
    assert.equal(score.sections.at(-1)!.end, score.bars);
    for (const [i, section] of score.sections.entries()) if (i) assert.equal(section.begin, score.sections[i - 1]!.end);
    for (const event of scheduled) {
      assert.ok(event.begin >= 0 && event.end <= score.bars && event.end > event.begin);
      assert.ok(Object.hasOwn(score.parts, event.laneId));
      if (event.midi !== undefined) assert.ok(Number.isInteger(event.midi) && event.midi >= 24 && event.midi < 100);
      for (const value of Object.values(event.sound)) if (typeof value === "number") assert.ok(Number.isFinite(value));
      const chain = event.acidChain;
      if (chain) assert.ok(chain.gate > 0 && chain.window >= chain.gate);
    }
    const acid = scheduled.filter(n => n.acidChain).flatMap(n => n.acidChain!.tones.map(t => ({ at: n.begin + t.offset, pitch: t.midi })));
    assert.deepEqual(acid, score.events.filter(n => n.laneId === "acid").map(n => ({ at: n.begin, pitch: n.midi })));
    assert.equal(score.pattern.queryArc(score.bars, score.bars * 2).length, 0, "a written ending must not loop back to its opening");
  }
});

test("fragmented scheduling and live mutes preserve the written composition, including held atmosphere", () => {
  for (const id of PIECE_IDS) {
    const muted = new Set<string>(), score = createPiece(id, muted);
    const collect = (begin: number, end: number) => score.pattern.queryArc(begin, end).filter(h => h.hasOnset()).map(h => h.value);
    const full = collect(0, score.bars);
    assert.deepEqual(Array.from({ length: score.bars * 32 }, (_, i) => collect(i / 32, (i + 1) / 32)).flat(), full);
    assert.ok(score.pattern.queryArc(.5, .6).some(h => h.value.laneId === "space" && !h.hasOnset()));
    const before = JSON.stringify(score.events);
    muted.add("acid"); muted.add("space");
    assert.deepEqual(collect(0, score.bars), full.filter(n => !muted.has(n.laneId)));
    muted.clear(); assert.deepEqual(collect(0, score.bars), full); assert.equal(JSON.stringify(score.events), before);
  }
});

test("written composition links select explicit versions", () => {
  assert.equal(readPiece(null), "ferro-1");
  assert.equal(readPiece("scia-1"), "scia-1");
  assert.throws(() => readPiece("scia-2"), /Unknown composition version/);
});
