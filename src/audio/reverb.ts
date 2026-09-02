import { anchor } from "./env.ts";

/**
 * A feedback-delay-network reverb in an AudioWorklet.
 *
 * Why not a ConvolverNode: it cannot modulate anything. Changing the room means rebuilding
 * the buffer and re-partitioning the FFT, which is a glitch rather than a sweep, and a
 * generative piece wants the room to move with the energy curve. Why a worklet: a
 * Schroeder or FDN topology needs delays of a few milliseconds inside feedback loops, and
 * native nodes floor a cycle's delay at one render quantum — 2.7 ms at 48 kHz — with
 * anything shorter silently muted.
 *
 * Topology: two short allpasses for input diffusion, then eight delay lines with a
 * Householder feedback matrix and a one-pole lowpass in each loop. Householder rather than
 * Hadamard in the loop, since full mixing there locks the lines into one resonance.
 * Per-line feedback gain comes from the wanted RT60, so the network decays evenly whatever
 * the line lengths.
 *
 * The processor source is inlined as a blob so the build stays a single file. It is plain
 * JS on purpose: worklet code runs on the audio thread and gets no bundler help.
 */

export interface ReverbOptions {
  /** Room size, 0..1. Scales the delay lengths; fixed per instance. */
  readonly size: number;
  /** RT60 in seconds. */
  readonly decay: number;
  /** High-frequency damping, 0..1. Higher is darker. */
  readonly damp: number;
  readonly wet: number;
  readonly preDelayMs?: number;
  /** Lane names sent to the reverb. */
  readonly sends: readonly string[];
}

export interface Reverb {
  readonly input: GainNode;
  /** Resolves once the worklet is running; until then the send is silent. */
  readonly ready: Promise<void>;
  set(options: Partial<Pick<ReverbOptions, "decay" | "damp" | "wet">>, at?: number): void;
  dispose(): void;
}

const PROCESSOR = String.raw`
class Fdn extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "decay", defaultValue: 2, minValue: 0.1, maxValue: 20, automationRate: "k-rate" },
      { name: "damp", defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }
  constructor(options) {
    super();
    const size = options.processorOptions.size;
    const pre = options.processorOptions.preDelay;
    const sr = sampleRate;
    const ms = (x) => Math.max(1, Math.round((x * sr) / 1000));
    // Mutually prime-ish lengths so no two lines share a period.
    const base = [37, 47, 59, 67, 79, 89, 101, 113];
    const scale = 0.5 + 1.3 * size;
    this.lines = base.map((b) => ({ buf: new Float32Array(ms(b * scale)), i: 0, lp: 0 }));
    this.aps = [ms(5.1), ms(11.7)].map((n) => ({ buf: new Float32Array(n), i: 0 }));
    this.pre = { buf: new Float32Array(Math.max(1, ms(pre))), i: 0 };
    this.n = this.lines.length;
  }
  allpass(ap, x) {
    const d = ap.buf[ap.i];
    const y = -0.62 * x + d;
    ap.buf[ap.i] = x + 0.62 * y;
    ap.i = (ap.i + 1) % ap.buf.length;
    return y;
  }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const left = out[0], right = out[1] || out[0];
    const decay = params.decay[0], damp = params.damp[0];
    const n = this.n;
    const gains = this.lines.map((l) => Math.pow(10, (-3 * l.buf.length) / (decay * sampleRate)));
    const dampCoef = 0.15 + 0.8 * damp;
    const reads = new Float32Array(n);
    for (let s = 0; s < left.length; s++) {
      let x = 0;
      if (input && input.length) {
        for (let c = 0; c < input.length; c++) x += input[c][s];
        x /= input.length;
      }
      // Pre-delay, then diffusion.
      const p = this.pre;
      const delayed = p.buf[p.i];
      p.buf[p.i] = x;
      p.i = (p.i + 1) % p.buf.length;
      x = this.allpass(this.aps[1], this.allpass(this.aps[0], delayed));

      let sum = 0;
      for (let k = 0; k < n; k++) {
        const l = this.lines[k];
        reads[k] = l.buf[l.i];
        sum += reads[k];
      }
      const house = (2 / n) * sum;
      let l0 = 0, r0 = 0;
      for (let k = 0; k < n; k++) {
        const l = this.lines[k];
        // Householder: reflect the read vector about the all-ones direction.
        let fb = reads[k] - house;
        // One-pole lowpass in the loop: each pass darkens.
        l.lp += dampCoef * (fb - l.lp);
        fb = l.lp * gains[k];
        l.buf[l.i] = x + fb;
        l.i = (l.i + 1) % l.buf.length;
        if (k % 2 === 0) l0 += reads[k]; else r0 += reads[k];
      }
      left[s] = l0 * 0.35;
      right[s] = r0 * 0.35;
    }
    return true;
  }
}
registerProcessor("banger-fdn", Fdn);
`;

let moduleUrl: string | null = null;
const loaded = new WeakSet<BaseAudioContext>();

async function ensureModule(ctx: BaseAudioContext): Promise<void> {
  if (loaded.has(ctx)) return;
  moduleUrl ??= URL.createObjectURL(new Blob([PROCESSOR], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(moduleUrl);
  loaded.add(ctx);
}

export function createReverb(ctx: BaseAudioContext, out: AudioNode, options: ReverbOptions): Reverb {
  const input = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = options.wet;
  wet.connect(out);

  let node: AudioWorkletNode | null = null;
  let disposed = false;

  const ready = ensureModule(ctx).then(() => {
    if (disposed) return;
    node = new AudioWorkletNode(ctx, "banger-fdn", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: {
        size: Math.max(0, Math.min(1, options.size)),
        preDelay: options.preDelayMs ?? 20,
      },
    });
    const decay = node.parameters.get("decay");
    const damp = node.parameters.get("damp");
    if (decay) decay.value = options.decay;
    if (damp) damp.value = options.damp;
    input.connect(node).connect(wet);
  });

  return {
    input,
    ready,
    set(next, at = ctx.currentTime) {
      if (next.wet !== undefined) {
        anchor(wet.gain, at);
        wet.gain.linearRampToValueAtTime(next.wet, at + 0.05);
      }
      if (node === null) return;
      const decay = node.parameters.get("decay");
      const damp = node.parameters.get("damp");
      if (next.decay !== undefined && decay) decay.setValueAtTime(next.decay, at);
      if (next.damp !== undefined && damp) damp.setValueAtTime(next.damp, at);
    },
    dispose() {
      disposed = true;
      input.disconnect();
      wet.disconnect();
      node?.disconnect();
    },
  };
}
