import { h32 } from "../core/rng.ts";
import type { KickDesign } from "../composer/character.ts";

export interface KickVoice { dispose(): void; }
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
function transient(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noises.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .04), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (h32(0x303909, i) / 0x80000000 - 1);
    noises.set(ctx, buffer);
  }
  return buffer;
}

/** A local pitched body and short noise transient. Every source has a scheduled
 * end and an explicit disposal path, including sources stopped before onset. */
export function playCharacterKick(ctx: BaseAudioContext, destination: AudioNode, time: number, design: KickDesign,
  velocity: number, ended: () => void): KickVoice {
  const body = ctx.createOscillator(), envelope = ctx.createGain(), click = ctx.createBufferSource();
  const clickFilter = ctx.createBiquadFilter(), clickEnvelope = ctx.createGain(), shaper = ctx.createWaveShaper(), output = ctx.createGain();
  const nodes = [body, envelope, click, clickFilter, clickEnvelope, shaper, output];
  const end = time + design.decay + .01;
  let disposed = false;
  const voice: KickVoice = { dispose() {
    if (disposed) return; disposed = true;
    body.onended = null; body.stop(); click.stop(); nodes.forEach(node => node.disconnect()); ended();
  } };
  const hz = 440 * 2 ** ((design.midi - 69) / 12);
  body.type = design.model === "driven" ? "triangle" : "sine";
  body.frequency.setValueAtTime(hz * design.sweep, time);
  body.frequency.exponentialRampToValueAtTime(hz, time + design.fall);
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(1, time + .002);
  envelope.gain.exponentialRampToValueAtTime(.001, time + design.decay);
  body.connect(envelope).connect(shaper);
  click.buffer = transient(ctx); clickFilter.type = "highpass"; clickFilter.frequency.value = design.model === "round" ? 1100 : 2800;
  clickEnvelope.gain.setValueAtTime(design.click, time);
  clickEnvelope.gain.exponentialRampToValueAtTime(.00001, time + .02);
  click.connect(clickFilter).connect(clickEnvelope).connect(shaper);
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((2 * i / (curve.length - 1) - 1) * design.drive) / Math.tanh(design.drive);
  shaper.curve = curve; shaper.oversample = "2x";
  output.gain.value = design.gain * velocity;
  shaper.connect(output).connect(destination);
  body.onended = () => voice.dispose();
  body.start(time); body.stop(end); click.start(time); click.stop(time + .035);
  return voice;
}
