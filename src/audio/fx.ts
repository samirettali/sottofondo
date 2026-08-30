import { anchor, noiseBuffer } from "./env.ts";

/**
 * Effects.
 *
 * A note on what is deliberately absent: there is no `ConvolverNode` reverb. A convolver
 * cannot modulate its parameters at all — changing the room means rebuilding the buffer,
 * renormalising and re-partitioning the FFT, which is a glitch rather than a sweep. For
 * a toy where room size should move under an energy curve, that disqualifies it. A
 * feedback-delay network in an AudioWorklet is the eventual answer; until then the
 * delay below carries the space.
 */

/** Delay time as a musical division. Dotted eighth is the acid and dub default. */
export type NoteValue = "1/16" | "1/8T" | "1/8" | "3/16" | "1/4" | "1/2";

const DIVISIONS: Record<NoteValue, number> = {
  "1/16": 0.25,
  "1/8T": 1 / 3,
  "1/8": 0.5,
  "3/16": 0.75,
  "1/4": 1,
  "1/2": 2,
};

export function delaySeconds(noteValue: NoteValue, bpm: number): number {
  return (DIVISIONS[noteValue] * 60) / bpm;
}

export interface DelayOptions {
  noteValue: NoteValue;
  feedback: number;
  wet: number;
  /** Lowpass inside the feedback path. Each repeat darkens — the dub delay. */
  feedbackLowpassHz?: number;
}

export interface Delay {
  /** Send things here. Dry passes through untouched. */
  readonly input: GainNode;
  setTempo(bpm: number, at?: number): void;
  set(options: Partial<DelayOptions>, at?: number): void;
}

export function createDelay(
  ctx: BaseAudioContext,
  out: AudioNode,
  options: DelayOptions,
  bpm: number,
): Delay {
  const opts: DelayOptions = { ...options };

  const input = ctx.createGain();
  const delay = ctx.createDelay(2);
  delay.delayTime.value = delaySeconds(opts.noteValue, bpm);

  const feedback = ctx.createGain();
  // Never exactly 1: a delay in a cycle counts as actively processing until its output
  // falls below 2^-126, so unity feedback is a node that never releases.
  feedback.gain.value = Math.min(0.95, opts.feedback);

  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = opts.feedbackLowpassHz ?? 20000;

  const wet = ctx.createGain();
  wet.gain.value = opts.wet;

  // Cycles are legal only because a DelayNode is in them; a feedback loop without one is
  // silently muted, with no error and no warning.
  delay.connect(damp).connect(feedback).connect(delay);
  input.connect(delay);
  delay.connect(wet).connect(out);
  input.connect(out);

  return {
    input,

    setTempo(newBpm, at = ctx.currentTime) {
      // delayTime is a-rate, so moving it resamples the buffer and shifts pitch. A short
      // ramp turns that from a glitch into a tape-like slur, which is the right sound
      // when a generative tempo drifts.
      anchor(delay.delayTime, at);
      delay.delayTime.linearRampToValueAtTime(delaySeconds(opts.noteValue, newBpm), at + 0.05);
    },

    set(next, at = ctx.currentTime) {
      Object.assign(opts, next);
      if (next.feedback !== undefined) {
        anchor(feedback.gain, at);
        feedback.gain.linearRampToValueAtTime(Math.min(0.95, next.feedback), at + 0.02);
      }
      if (next.wet !== undefined) {
        anchor(wet.gain, at);
        wet.gain.linearRampToValueAtTime(next.wet, at + 0.02);
      }
      if (next.feedbackLowpassHz !== undefined) {
        anchor(damp.frequency, at);
        damp.frequency.linearRampToValueAtTime(next.feedbackLowpassHz, at + 0.02);
      }
    },
  };
}

export interface Ducker {
  readonly output: GainNode;
  /** Call at every kick time. */
  duck(at: number): void;
  set(depthDb: number, releaseMs: number): void;
}

/**
 * Sidechain compression, as a scheduled envelope rather than a compressor.
 *
 * The spec says outright that side-chaining is not supported, and triggering the envelope
 * from the kick's scheduled time is better anyway: it is exactly repeatable, it costs no
 * detection, and the release shape — exponential, not linear — is what makes it read as a
 * compressor rather than a gate.
 */
export function createDucker(
  ctx: BaseAudioContext,
  out: AudioNode,
  depthDb: number,
  releaseMs: number,
): Ducker {
  const output = ctx.createGain();
  output.connect(out);
  let depth = dbToDepth(depthDb);
  let release = releaseMs / 1000;

  return {
    output,
    duck(at) {
      if (depth <= 0) return;
      const g = output.gain;
      anchor(g, at, 1);
      g.linearRampToValueAtTime(1 - depth, at + 0.005);
      g.setTargetAtTime(1, at + 0.02, release / 3);
    },
    set(newDepthDb, newReleaseMs) {
      depth = dbToDepth(newDepthDb);
      release = newReleaseMs / 1000;
    },
  };
}

function dbToDepth(db: number): number {
  if (db <= 0) return 0;
  return Math.min(0.95, 1 - 10 ** (-db / 20));
}

/**
 * A staircase transfer curve: bit-depth reduction without an AudioWorklet.
 *
 * Quantising the *amplitude* is most of what "lo-fi" means, and a WaveShaper does it
 * exactly — the node maps input to a sampled curve, so a curve that is already a
 * staircase quantises whatever passes through. Sample-rate reduction is the other half
 * and genuinely does need a worklet, since it is a function of time rather than of
 * amplitude; it is not here yet.
 */
export function bitCrushCurve(bits: number, n = 4096): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(n);
  const levels = Math.max(2, 2 ** Math.max(1, bits));
  const step = 2 / levels;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.max(-1, Math.min(1, Math.round(x / step) * step));
  }
  return curve;
}

export interface EnergyFilterOptions {
  readonly type: "lowpass" | "highpass";
  /**
   * Cutoff at energy 0 and at energy 1, in Hz. `hi` may be *below* `lo`: a highpass that
   * gets out of the way as the energy rises descends, and that is the usual shape for
   * one.
   */
  readonly lo: number;
  readonly hi: number;
  readonly resonance?: number;
}

export interface EnergyFilter {
  readonly input: GainNode;
  /** Move the cutoff to match an energy in [0, 1]. */
  setEnergy(energy: number, at?: number): void;
  dispose(): void;
}

/**
 * A filter on the whole mix, driven by the energy curve.
 *
 * The rest of what a build sounds like. Lanes arriving and density rising account for
 * most of it, but not the sense of a lid coming off — that is the filter, and it has to
 * move with the same curve or the two read as unrelated.
 *
 * The sweep is exponential because pitch and cutoff are heard logarithmically; a linear
 * cutoff ramp sounds wrong at both ends.
 */
export function createEnergyFilter(
  ctx: BaseAudioContext,
  out: AudioNode,
  options: EnergyFilterOptions | undefined,
): EnergyFilter {
  const input = ctx.createGain();
  if (options === undefined) {
    input.connect(out);
    return {
      input,
      setEnergy() {},
      dispose() {
        input.disconnect();
      },
    };
  }

  const filter = ctx.createBiquadFilter();
  filter.type = options.type;
  filter.frequency.value = options.lo;
  filter.Q.value = options.resonance ?? 0.7;
  input.connect(filter).connect(out);

  return {
    input,
    setEnergy(energy, at = ctx.currentTime) {
      const t = Math.max(0, Math.min(1, energy));
      const target = options.lo * (options.hi / options.lo) ** t;
      anchor(filter.frequency, at);
      // Ramp over a beat rather than stepping: the curve moves per bar, and a step at a
      // bar line is audible as a click in the filter.
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, target), at + 0.25);
    },
    dispose() {
      input.disconnect();
      filter.disconnect();
    },
  };
}

export interface TextureOptions {
  /** Continuous vinyl noise level in dBFS. Around −28 is audible but not intrusive. */
  readonly vinylDb?: number;
  /** Tape wow: rate in Hz and depth in cents. */
  readonly wowHz?: number;
  readonly wowCents?: number;
  /** Amplitude quantisation. 12 is gentle, 8 is obvious. */
  readonly bitDepth?: number;
}

export interface Texture {
  /** Route the mix through here. */
  readonly input: GainNode;
  dispose(): void;
}

/**
 * The lo-fi chain: wow, then bit reduction, plus a bed of vinyl noise.
 *
 * Wow is a short delay whose time is modulated by a slow LFO. `delayTime` is a-rate and
 * moving it resamples the buffer, so it pitch-shifts — which is a nuisance everywhere
 * else and is exactly the effect wanted here.
 */
export function createTexture(
  ctx: BaseAudioContext,
  out: AudioNode,
  options: TextureOptions,
): Texture {
  const input = ctx.createGain();
  let tail: AudioNode = input;
  const disposers: (() => void)[] = [];

  const wowHz = options.wowHz ?? 0;
  const wowCents = options.wowCents ?? 0;
  if (wowHz > 0 && wowCents > 0) {
    const delay = ctx.createDelay(0.05);
    const base = 0.012;
    delay.delayTime.value = base;
    // A cent is 1/1200 of an octave; over a 12 ms delay the depth that produces the
    // wanted detune is small, so this is deliberately gentle.
    const depth = base * (2 ** (wowCents / 1200) - 1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = wowHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain).connect(delay.delayTime);
    lfo.start();
    tail.connect(delay);
    tail = delay;
    disposers.push(() => {
      lfo.stop();
      lfo.disconnect();
      lfoGain.disconnect();
      delay.disconnect();
    });
  }

  const bitDepth = options.bitDepth ?? 0;
  if (bitDepth > 0 && bitDepth < 16) {
    const crusher = ctx.createWaveShaper();
    crusher.curve = bitCrushCurve(bitDepth);
    tail.connect(crusher);
    tail = crusher;
    disposers.push(() => crusher.disconnect());
  }

  tail.connect(out);

  const vinylDb = options.vinylDb ?? 0;
  if (vinylDb < 0) {
    const buffer = noiseBuffer(ctx, 4, 0x71ce);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    // Band-limited: unfiltered white noise sounds like a broken tweeter, not a record.
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 400;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    const gain = ctx.createGain();
    gain.gain.value = 10 ** (vinylDb / 20);
    source.connect(hp).connect(lp).connect(gain).connect(out);
    source.start();
    disposers.push(() => {
      source.stop();
      source.disconnect();
      hp.disconnect();
      lp.disconnect();
      gain.disconnect();
    });
  }

  return {
    input,
    dispose() {
      input.disconnect();
      for (const d of disposers) d();
    },
  };
}
