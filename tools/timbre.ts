import { createPoly, type PolyParams, type TimbreName } from "../src/audio/poly.ts";
import { wav } from "./wav.ts";

/**
 * One phrase per timbre, rendered bare.
 *
 * The point is to be able to ask someone — or something — what instrument they hear,
 * without a genre's drums and arrangement answering the question for them.
 */

const log = document.getElementById("log") as HTMLPreElement;
const SINK = "http://127.0.0.1:8787";
const RATE = 48000;

const CASES: { name: string; params: Partial<PolyParams>; notes: number[][] }[] = [
  { name: "subtractive", params: { timbre: "subtractive" }, notes: [[64], [67], [71], [64, 67, 71]] },
  { name: "fm-rhodes", params: { timbre: "fm", fmRatio: 1, fmIndex: 1.4, fmDecay: 0.4, decay: 1.6 }, notes: [[64], [67], [71], [64, 67, 71]] },
  { name: "fm-bell", params: { timbre: "fm", fmRatio: 3.5, fmIndex: 3, fmDecay: 0.25, decay: 2 }, notes: [[76], [79], [83], [76, 83]] },
  { name: "pluck-guitar", params: { timbre: "pluck", pluck: { damp: 0.42, decay: 2.2, colour: 0.75 } }, notes: [[64], [67], [71], [64, 67, 71]] },
  { name: "pluck-upright", params: { timbre: "pluck", cutoff: 1100, pluck: { damp: 0.55, decay: 2.6, colour: 0.28 } }, notes: [[40], [43], [45], [40]] },
  { name: "pluck-sitar", params: { timbre: "pluck", cutoff: 4200, pluck: { damp: 0.34, decay: 2.6, colour: 0.85 } }, notes: [[57], [59], [60], [64]] },
  { name: "brass", params: { timbre: "brass" }, notes: [[60], [64], [67], [60, 64, 67]] },
  { name: "brass-tuba", params: { timbre: "brass", cutoff: 850, envMod: 1500, formant: 320, sustain: 0.3, decay: 0.3, vibrato: 6, level: 1 }, notes: [[36], [43], [36], [43]] },
  { name: "reed-accordion", params: { timbre: "reed" }, notes: [[64], [67], [71], [64, 67, 71]] },
];

for (const { name, params, notes } of CASES) {
  const seconds = 4;
  const ctx = new OfflineAudioContext(2, RATE * seconds, RATE);
  const poly = createPoly(ctx, ctx.destination, params);
  await poly.ready;
  notes.forEach((chord, i) => poly.play(0.15 + i * 0.9, chord, 0.9));
  const buffer = await ctx.startRendering();
  const blob = wav(buffer);
  await fetch(`${SINK}/timbre-${name}.wav`, { method: "POST", body: blob });
  log.textContent += `${name} ${(blob.size / 1024).toFixed(0)} KiB\n`;
}
log.textContent += "DONE\n";
await fetch(`${SINK}/__done`, { method: "POST", body: "" });
