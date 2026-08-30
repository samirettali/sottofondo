import { rngFor, valueAt } from "../core/rng.ts";
import { floorMod } from "../core/time.ts";
import { timeline } from "./clave.ts";
import { euclid } from "./euclid.ts";
import { shapedWeight } from "./metric.ts";

/**
 * Pattern generation.
 *
 * Every generator produces a **strength per step**, a number in [0, 1], never a boolean.
 * One threshold comparison then yields density, accents, fills and morphing between
 * patterns — which is the trick Mutable Instruments' Grids turns on, and the reason two
 * knobs there navigate a continuous space of drum patterns instead of a list of them.
 *
 *   fires  ⟺  strength + density + barChaos > 1
 *   accent ⟺  strength > accentAt
 *
 * Raising density lowers the bar and admits progressively weaker steps, strongest first,
 * so one control covers "sparse intro" through "everything at once" without a second
 * table anywhere.
 *
 * Useful calibration for `stepClassP`: a step fires with probability `w + 2d - 1`, so at
 * **density 0.5 the firing probability is exactly the metric weight**. On the 16-step
 * curve that sums to 5.6 onsets per bar, which is where the presets are anchored.
 *
 * An **inverted** lane needs a much lower density for the same event count, because
 * inverting makes almost every step a likely one: around 0.15 gives a handful of ghost
 * notes where 0.5 would give twenty.
 *
 * Chaos is rolled **once per bar per voice**, not per step. Per-step noise sounds
 * sprinkled; a whole bar of busier hats sounds like a decision. That coherence is most
 * of what separates musical probabilistic sequencing from a random gate.
 */

/** What a voice plays, before it is gated. */
export type PatternGen =
  /**
   * Probability by metric position — the model the reference implementation uses.
   *
   * `invert` turns the metric curve upside down, so the generator prefers exactly the
   * places the beat is not. That is what ghost notes, shakers and offbeat percussion do,
   * and flattening the curve with `syncopation` cannot express it: flattening reduces how
   * much the strong positions win by, but they still win.
   */
  | { readonly type: "stepClassP"; readonly amount?: number; readonly invert?: boolean }
  /** Fixed onsets. Genre conventions that are simply conventions live here. */
  | { readonly type: "mask"; readonly steps: readonly number[] }
  | { readonly type: "euclid"; readonly k: number; readonly n: number; readonly rot?: number }
  | { readonly type: "clave"; readonly name: string; readonly rot?: number }
  | { readonly type: "none" };

export interface VoicePattern {
  readonly gen: PatternGen;
  /** 0 silences the voice, 1 admits every step the generator gave any weight to. */
  readonly density: number;
  /** Per-bar variation in density, in [0, 1]. */
  readonly chaos: number;
  /** Strength above which a hit is accented. */
  readonly accentAt: number;
  readonly vel: { readonly base: number; readonly accent: number; readonly ghost: number };
  /** Reshapes the metric curve: below 1 flattens it, above 1 sharpens it. */
  readonly syncopation?: number;
}

export interface Hit {
  readonly step: number;
  readonly velocity: number;
  readonly accent: boolean;
  /** Kept so the UI can draw what the generator wanted, not just what fired. */
  readonly strength: number;
}

/** Salts keeping independent decisions in the same (bar, voice) cell from sharing draws. */
const SALT = { strength: 1, chaos: 2 } as const;

export function defaultVoice(gen: PatternGen, over: Partial<VoicePattern> = {}): VoicePattern {
  return {
    gen,
    density: 0.5,
    chaos: 0,
    accentAt: 0.75,
    vel: { base: 0.7, accent: 1, ghost: 0.25 },
    ...over,
  };
}

/**
 * The strength of every step in a bar, before gating.
 *
 * Deterministic in `(seed, bar, voice)`, so the same bar is always the same bar. The
 * fixed generators ignore randomness entirely; `stepClassP` blends the metric curve with
 * a hashed per-step value, which is what makes it a probabilistic generator rather than
 * another mask — but it is reproducible probability, not live noise.
 */
export function strengths(
  voice: VoicePattern,
  len: number,
  seed: number,
  bar: number,
  voiceIndex: number,
): number[] {
  const gen = voice.gen;
  const syncopation = voice.syncopation ?? 1;

  switch (gen.type) {
    case "none":
      return new Array<number>(len).fill(0);

    case "mask": {
      const out = new Array<number>(len).fill(0);
      for (const s of gen.steps) {
        const i = floorMod(Math.floor(s), len);
        // A masked onset carries its metric weight rather than a flat 1, so density and
        // accent still discriminate between the downbeat and the pickup.
        out[i] = 0.55 + 0.45 * shapedWeight(i, len, syncopation);
      }
      return out;
    }

    case "euclid": {
      const p = euclid(gen.k, gen.n, gen.rot ?? 0);
      return Array.from({ length: len }, (_, i) => {
        const on = p[i % p.length] ?? 0;
        return on ? 0.55 + 0.45 * shapedWeight(i, len, syncopation) : 0;
      });
    }

    case "clave": {
      const p = timeline(gen.name, gen.rot ?? 0);
      return Array.from({ length: len }, (_, i) => {
        const on = p[i % p.length] ?? 0;
        return on ? 0.55 + 0.45 * shapedWeight(i, len, syncopation) : 0;
      });
    }

    case "stepClassP": {
      const rng = rngFor(seed, bar, voiceIndex, SALT.strength);
      const amount = gen.amount ?? 1;
      return Array.from({ length: len }, (_, i) => {
        const metric = shapedWeight(i, len, syncopation);
        // Inverted, the downbeat is the least likely place and the offbeat sixteenths the
        // most. The floor keeps the strongest positions merely unlikely rather than
        // forbidden, so a ghost lane can still land on a beat occasionally.
        const w = gen.invert === true ? Math.max(0.08, 1 - metric) : metric;
        // Half the strength is where the step sits in the bar, half is the draw. Pure
        // metric weight gives the same pattern every bar; pure draw gives noise.
        //
        // Both halves span the full range on purpose: a weak step must still be able to
        // reach the top, or no amount of density will ever let an offbeat sixteenth
        // through and every bar collapses onto the four beats.
        return Math.min(1, amount * (0.5 * w + 0.5 * rng()));
      });
    }
  }
}

/** The per-bar, per-voice density offset. Rolled once, at the top of the bar. */
export function barChaos(voice: VoicePattern, seed: number, bar: number, voiceIndex: number): number {
  if (voice.chaos <= 0) return 0;
  // Centred on zero, so chaos thins a bar as readily as it thickens one.
  return (valueAt(seed, bar, voiceIndex, SALT.chaos) - 0.5) * voice.chaos;
}

/**
 * Gate a bar of strengths into hits.
 *
 * Two keys, because the arrangement runs two clocks. `patternKey` is the epoch: it moves
 * rarely, so the pattern repeats long enough to be learnt. `barKey` is the bar: it moves
 * every time, so the chaos offset breathes from bar to bar without the pattern beneath it
 * changing. Passing one key for both — the natural thing to write — silently ties them
 * together and gives a new pattern every bar.
 */
export function realise(
  voice: VoicePattern,
  len: number,
  seed: number,
  patternKey: number,
  voiceIndex: number,
  barKey: number = patternKey,
  /** Extra density per step, for fills. Added to the threshold offset, not the strength. */
  perStep?: readonly number[],
): Hit[] {
  const s = strengths(voice, len, seed, patternKey, voiceIndex);
  const offset = voice.density + barChaos(voice, seed, barKey, voiceIndex);
  const hits: Hit[] = [];
  for (let i = 0; i < len; i++) {
    const strength = s[i] ?? 0;
    const bonus = perStep?.[i] ?? 0;
    if (strength <= 0 || strength + offset + bonus <= 1) continue;
    const accent = strength > voice.accentAt;
    const { base, accent: accentVel, ghost } = voice.vel;
    // Below the accent threshold, velocity tracks strength down towards the ghost level,
    // so a pattern thins into ghost notes instead of stopping abruptly.
    const velocity = accent ? accentVel : ghost + (base - ghost) * Math.min(1, strength / voice.accentAt);
    hits.push({ step: i, velocity, accent, strength });
  }
  return hits;
}
