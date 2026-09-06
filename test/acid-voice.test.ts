import { test } from "node:test";
import assert from "node:assert/strict";
import { createAudition } from "../tools/procedural-score.ts";
import { withAcidVoice } from "../tools/acid-voice-score.ts";
import { readAcidSettings } from "../src/audio/acid-mono.ts";

test("acid audition preserves pitches, onsets, accents, all accompaniment and saved defaults", () => {
  for (const seed of [30, 0x9d2371fe, ...Array.from({ length: 64 }, (_, i) => i)]) {
    const original = createAudition(seed), before = JSON.stringify(original.events);
    assert.equal(withAcidVoice(original, { voice: "current", drive: "clean" }), original);
    const source = original.pattern.queryArc(0, 32).map(h => h.value);
    for (const voice of ["mono-step-1", "mono-link-1"] as const) {
      const a = withAcidVoice(original, { voice, drive: "grit" });
      assert.equal(a.events, original.events); assert.equal(JSON.stringify(a.events), before);
      assert.equal(a.bpm, original.bpm); assert.equal(a.kickDesign, original.kickDesign);
      const events = a.pattern.queryArc(0, 32).map(h => h.value);
      assert.deepEqual(events.filter(n => n.laneId !== "acid"), source.filter(n => n.laneId !== "acid"));
      const notes = events.filter(n => n.acidChain).flatMap(n => n.acidChain!.tones.map(t => ({ begin: n.begin + t.offset, midi: t.midi })));
      assert.deepEqual(notes, source.filter(n => n.laneId === "acid").map(n => ({ begin: n.begin, midi: n.midi })));
      for (const n of events.filter(n => n.acidChain)) {
        const chain = n.acidChain!;
        assert.ok(chain.tones.length >= 1 && chain.tones.length <= 3);
        assert.ok(chain.window >= chain.gate && chain.gate > 0);
        if (voice === "mono-step-1") assert.equal(chain.tones.length, 1);
        for (const next of chain.tones.slice(1)) {
          const event = source.find(e => e.laneId === "acid" && e.begin === n.begin + next.offset)!;
          assert.equal(event.accent, false, "preserve accented attacks");
          assert.notEqual(event.begin * 32 % 8, 0, "preserve beat boundaries");
        }
      }
    }
  }
});

test("liked seeds actually contain linked pitch changes, with repeatable queries and muting", () => {
  for (const seed of [30, 0x9d2371fe]) {
    const muted = new Set<string>(), base = createAudition(seed, "new", false, muted);
    const a = withAcidVoice(base, { voice: "mono-link-1", drive: "bite" }, muted);
    const collect = (start: number, end: number) => a.pattern.queryArc(start, end).filter(h => h.hasOnset()).map(h => h.value);
    const full = collect(0, 32);
    assert.ok(full.some(n => n.acidChain && new Set(n.acidChain.tones.map(t => t.midi)).size > 1));
    assert.deepEqual(Array.from({ length: 1024 }, (_, i) => collect(i / 32, (i + 1) / 32)).flat(), full);
    assert.deepEqual(collect(32, 64).map(n => ({ ...n, begin: n.begin - 32, end: n.end - 32 })), full);
    const later = collect(4, 8); collect(900, 910); assert.deepEqual(collect(4, 8), later);
    muted.add("acid"); assert.deepEqual(collect(0, 32), full.filter(n => n.laneId !== "acid"));
    muted.clear(); assert.deepEqual(collect(0, 32), full);
    assert.deepEqual(withAcidVoice(base, { voice: "mono-link-1", drive: "clean" }).pattern.queryArc(0, 32).map(h => h.value), full);
  }
});

test("acid voice versions reject unknown values instead of silently changing a saved take", () => {
  assert.deepEqual(readAcidSettings(null, null), { voice: "current", drive: "clean" });
  assert.throws(() => readAcidSettings("mono-link-2", null), /Unknown acid voice/);
  assert.throws(() => readAcidSettings(null, "fuzz"), /Unknown acid drive/);
});
