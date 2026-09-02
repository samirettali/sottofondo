import { attackDecay, attackHoldRelease } from "./env.ts";
import { createPluckPool, type PluckOptions, type PluckPool } from "./pluck.ts";
import { midiToFrequency, type ThreeOh, type ThreeOhParams } from "./threeoh.ts";

/**
 * A polyphonic voice for chords, leads and anything melodic that is not the 303.
 *
 * Nodes are allocated per note and stopped on schedule. That is the shape the Web Audio
 * spec actually recommends — "source nodes are created for each note during the lifetime
 * of the AudioContext, and never explicitly removed from the graph" — and it is only a
 * leak if the `stop()` is missing, which is what `playFor` exists to prevent.
 *
 * ## Timbre
 *
 * Detuned saws through a lowpass is one instrument, and for eleven of the genres here it
 * is the right one. It is not a tuba, an accordion or a sitar, and a blind listener told
 * a Balkan brass band from a chiptune got it wrong every time while the *notes* were
 * right: the fanfare's tuba was on the beats and the horns between them, and it still
 * came back as "synth-pop | chiptune". Timbre is not decoration on top of a genre, it is
 * most of what identifies one.
 *
 * So a voice picks a synthesis strategy by name, and the strategies are built here:
 *
 *   subtractive  detuned oscillators → lowpass. The synth sound. Unchanged.
 *   fm           two operators. Bell, Rhodes, marimba, kalimba — anything struck.
 *   pluck        Karplus-Strong. Guembri, sitar, saz, guitar, upright bass.
 *   brass        saw, slow attack, a formant peak and a held level. Horns.
 *   reed         a detuned pair held flat, no filter movement. Accordion, gaida.
 *
 * This is the schema's own rule applied to sound rather than to pattern: the graph is
 * pre-built and named, and the preset picks it by tag.
 */

export type TimbreName = "subtractive" | "fm" | "pluck" | "brass" | "reed";

export interface PolyParams {
  /** Which synthesis strategy makes the sound. Defaults to `subtractive`. */
  readonly timbre: TimbreName;
  /** Oscillators per note. Two or three detuned saws is the house/synthwave sound. */
  readonly voices: number;
  /** Detune spread in cents across those oscillators. */
  readonly detune: number;
  readonly wave: OscillatorType;
  /**
   * Pulse width, 0..1, for a pulse wave instead of `wave`. The NES offers 12.5%, 25%
   * and 50%; 50% is a plain square, and the narrower ones are the thin, reedy leads.
   */
  readonly duty?: number;
  readonly attack: number;
  readonly decay: number;
  /**
   * Seconds held at full level between attack and decay. Zero is a struck instrument;
   * anything blown or bowed needs a hold, or it reads as a synth stab whatever the
   * spectrum is.
   */
  readonly sustain: number;
  readonly cutoff: number;
  readonly resonance: number;
  /** How far the filter opens above `cutoff` on each note, in cents. */
  readonly envMod: number;
  /** Output trim, so a loud strategy can be levelled against a quiet one. */
  readonly level: number;
  /** Depth in cents of a per-note vibrato. Zero is off. */
  readonly vibrato: number;
  readonly vibratoHz: number;
  /**
   * `brass`: the resonance peak the ear names the instrument by. A trumpet's sits above
   * a kilohertz; a tuba's is around 300 Hz, and giving a tuba the trumpet's peak is why
   * one sounded like a bass drum.
   */
  readonly formant: number;
  /** `fm`: modulator frequency as a ratio of the carrier. 1 is a fifth-less bell, 3.5 is metal. */
  readonly fmRatio: number;
  /** `fm`: modulation index at the attack, in multiples of the carrier frequency. */
  readonly fmIndex: number;
  /** `fm`: how fast the index falls. Short is a struck bar, long is a brassy swell. */
  readonly fmDecay: number;
  /** `pluck`: the string. */
  readonly pluck: Partial<PluckOptions>;
}

export interface Poly {
  play(at: number, midi: readonly number[], velocity: number): void;
  set(params: Partial<PolyParams>, at?: number): void;
  readonly params: PolyParams;
  /** Resolves once any worklet the timbre needs has loaded. */
  readonly ready: Promise<void>;
  dispose(): void;
}

/**
 * Fourier coefficients of a pulse wave with the given duty, DC removed.
 *
 * A pulse of width d has cosine coefficients (2 / kπ) sin(kπd). The node band-limits
 * automatically per playback frequency, so supplying many harmonics is safe; 64 is well
 * past what a NES's 4-bit DAC resolved.
 */
export function pulseCoefficients(duty: number, harmonics = 64): { real: Float32Array<ArrayBuffer>; imag: Float32Array<ArrayBuffer> } {
  const d = Math.max(0.02, Math.min(0.98, duty));
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let k = 1; k <= harmonics; k++) {
    real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
  }
  return { real, imag };
}

const pulseCache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  let byDuty = pulseCache.get(ctx);
  if (byDuty === undefined) {
    byDuty = new Map();
    pulseCache.set(ctx, byDuty);
  }
  const key = Math.round(duty * 1000) / 1000;
  let wave = byDuty.get(key);
  if (wave === undefined) {
    const { real, imag } = pulseCoefficients(key);
    wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    byDuty.set(key, wave);
  }
  return wave;
}

/**
 * Defaults per strategy, applied under the preset's own values.
 *
 * A preset that says `timbre: "brass"` and nothing else should already sound like a
 * horn: the numbers that make one are properties of the strategy, not of the genre.
 */
const TIMBRE_DEFAULTS: Record<TimbreName, Partial<PolyParams>> = {
  subtractive: {},
  // Bright, struck, and gone: the index falls faster than the amplitude, which is what
  // makes an FM pair read as a struck bar rather than a drone.
  fm: { wave: "sine", voices: 1, detune: 0, attack: 0.002, decay: 1.2, cutoff: 9000, envMod: 0, fmRatio: 3.5, fmIndex: 2.4, fmDecay: 0.18, level: 0.9 },
  pluck: { attack: 0.001, decay: 1.5, cutoff: 6000, envMod: 0, level: 1 },
  // The attack is the tell: a horn takes 40-60 ms to speak, and the filter opens over
  // the same time rather than snapping.
  brass: { wave: "sawtooth", voices: 2, detune: 7, attack: 0.05, sustain: 0.12, decay: 0.25, cutoff: 900, resonance: 1.2, envMod: 2200, vibrato: 14, vibratoHz: 5.2, formant: 1150, level: 0.85 },
  // Musette: reeds a few cents apart, held flat for as long as the bellows are moving.
  // No filter movement at all — an accordion has no filter, and a sweep is the single
  // most synthetic thing it could do. The hold is what stops it reading as an FM piano:
  // a reed does not decay while the note lasts.
  reed: { wave: "sawtooth", voices: 3, detune: 14, attack: 0.06, sustain: 0.55, decay: 0.1, cutoff: 2600, resonance: 0.7, envMod: 0, vibrato: 6, vibratoHz: 4.5, level: 0.8 },
};

export function createPoly(
  ctx: BaseAudioContext,
  out: AudioNode,
  initial: Partial<PolyParams> = {},
): Poly {
  const timbre = initial.timbre ?? "subtractive";
  const params: PolyParams = {
    timbre,
    voices: 2,
    detune: 12,
    wave: "sawtooth",
    attack: 0.005,
    decay: 0.5,
    sustain: 0,
    cutoff: 1800,
    resonance: 1,
    envMod: 1200,
    level: 1,
    vibrato: 0,
    vibratoHz: 5,
    fmRatio: 2,
    fmIndex: 2,
    fmDecay: 0.2,
    formant: 1150,
    pluck: {},
    ...TIMBRE_DEFAULTS[timbre],
    ...initial,
  };

  // One filter and one output gain for the whole voice: a per-note filter would be
  // cleaner in theory and four times the nodes in practice, and a chord's notes share a
  // timbre anyway.
  const bus = ctx.createGain();
  bus.gain.value = params.level;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = params.cutoff;
  filter.Q.value = params.resonance;

  // Brass gets a formant: the ~1.1 kHz peak in a trumpet's spectrum is what the ear
  // uses to call it a trumpet rather than a bright saw.
  let head: AudioNode = filter;
  if (params.timbre === "brass") {
    const formant = ctx.createBiquadFilter();
    formant.type = "peaking";
    formant.frequency.value = params.formant;
    formant.Q.value = 1.1;
    formant.gain.value = 7;
    filter.connect(formant).connect(out);
    head = formant;
  } else {
    filter.connect(out);
  }
  bus.connect(filter);

  // One vibrato LFO for the voice, in cents, fanned out to every note's detune.
  let lfoGain: GainNode | null = null;
  let lfo: OscillatorNode | null = null;
  if (params.vibrato > 0) {
    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = params.vibratoHz;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = params.vibrato;
    lfo.connect(lfoGain);
    lfo.start(0);
  }

  const strings: PluckPool | null =
    params.timbre === "pluck"
      ? createPluckPool(ctx, bus, { strings: 8, ...params.pluck })
      : null;

  /** How long a note occupies the graph, so its nodes can be stopped. */
  const noteSeconds = (): number => params.attack + params.sustain + params.decay + 0.05;

  return {
    params,
    ready: strings?.ready ?? Promise.resolve(),

    play(at, midi, velocity) {
      if (midi.length === 0) return;

      if (strings !== null) {
        // Strings sum in power like the oscillators below, so a strummed chord is not
        // three times the level of one note.
        const each = velocity / Math.sqrt(midi.length);
        for (const note of midi) strings.play(at, midiToFrequency(note), each);
        return;
      }

      // Divide by the square root of the count, not the count: uncorrelated voices sum
      // in power, and dividing by n makes a big chord vanish.
      const perNote = (0.32 * velocity) / Math.sqrt(midi.length * params.voices);
      const seconds = noteSeconds();

      for (const note of midi) {
        const frequency = midiToFrequency(note);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        if (params.sustain > 0) {
          attackHoldRelease(gain.gain, at, perNote, params.attack, params.sustain, params.decay);
        } else {
          attackDecay(gain.gain, at, perNote, params.attack, params.decay);
        }
        gain.connect(bus);

        if (params.timbre === "fm") {
          // Two operators: a sine carrier, and a sine modulator into its frequency. The
          // index envelope is the whole instrument — a fast one is a bell or a Rhodes,
          // a slow one is a horn.
          const carrier = ctx.createOscillator();
          carrier.type = "sine";
          carrier.frequency.value = frequency;
          const modulator = ctx.createOscillator();
          modulator.type = "sine";
          modulator.frequency.value = frequency * params.fmRatio;
          const index = ctx.createGain();
          const peak = frequency * params.fmIndex * (0.4 + 0.6 * velocity);
          index.gain.value = peak;
          index.gain.setValueAtTime(peak, at);
          index.gain.exponentialRampToValueAtTime(
            Math.max(1, peak * 0.02),
            at + Math.max(0.01, params.fmDecay),
          );
          modulator.connect(index).connect(carrier.frequency);
          if (lfoGain !== null) lfoGain.connect(carrier.detune);
          carrier.connect(gain);
          carrier.start(at);
          modulator.start(at);
          carrier.stop(at + seconds);
          modulator.stop(at + seconds);
          continue;
        }

        for (let i = 0; i < params.voices; i++) {
          const osc = ctx.createOscillator();
          if (params.duty !== undefined) osc.setPeriodicWave(pulseWave(ctx, params.duty));
          else osc.type = params.wave;
          osc.frequency.value = frequency;
          // Spread symmetrically about the note, so the chord does not drift sharp.
          const spread = params.voices === 1 ? 0 : (i / (params.voices - 1) - 0.5) * 2;
          osc.detune.value = spread * params.detune;
          if (lfoGain !== null) lfoGain.connect(osc.detune);
          osc.connect(gain);
          osc.start(at);
          osc.stop(at + seconds);
        }
      }

      // A gentle filter sweep per chord, in cents, so it is exponential and musical.
      if (params.envMod > 0) {
        filter.detune.cancelScheduledValues(at);
        if (params.timbre === "brass") {
          // A horn's brightness follows the breath: it arrives with the attack rather
          // than being there at the onset and closing.
          filter.detune.setValueAtTime(1, at);
          filter.detune.linearRampToValueAtTime(params.envMod, at + params.attack);
          filter.detune.exponentialRampToValueAtTime(1, at + params.attack + params.sustain + params.decay);
        } else {
          filter.detune.setValueAtTime(params.envMod, at);
          filter.detune.exponentialRampToValueAtTime(1, at + params.decay);
        }
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
      if (next.pluck !== undefined) strings?.set(next.pluck, at);
    },

    dispose() {
      strings?.dispose();
      lfo?.stop();
      lfo?.disconnect();
      lfoGain?.disconnect();
      bus.disconnect();
      filter.disconnect();
      if (head !== filter) head.disconnect();
    },
  };
}

/**
 * A bass voice that is not a 303.
 *
 * An upright bass, a guembri and a tuba are bass instruments the acid line cannot
 * impersonate, and the engine already has a monophonic bass slot with a gate. This wraps
 * a `Poly` in that slot's interface so a preset can put any timbre there and everything
 * upstream — the pattern, the slides, the energy curve's grip on the cutoff — carries on
 * addressing it exactly as before.
 *
 * `noteOff` does nothing on purpose: a plucked or blown bass ends when its own envelope
 * ends, and cutting it at the next rest is the sound of a gate, not of a player.
 */
export function createPolyBass(
  ctx: BaseAudioContext,
  out: AudioNode,
  initial: Partial<PolyParams> = {},
): ThreeOh & { readonly ready: Promise<void> } {
  const poly = createPoly(ctx, out, initial);
  const params: ThreeOhParams = {
    cutoff: poly.params.cutoff,
    resonance: poly.params.resonance,
    envMod: poly.params.envMod,
    decay: poly.params.decay,
  };

  return {
    params,
    ready: poly.ready,

    noteOn(at, frequency, accent) {
      const midi = 69 + 12 * Math.log2(Math.max(1, frequency) / 440);
      poly.play(at, [midi], accent ? 1 : 0.72);
    },

    noteOff() {},

    set(next, at) {
      Object.assign(params, next);
      poly.set(next, at);
    },

    dispose() {
      poly.dispose();
    },
  };
}
