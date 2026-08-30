import { anchor } from "./env.ts";

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
