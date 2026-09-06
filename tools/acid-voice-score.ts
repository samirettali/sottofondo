import { Pattern } from "@strudel/core/pattern.mjs";
import { Hap } from "@strudel/core/hap.mjs";
import { TimeSpan } from "@strudel/core/timespan.mjs";
import { h32, cyrb128 } from "../src/core/rng.ts";
import { readAcidSettings, type AcidSettings, type AcidChain } from "../src/audio/acid-mono.ts";
import type { Audition } from "./procedural-score.ts";
import type { ReferenceEvent } from "./acid-reference-score.ts";

const DOMAIN = cyrb128("acid-articulation-1")[0];

/** Compose articulation over the immutable note list. Never change any pitch,
 * onset, accent or accompanying part. Join only adjacent sixteenths, at most
 * three notes, and preserve longer rests, accented attacks and beat boundaries. */
export function withAcidVoice(a: Audition, settings: AcidSettings, muted: ReadonlySet<string> = new Set()): Audition {
  readAcidSettings(settings.voice, settings.drive);
  if (settings.voice === "current") return a;
  const chains: ReferenceEvent[][] = [];
  let charge = 0, lastAccent = -10;
  for (let bar = 0; bar < 32; bar++) {
    const notes = a.events[bar]!.filter(n => n.laneId === "acid").sort((x, y) => x.begin - y.begin);
    const candidates = notes.flatMap((n, i) => {
      const next = notes[i + 1];
      return next && next.begin - n.begin <= 2 / 32 && !next.accent && (next.begin * 32) % 8 !== 0 ? [i] : [];
    });
    // One addressed draw chooses a repeating articulation gesture for this bar.
    const gesture = h32(a.composition.identity.seed, bar % a.composition.identity.motifBars, DOMAIN);
    const selected = new Set<number>();
    if (settings.voice === "mono-link-1" && candidates.length) {
      selected.add(candidates[gesture % candidates.length]!);
      if (candidates.length > 2) selected.add(candidates[(gesture >>> 8) % candidates.length]!);
    }
    const result: ReferenceEvent[] = [];
    for (let i = 0; i < notes.length; i++) {
      const root = notes[i]!, group = [root];
      while (selected.has(i) && group.length < 3) group.push(notes[++i]!);
      const last = group.at(-1)!;
      const sound = root.sound;
      charge *= Math.exp(-(root.begin - lastAccent) * 240 / a.bpm / .25);
      if (root.accent) charge = Math.min(3, charge + 1);
      lastAccent = root.begin;
      const chain: AcidChain = {
        gate: last.end - root.begin, window: (notes[i + 1]?.begin ?? bar + 1) - root.begin,
        tones: group.map(n => ({ offset: n.begin - root.begin, midi: n.midi!, gain: Number(n.sound.gain),
          cutoff: Number(n.sound.cutoff), resonance: Number(n.sound.resonance) })),
        depth: Number(sound.lpenv), decay: Number(sound.lpdecay), charge, accent: root.accent,
        delay: Number(sound.delay ?? 0), feedback: Number(sound.delayfeedback ?? 0), delayCycles: Number(sound.delaysync ?? .1875),
      };
      result.push({ ...root, end: last.end, acidChain: chain });
    }
    chains.push(result);
  }
  const pattern = new Pattern<ReferenceEvent>(({ span }) => {
    const result = a.pattern.queryArc(+span.begin, +span.end).filter(hap => hap.value.laneId !== "acid");
    if (!muted.has("acid")) for (let bar = Math.max(0, Math.floor(+span.begin)); bar < Math.ceil(+span.end); bar++) {
      const offset = bar - bar % 32;
      for (const stored of chains[bar % 32]!) {
        const value = { ...stored, begin: stored.begin + offset, end: stored.end + offset };
        const whole = new TimeSpan(value.begin, value.end), part = whole.intersection(span);
        if (part && +part.end > +part.begin) result.push(new Hap(whole, part, value));
      }
    }
    return result.sort((x, y) => +x.whole.begin - +y.whole.begin || (x.value.laneId < y.value.laneId ? -1 : x.value.laneId > y.value.laneId ? 1 : 0));
  });
  const wave = a.events.flat().find(n => n.laneId === "acid")?.sound.s === "square" ? "square" : "sawtooth";
  return { ...a, pattern, acidSettings: settings, acidWave: wave };
}
