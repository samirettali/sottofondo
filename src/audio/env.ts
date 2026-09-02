import { mulberry32 } from "../core/rng.ts";

/**
 * Envelope and node-lifetime helpers.
 *
 * Web Audio's `AudioParam` automation has a handful of traps that produce every click,
 * stuck note and leak people hit, and they are all avoidable in one place:
 *
 *   - a ramp starts from the *previous scheduled event*, so an unanchored ramp begins
 *     from wherever the timeline happened to be; always `setValueAtTime` first
 *   - `exponentialRampToValueAtTime` cannot reach or start from zero
 *   - `cancelScheduledValues` removes events but does not set a value
 *   - assigning `.value` on an automated param is `setValueAtTime(v, 0)` and fights the
 *     timeline
 *   - a source with no `stop()` is "actively processing" forever and is never collected
 */

/** The floor an exponential ramp aims at instead of zero. −80 dB, inaudible. */
const EPS = 0.0001;

/** Anchor a param at a value so the next ramp starts from a known place. */
export function anchor(p: AudioParam, at: number, value = p.value): void {
  p.cancelScheduledValues(at);
  p.setValueAtTime(value, at);
}

/**
 * Percussive envelope: instant attack, exponential decay to silence.
 *
 * Exponential rather than linear because loudness is perceived logarithmically — a
 * linear decay sounds like it stops rather than fades.
 */
export function decayTo(p: AudioParam, at: number, peak: number, seconds: number): void {
  anchor(p, at, Math.max(EPS, peak));
  p.exponentialRampToValueAtTime(EPS, at + Math.max(0.001, seconds));
  // The exponential never reaches zero, so land it explicitly or the tail sits at the
  // floor forever.
  p.setValueAtTime(0, at + Math.max(0.001, seconds));
}

/** Attack-decay envelope with a real (if short) attack, for anything that would click. */
export function attackDecay(
  p: AudioParam,
  at: number,
  peak: number,
  attack: number,
  decay: number,
): void {
  anchor(p, at, 0);
  p.linearRampToValueAtTime(peak, at + attack);
  p.exponentialRampToValueAtTime(EPS, at + attack + decay);
  p.setValueAtTime(0, at + attack + decay);
}

/**
 * Attack, hold, release: the shape of anything blown or bowed.
 *
 * A horn and an accordion hold their level for as long as the player keeps going, so a
 * percussive decay is the wrong envelope for them however the timbre is made — it is
 * half of why a sustained instrument synthesised with attack-decay reads as a synth.
 */
export function attackHoldRelease(
  p: AudioParam,
  at: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): void {
  anchor(p, at, 0);
  p.linearRampToValueAtTime(peak, at + attack);
  p.setValueAtTime(peak, at + attack + hold);
  p.exponentialRampToValueAtTime(EPS, at + attack + hold + Math.max(0.001, release));
  p.setValueAtTime(0, at + attack + hold + Math.max(0.001, release));
}

/** Exponential pitch sweep, the shape every synthesised drum is built on. */
export function pitchDrop(
  p: AudioParam,
  at: number,
  from: number,
  to: number,
  seconds: number,
): void {
  anchor(p, at, Math.max(EPS, from));
  p.exponentialRampToValueAtTime(Math.max(EPS, to), at + Math.max(0.001, seconds));
}

/**
 * Start a source and guarantee it stops.
 *
 * The single commonest Web Audio leak is a source with no `stop()`: it counts as
 * actively processing forever, so nothing downstream of it is ever collected either.
 * That is what a generative toy which grinds to a halt after an hour has.
 */
export function playFor(node: AudioScheduledSourceNode, at: number, seconds: number): void {
  node.start(at);
  node.stop(at + Math.max(0.002, seconds));
}

/**
 * A buffer of white noise.
 *
 * Filled from a seeded generator rather than `Math.random`, so an offline render is
 * bit-identical to live playback. It also means the same noise burst backs every hit,
 * which is what real drum machines do — the 909's noise source is a shift register, not
 * a fresh sample every time.
 */
export function noiseBuffer(ctx: BaseAudioContext, seconds = 2, seed = 0x5eed): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = mulberry32(seed);
  for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
  return buffer;
}

/**
 * A looping noise source started at a given offset into the shared buffer.
 *
 * Reading from a different place on each hit avoids the phasiness of replaying the
 * identical burst every time, without allocating a new buffer per note.
 */
export function playNoise(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  at: number,
  seconds: number,
  offset = 0,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopEnd = buffer.duration;
  src.start(at, offset % buffer.duration);
  src.stop(at + Math.max(0.002, seconds));
  return src;
}
