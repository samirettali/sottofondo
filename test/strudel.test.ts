import test from "node:test";
import assert from "node:assert/strict";
import { composeBar, compositionPattern, motif } from "../src/strudel/compose.ts";
import { recipe } from "../src/recipe.ts";
import { Transport } from "../src/strudel/transport.ts";

for (const genre of ["acid", "techno", "house"]) {
  const r = recipe(genre, 0xcafe1234);
  test(`${genre}: query fragmentation and seek preserve onsets and durations`, () => {
    const p = compositionPattern(r);
    const serialise = (haps: ReturnType<typeof p.queryArc>) => haps.filter(h => h.hasOnset())
      .map(h => [ +h.whole.begin, +h.whole.end, h.value ]);
    const split = Array.from({ length: 128 }, (_, i) => p.queryArc(i / 32, (i + 1) / 32)).flat();
    assert.deepEqual(serialise(split), serialise(p.queryArc(0, 4)));
    const direct = serialise(p.queryArc(600, 601));
    for (let bar = 0; bar < 600; bar++) p.queryArc(bar, bar + 1);
    assert.deepEqual(serialise(p.queryArc(600, 601)), direct);
  });
  test(`${genre}: mute, density and sound mode cannot perturb other voices`, () => {
    const base = composeBar(r, 40).filter(e => e.laneId !== "closed hat");
    assert.deepEqual(composeBar(r, 40, { "closed hat": { density: 0, muted: true } }).filter(e => e.laneId !== "closed hat"), base);
    assert.deepEqual(composeBar({ ...r, soundMode: "samples" }, 40), composeBar(r, 40));
  });
  test(`${genre}: phrase variations change at most eight motif positions`, () => {
    for (let seed = 0; seed < 32; seed++) {
      const r = recipe(genre, seed);
      const a = motif(r, 0); const b = motif(r, 8);
      assert.ok(a.filter((x, i) => JSON.stringify(x) !== JSON.stringify(b[i])).length <= 8);
      assert.deepEqual(motif(r, 0), motif(r, 2));
    }
  });
}
test("techno polymeter retains absolute phase", () => {
  const r = recipe("techno", 42);
  const positions = (bar: number) => composeBar(r, bar).filter(e => e.laneId === "perc").map(e => Math.round((e.begin - bar) * 16));
  assert.notDeepEqual(positions(50), positions(51));
  assert.deepEqual(positions(50), positions(57));
});
test("house bass leaves the kick and chord-stab positions free", () => {
  for (let seed = 0; seed < 30; seed++) for (const e of composeBar(recipe("house", seed), 40)) {
    if (e.kind === "bass") assert.ok(![0, 2, 4, 8, 10, 12].includes(Math.round((e.begin - 40) * 16)));
  }
});
test("transport splits tempo at the next unscheduled bar without duplicate onsets", async () => {
  let now = 10;
  const seen: { begin: number; time: number; lane: string }[] = [];
  const transport = new Transport(() => now, 120, compositionPattern(recipe("acid", 1)),
    async (h, time) => { seen.push({ begin: +h.whole.begin, time, lane: h.value.laneId }); },
    error => { throw error; }, { start() {}, stop() {} });
  transport.start();
  await new Promise(resolve => setImmediate(resolve));
  transport.setBpm(240);
  for (let i = 0; i < 140; i++) { now += 0.025; await transport.pump(); }
  transport.stop();
  assert.equal(new Set(seen.map(e => `${e.begin}/${e.lane}`)).size, seen.length);
  for (const e of seen) {
    const expected = 10.06 + (e.begin < 1 ? e.begin * 2 : 2 + (e.begin - 1));
    assert.ok(Math.abs(e.time - expected) < 1e-7, `${e.begin}: ${e.time} != ${expected}`);
  }
});
