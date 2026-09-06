/** Preview-only mono instrument. Both articulation takes share this graph and
 * authored controls; this is an audible experiment, not a circuit emulation. */
export type AcidVoice = "current" | "mono-step-1" | "mono-link-1";
export type AcidDrive = "clean" | "grit" | "bite";
export interface AcidSettings { voice: AcidVoice; drive: AcidDrive; }
export interface AcidTone {
  offset: number; midi: number; gain: number; cutoff: number; resonance: number;
}
export interface AcidChain {
  /** Times are cycles relative to the chain onset. Window includes the next rest. */
  gate: number; window: number; tones: readonly AcidTone[];
  depth: number; decay: number; charge: number; accent: boolean;
  delay: number; feedback: number; delayCycles: number;
}

export function readAcidSettings(voice: string | null, drive: string | null): AcidSettings {
  if (voice !== null && !["current", "mono-step-1", "mono-link-1"].includes(voice)) throw new Error(`Unknown acid voice: ${voice}`);
  if (drive !== null && !["clean", "grit", "bite"].includes(drive)) throw new Error(`Unknown acid drive: ${drive}`);
  return { voice: (voice ?? "current") as AcidVoice, drive: (drive ?? "clean") as AcidDrive };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Static compensation is part of the patch. Never normalize each seed/render. */
const DRIVES = {
  clean: { input: 1, output: .8, tone: 10000 },
  grit: { input: 2.5, output: .5, tone: 6500 },
  bite: { input: 5, output: .36, tone: 8500 },
} as const;

export function createAcidMono(ctx: BaseAudioContext, out: AudioNode, drive: AcidDrive, wave: OscillatorType) {
  const osc = ctx.createOscillator(); osc.type = wave;
  // Already registered by the pinned Superdough initAudio. Reuse the same ladder
  // algorithm as the current voice, without allocating a new filter for each note.
  const ladder = new AudioWorkletNode(ctx, "ladder-processor", {
    numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
    parameterData: { frequency: 300, q: 7, drive: .69 },
  });
  const amp = ctx.createGain(); amp.gain.value = 0;
  const pre = ctx.createGain(); pre.gain.value = DRIVES[drive].input;
  const shaper = ctx.createWaveShaper();
  if (drive !== "clean") {
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const x = 2 * i / (curve.length - 1) - 1;
      curve[i] = drive === "grit" ? x / (1 + 1.8 * Math.abs(x)) : clamp(x * 1.8, -.65, .8);
    }
    shaper.curve = curve; shaper.oversample = "2x";
  }
  const highpass = ctx.createBiquadFilter(); highpass.type = "highpass"; highpass.frequency.value = 55;
  const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = DRIVES[drive].tone;
  const trim = ctx.createGain(); trim.gain.value = DRIVES[drive].output;
  const delay = ctx.createDelay(2), send = ctx.createGain(), feedback = ctx.createGain();
  const echoLow = ctx.createBiquadFilter(); echoLow.frequency.value = 4200;
  const echoHigh = ctx.createBiquadFilter(); echoHigh.type = "highpass"; echoHigh.frequency.value = 220;
  osc.connect(ladder).connect(amp).connect(pre).connect(shaper).connect(highpass).connect(tone).connect(trim);
  trim.connect(out); trim.connect(send).connect(delay).connect(echoHigh).connect(echoLow);
  echoLow.connect(out); echoLow.connect(feedback).connect(delay);
  send.gain.value = 0; feedback.gain.value = 0;
  osc.start();
  let disposed = false, tuned = false;
  return {
    play(chain: AcidChain, at: number, cps: number) {
      if (disposed) return;
      const first = chain.tones[0]!;
      const window = chain.window / cps, gate = Math.min(chain.gate / cps, window - .014);
      // Stop each automation curve before the next one begins, including rounding
      // at long loop offsets. Scheduled values never depend on AudioParam.value.
      const duration = Math.max(.0001, window - .00001);
      const count = Math.max(32, Math.ceil(duration * 1000));
      const levels = new Float32Array(count), cutoffs = new Float32Array(count);
      const decay = clamp(chain.decay, .07, .4) * (chain.accent ? .65 : 1);
      const depth = clamp(chain.depth, 1, 6) + chain.charge * .35;
      for (let i = 0, segment = 0; i < count; i++) {
        const t = i * duration / (count - 1);
        while (segment + 1 < chain.tones.length && chain.tones[segment + 1]!.offset / cps <= t) segment++;
        const note = chain.tones[segment]!, previous = chain.tones[Math.max(0, segment - 1)]!;
        const mix = clamp((t - note.offset / cps) / .004, 0, 1);
        const gain = previous.gain + (note.gain - previous.gain) * mix;
        const cutoff = previous.cutoff + (note.cutoff - previous.cutoff) * mix;
        const release = clamp(1 - (t - gate) / .014, 0, 1);
        levels[i] = gain * Math.min(1, t / .002) * (.64 + .36 * Math.exp(-t / .09)) * release;
        cutoffs[i] = clamp(cutoff * 2 ** (depth * Math.exp(-t / decay)), 100, Math.min(11000, ctx.sampleRate * .23));
      }
      levels[count - 1] = 0;
      amp.gain.setValueCurveAtTime(levels, at, duration);
      ladder.parameters.get("frequency")!.setValueCurveAtTime(cutoffs, at, duration);
      ladder.parameters.get("q")!.setValueAtTime(clamp(first.resonance, 4, 14), at);
      for (const [i, note] of chain.tones.entries()) {
        if (!tuned) { osc.frequency.setValueAtTime(frequency(note.midi), at); tuned = true; }
        else osc.frequency.setTargetAtTime(frequency(note.midi), at + note.offset / cps, i ? .02 : .002);
      }
      delay.delayTime.setValueAtTime(clamp(chain.delayCycles / cps, .02, 1.5), at);
      send.gain.setValueAtTime(clamp(chain.delay, 0, .4), at);
      feedback.gain.setValueAtTime(clamp(chain.feedback, 0, .55), at);
    },
    dispose() {
      if (disposed) return; disposed = true;
      // Disconnect immediately: a stopped continuous oscillator must not keep a
      // live ladder/effect loop in the graph or leak audio into the next take.
      osc.stop();
      for (const node of [osc, ladder, amp, pre, shaper, highpass, tone, trim, send, delay, echoHigh, echoLow, feedback]) node.disconnect();
    },
  };
}

export type AcidMono = ReturnType<typeof createAcidMono>;
