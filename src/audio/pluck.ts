/**
 * A plucked string, by Karplus-Strong.
 *
 * A delay line of one period, refilled with noise on the pluck and fed back through a
 * one-pole lowpass: the noise is a spectrum of every partial at once, and the filter in
 * the loop takes the high ones out faster than the low ones, which is exactly what a
 * string does. Twenty lines of arithmetic for the one timbre subtractive synthesis
 * cannot fake — a guembri, a sitar, an upright bass and a nylon guitar are all this
 * algorithm with a different loop gain.
 *
 * It has to be a worklet. A feedback delay built from `DelayNode` cannot go below one
 * render quantum — 2.67 ms at 48 kHz, so 375 Hz — and a string an octave above that is
 * most of the point.
 *
 * Scheduling is by `AudioParam`, never by `postMessage`: a message arrives whenever the
 * main thread gets round to it, which in an offline render is *before* the first sample.
 * `trigger` is an a-rate param, so `setValueAtTime(velocity, at)` plucks the string at
 * that sample in both a live and a rendered context.
 */

const PROCESSOR = `
class Pluck extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // Rising edge plucks; the value is the velocity.
      { name: "trigger", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "a-rate" },
      { name: "frequency", defaultValue: 220, minValue: 20, maxValue: 8000, automationRate: "a-rate" },
      // Loop damping, 0..1: how fast the partials above the fundamental die.
      { name: "damp", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      // Seconds to -60 dB.
      { name: "decay", defaultValue: 2, minValue: 0.05, maxValue: 20, automationRate: "k-rate" },
      // Excitation brightness, 0..1: a fingertip against a plectrum.
      { name: "colour", defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    // Tells the main thread this processor exists. Constructing the node is not enough:
    // instantiation on the audio thread is asynchronous, and a trigger scheduled before
    // it happens is simply never seen.
    this.port.postMessage("ready");
    this.size = 8192;
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.delay = 100;
    this.lp = 0;
    this.gain = 0;
    this.prevTrigger = 0;
    // A cheap deterministic noise source. Math.random would do, but the excitation is
    // audible and a fixed sequence keeps two renders of one seed identical.
    this.rng = 22222;
  }

  noise() {
    this.rng = (this.rng * 1664525 + 1013904223) >>> 0;
    return (this.rng / 2147483648) - 1;
  }

  process(_inputs, outputs, params) {
    const out = outputs[0][0];
    if (out === undefined) return true;
    const trig = params.trigger;
    const freq = params.frequency;
    const damp = params.damp[0];
    const decay = params.decay[0];
    const colour = params.colour[0];

    for (let i = 0; i < out.length; i++) {
      const t = trig.length > 1 ? trig[i] : trig[0];
      if (t > 0 && this.prevTrigger <= 0) {
        const f = freq.length > 1 ? freq[i] : freq[0];
        this.delay = Math.max(2, Math.min(this.size - 2, sampleRate / f));
        // Refill one period with noise, lowpassed towards the pluck colour: a soft
        // finger is a dull excitation, a plectrum a bright one.
        const a = 0.05 + 0.95 * colour;
        let s = 0;
        const n = Math.ceil(this.delay);
        for (let k = 0; k < n; k++) {
          s += a * (this.noise() - s);
          let idx = this.w - n + k;
          idx = ((idx % this.size) + this.size) % this.size;
          this.buf[idx] = s * t;
        }
        this.lp = 0;
        // Loop gain that reaches -60 dB in \`decay\` seconds: one pass round the loop
        // takes 1/f, so g^(f * decay) = 1e-3.
        this.gain = Math.pow(0.001, 1 / (f * decay));
      }
      this.prevTrigger = t;

      const read = this.w - this.delay;
      const i0 = ((Math.floor(read) % this.size) + this.size) % this.size;
      const i1 = (i0 + 1) % this.size;
      const frac = read - Math.floor(read);
      const y = this.buf[i0] * (1 - frac) + this.buf[i1] * frac;

      this.lp += (1 - damp) * (y - this.lp);
      this.buf[this.w] = this.lp * this.gain;
      this.w = (this.w + 1) % this.size;
      out[i] = y;
    }
    return true;
  }
}
registerProcessor("banger-pluck", Pluck);
`;

let moduleUrl: string | null = null;
const loaded = new WeakSet<BaseAudioContext>();

export async function ensurePluckModule(ctx: BaseAudioContext): Promise<void> {
  if (loaded.has(ctx)) return;
  moduleUrl ??= URL.createObjectURL(new Blob([PROCESSOR], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(moduleUrl);
  loaded.add(ctx);
}

export interface PluckOptions {
  /** Loop damping, 0..1. Low is a bright steel string, high is a muted one. */
  readonly damp: number;
  /** Seconds to -60 dB. */
  readonly decay: number;
  /** Excitation brightness, 0..1. */
  readonly colour: number;
  /** Simultaneous strings. A chord needs one per note. */
  readonly strings: number;
}

export interface PluckPool {
  /** Sounds one string at `at`. */
  play(at: number, frequency: number, velocity: number): void;
  set(next: Partial<PluckOptions>, at?: number): void;
  readonly ready: Promise<void>;
  dispose(): void;
}

/**
 * A round-robin bank of strings.
 *
 * One node per string rather than one polyphonic node, because the trigger is an
 * `AudioParam` and a param belongs to a node: this is what buys sample-accurate
 * scheduling in an offline render.
 */
export function createPluckPool(
  ctx: BaseAudioContext,
  out: AudioNode,
  options: Partial<PluckOptions> = {},
): PluckPool {
  const opts: PluckOptions = { damp: 0.5, decay: 2, colour: 0.6, strings: 6, ...options };
  const nodes: AudioWorkletNode[] = [];
  const level = ctx.createGain();
  level.gain.value = 0.5;
  level.connect(out);
  let next = 0;
  let disposed = false;

  const ready = ensurePluckModule(ctx).then(async () => {
    if (disposed) return;
    const alive: Promise<void>[] = [];
    for (let i = 0; i < opts.strings; i++) {
      const node = new AudioWorkletNode(ctx, "banger-pluck", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.parameters.get("damp")!.value = opts.damp;
      node.parameters.get("decay")!.value = opts.decay;
      node.parameters.get("colour")!.value = opts.colour;
      node.connect(level);
      nodes.push(node);
      // Wait for the processor to say it exists. Without this an offline render is not
      // reproducible: whether the first notes are heard at all depends on whether the
      // audio thread got round to constructing the processor before those samples were
      // rendered, and two renders of one seed came out different.
      alive.push(
        new Promise<void>((resolve) => {
          node.port.onmessage = () => resolve();
        }),
      );
    }
    await Promise.all(alive);
  });

  return {
    ready,

    play(at, frequency, velocity) {
      if (nodes.length === 0) return;
      const node = nodes[next % nodes.length]!;
      next++;
      const trigger = node.parameters.get("trigger")!;
      const freq = node.parameters.get("frequency")!;
      freq.setValueAtTime(Math.max(20, Math.min(8000, frequency)), at);
      trigger.setValueAtTime(Math.max(0.02, Math.min(1, velocity)), at);
      // Back to zero so the next pluck is a rising edge again. One millisecond is long
      // enough to be seen by the a-rate reader and short enough for a fast run.
      trigger.setValueAtTime(0, at + 0.001);
    },

    set(nextOpts, at = ctx.currentTime) {
      Object.assign(opts, nextOpts);
      for (const node of nodes) {
        if (nextOpts.damp !== undefined) node.parameters.get("damp")!.setValueAtTime(nextOpts.damp, at);
        if (nextOpts.decay !== undefined) node.parameters.get("decay")!.setValueAtTime(nextOpts.decay, at);
        if (nextOpts.colour !== undefined) node.parameters.get("colour")!.setValueAtTime(nextOpts.colour, at);
      }
    },

    dispose() {
      disposed = true;
      for (const node of nodes) node.disconnect();
      nodes.length = 0;
      level.disconnect();
    },
  };
}
