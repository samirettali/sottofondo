/**
 * The master bus.
 *
 *   voices → gain → waveshaper (tanh) → 20 Hz highpass → compressor → destination
 *
 * The waveshaper is the real limiter. The spec clamps input outside ±1 to the first and
 * last curve entries, so a tanh curve mathematically cannot exceed ±1 — unlike
 * `DynamicsCompressorNode`, whose ratio caps at 20 and which is therefore a glue
 * compressor, not a brick wall.
 *
 * The highpass after it is not optional: a waveshaper whose curve is non-zero at zero
 * input emits DC continuously, "even if there are no inputs connected to this node".
 * A tanh curve is odd, so f(0) is 0 and the DC is small — but rounding in the sampled
 * curve leaves a little, and it costs one node to be sure.
 */

export interface Master {
  readonly input: GainNode;
  readonly analyser: AnalyserNode;
  setVolume(v: number, at?: number): void;
  /** Disconnect from the destination. Required before building a second engine. */
  dispose(): void;
}

/**
 * A tanh transfer curve, unity-gain and correctly indexed.
 *
 * The spec maps input −1 to `curve[0]` and +1 to `curve[N-1]`, so the divisor is
 * `n - 1`. MDN's widely-copied `makeDistortionCurve` divides by `n`, which puts the
 * whole curve half a step off, and does not normalise — at drive 50 it attenuates by
 * about 9 dB.
 *
 * 2048 points is plenty: the node interpolates linearly between entries, and for a
 * smooth sigmoid the error is inaudible well below this.
 */
export function tanhCurve(drive: number, n = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(n);
  const k = Math.max(0.0001, drive);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

export function createMaster(ctx: BaseAudioContext, destination?: AudioNode): Master {
  const input = ctx.createGain();
  input.gain.value = 0.5;

  const shaper = ctx.createWaveShaper();
  shaper.curve = tanhCurve(1.6);
  shaper.oversample = "2x";

  // Oversampling latency is unspecified, so a parallel dry path around the shaper would
  // comb-filter against it. Everything stays in series.
  const dc = ctx.createBiquadFilter();
  dc.type = "highpass";
  dc.frequency.value = 20;

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -12;
  glue.knee.value = 6;
  glue.ratio.value = 4;
  glue.attack.value = 0.005;
  glue.release.value = 0.12;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;

  input.connect(shaper);
  shaper.connect(dc);
  dc.connect(glue);
  glue.connect(analyser);
  glue.connect(destination ?? ctx.destination);

  return {
    input,
    analyser,
    setVolume(v, at = ctx.currentTime) {
      input.gain.cancelScheduledValues(at);
      input.gain.setValueAtTime(input.gain.value, at);
      // Never step a gain: an instantaneous change is a click. A few milliseconds of
      // ramp is inaudible and removes it.
      input.gain.linearRampToValueAtTime(Math.max(0, v), at + 0.01);
    },
    dispose() {
      input.disconnect();
      shaper.disconnect();
      dc.disconnect();
      glue.disconnect();
      analyser.disconnect();
    },
  };
}
