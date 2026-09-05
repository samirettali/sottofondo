import { anchor } from "./env.ts";

/**
 * A 303-style monophonic bass voice.
 *
 *   osc (saw | square) → vca → lowpass → out
 *   env (ConstantSource) → gain (cents) → filter.detune
 *
 * The envelope drives **`filter.detune`, in cents**, not `filter.frequency` in hertz.
 * That is the detail that makes it sound like a 303 rather than a sawtooth arpeggiator:
 * the sweep is exponential and therefore musical, and it adds to the cutoff knob instead
 * of fighting it. Up to 8000 cents is nearly seven octaves of travel.
 *
 * The oscillator is created once and never restarted. A 303 is monophonic and always
 * running; note-offs close the amplifier rather than stopping the source. No per-note
 * allocation, no garbage.
 */

export interface ThreeOhParams {
  /** Base cutoff in Hz. */
  cutoff: number;
  /** Filter Q. A real 303 sings well past self-oscillation. */
  resonance: number;
  /** Envelope depth in cents into `filter.detune`. */
  envMod: number;
  /** Envelope decay in seconds. */
  decay: number;
}

export interface ThreeOh {
  noteOn(at: number, frequency: number, accent: boolean, slide: boolean, velocity?: number): void;
  noteOff(at: number): void;
  readonly params: ThreeOhParams;
  set(params: Partial<ThreeOhParams>, at?: number): void;
  /**
   * Stop the always-running oscillator. Without this the voice stays permanently
   * "actively processing", and neither it nor anything downstream is ever collected.
   */
  dispose(): void;
}

/** Glide time constants: a slid note takes 60 ms, a plain one still takes 2 ms. */
const SLIDE_TC = 0.06;
const STEP_TC = 0.002;

/**
 * Accent decay per note, and how far the accumulated sweep can rise.
 *
 * The accent circuit charges a 1 µF cap that does not fully discharge between notes, so
 * a *run* of accented notes sweeps progressively higher — the second and subsequent
 * response curves go further than the first. That accumulation is the squelch; a
 * per-note accent boost alone does not sound like a 303.
 */
const ACCENT_DECAY = 0.55;
const ACCENT_MAX = 3;

export function createThreeOh(
  ctx: BaseAudioContext,
  out: AudioNode,
  wave: OscillatorType = "sawtooth",
  initial: Partial<ThreeOhParams> = {},
): ThreeOh {
  const params: ThreeOhParams = {
    cutoff: 400,
    resonance: 15,
    envMod: 4000,
    decay: 0.5,
    ...initial,
  };

  const osc = ctx.createOscillator();
  osc.type = wave;
  osc.frequency.value = 55;

  const vca = ctx.createGain();
  vca.gain.value = 0;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = params.cutoff;
  filter.Q.value = params.resonance;

  // The envelope is a constant source automated between 1 and 0, scaled into cents.
  const env = ctx.createConstantSource();
  env.offset.value = 0;
  const envDepth = ctx.createGain();
  envDepth.gain.value = params.envMod;

  osc.connect(vca).connect(filter).connect(out);
  env.connect(envDepth).connect(filter.detune);
  osc.start();
  env.start();

  let accentAccum = 0;
  let lastNoteAt = -Infinity;

  return {
    params,

    set(next, at = ctx.currentTime) {
      Object.assign(params, next);
      if (next.cutoff !== undefined) {
        anchor(filter.frequency, at);
        filter.frequency.linearRampToValueAtTime(next.cutoff, at + 0.01);
      }
      if (next.resonance !== undefined) {
        anchor(filter.Q, at);
        filter.Q.linearRampToValueAtTime(next.resonance, at + 0.01);
      }
      if (next.envMod !== undefined) {
        anchor(envDepth.gain, at);
        envDepth.gain.linearRampToValueAtTime(next.envMod, at + 0.01);
      }
    },

    noteOn(at, frequency, accent, slide, velocity = 1) {
      // Accumulate the accent charge, letting it bleed away with the gap since the last
      // note. Consecutive accents stack; an accent after a rest does not.
      const gap = at - lastNoteAt;
      accentAccum = Number.isFinite(gap) ? accentAccum * Math.exp(-gap / 0.25) : 0;
      if (accent) accentAccum = Math.min(ACCENT_MAX, accentAccum * ACCENT_DECAY + 1);
      lastNoteAt = at;

      // An accent shorts the decay pot as well as opening the filter further, so an
      // accented note is louder, brighter *and* shorter.
      const depth = params.envMod * (accent ? 1 + 0.6 * accentAccum : 1);
      const decay = accent ? params.decay / 3 : params.decay;

      anchor(envDepth.gain, at, depth);
      anchor(env.offset, at, 1);
      env.offset.exponentialRampToValueAtTime(0.001, at + decay);

      // Glide is the time constant on the frequency approach. Even an unslid note gets
      // 2 ms rather than a jump, which is a large part of the character.
      filterFreqSafe(osc.frequency, at, frequency, slide ? SLIDE_TC : STEP_TC);

      // The default preserves legacy playback. New compositions can phrase every
      // step dynamically without conflating its level with the accent circuit.
      anchor(vca.gain, at, (accent ? 0.22 : 0.16) * velocity);
      vca.gain.linearRampToValueAtTime(0.1 * velocity, at + 0.2);
    },

    noteOff(at) {
      anchor(vca.gain, at);
      // A 10 ms fade, not a hard gate — a hard gate clicks.
      vca.gain.setTargetAtTime(0, at, 0.01);
    },

    dispose() {
      const now = ctx.currentTime;
      anchor(vca.gain, now);
      vca.gain.linearRampToValueAtTime(0, now + 0.02);
      osc.stop(now + 0.05);
      env.stop(now + 0.05);
      osc.onended = () => {
        vca.disconnect();
        filter.disconnect();
        envDepth.disconnect();
      };
    },
  };
}

function filterFreqSafe(p: AudioParam, at: number, target: number, tc: number): void {
  p.cancelScheduledValues(at);
  p.setValueAtTime(p.value, at);
  p.setTargetAtTime(Math.max(1, target), at, tc);
}

/** MIDI note to frequency, equal temperament, A4 = 440. */
export function midiToFrequency(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}
