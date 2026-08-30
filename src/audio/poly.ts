import { attackDecay } from "./env.ts";
import { midiToFrequency } from "./threeoh.ts";

/**
 * A polyphonic voice for chords: stabs and pads.
 *
 * Nodes are allocated per note and stopped on schedule. That is the shape the Web Audio
 * spec actually recommends — "source nodes are created for each note during the lifetime
 * of the AudioContext, and never explicitly removed from the graph" — and it is only a
 * leak if the `stop()` is missing, which is what `playFor` exists to prevent.
 */

export interface PolyParams {
  /** Oscillators per note. Two or three detuned saws is the house/synthwave sound. */
  readonly voices: number;
  /** Detune spread in cents across those oscillators. */
  readonly detune: number;
  readonly wave: OscillatorType;
  readonly attack: number;
  readonly decay: number;
  readonly cutoff: number;
  readonly resonance: number;
  /** How far the filter opens above `cutoff` on each note, in cents. */
  readonly envMod: number;
}

export interface Poly {
  play(at: number, midi: readonly number[], velocity: number): void;
  set(params: Partial<PolyParams>, at?: number): void;
  readonly params: PolyParams;
  dispose(): void;
}

export function createPoly(
  ctx: BaseAudioContext,
  out: AudioNode,
  initial: Partial<PolyParams> = {},
): Poly {
  const params: PolyParams = {
    voices: 2,
    detune: 12,
    wave: "sawtooth",
    attack: 0.005,
    decay: 0.5,
    cutoff: 1800,
    resonance: 1,
    envMod: 1200,
    ...initial,
  };

  // One filter and one output gain for the whole voice: a per-note filter would be
  // cleaner in theory and four times the nodes in practice, and a chord's notes share a
  // timbre anyway.
  const bus = ctx.createGain();
  bus.gain.value = 1;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = params.cutoff;
  filter.Q.value = params.resonance;
  bus.connect(filter).connect(out);

  return {
    params,

    play(at, midi, velocity) {
      if (midi.length === 0) return;
      // Divide by the square root of the count, not the count: uncorrelated voices sum
      // in power, and dividing by n makes a big chord vanish.
      const perNote = (0.32 * velocity) / Math.sqrt(midi.length * params.voices);

      for (const note of midi) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        attackDecay(gain.gain, at, perNote, params.attack, params.decay);
        gain.connect(bus);

        for (let i = 0; i < params.voices; i++) {
          const osc = ctx.createOscillator();
          osc.type = params.wave;
          osc.frequency.value = midiToFrequency(note);
          // Spread symmetrically about the note, so the chord does not drift sharp.
          const spread = params.voices === 1 ? 0 : (i / (params.voices - 1) - 0.5) * 2;
          osc.detune.value = spread * params.detune;
          osc.connect(gain);
          osc.start(at);
          osc.stop(at + params.attack + params.decay + 0.05);
        }
      }

      // A gentle filter sweep per chord, in cents, so it is exponential and musical.
      if (params.envMod > 0) {
        filter.detune.cancelScheduledValues(at);
        filter.detune.setValueAtTime(params.envMod, at);
        filter.detune.exponentialRampToValueAtTime(1, at + params.decay);
      }
    },

    set(next, at = ctx.currentTime) {
      Object.assign(params, next);
      if (next.cutoff !== undefined) {
        filter.frequency.cancelScheduledValues(at);
        filter.frequency.setValueAtTime(filter.frequency.value, at);
        filter.frequency.linearRampToValueAtTime(next.cutoff, at + 0.02);
      }
      if (next.resonance !== undefined) {
        filter.Q.cancelScheduledValues(at);
        filter.Q.setValueAtTime(filter.Q.value, at);
        filter.Q.linearRampToValueAtTime(next.resonance, at + 0.02);
      }
    },

    dispose() {
      bus.disconnect();
      filter.disconnect();
    },
  };
}
