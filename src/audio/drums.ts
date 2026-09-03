import { attackDecay, decayTo, noiseBuffer, pitchDrop, playFor, playNoise } from "./env.ts";

/**
 * A synthesised kit, in several styles.
 *
 * Synthesised rather than sampled: it costs no payload, every parameter is modulatable,
 * and there is no decode step to wait on. The reference implementation ships four mp3s
 * and contains an unused, perfectly good synthesised kick — this is that road taken.
 *
 * One kit for six genres was a mistake heard rather than reasoned about: the Bulgarian
 * preset was a Roland playing a wedding, and lo-fi hit with a techno kick. A kit style is
 * a parameter set the same voices read — kick sweep and length, snare tone and noise,
 * whether the hats are the 808's six squares or filtered noise — so a genre picks one by
 * name and the voice list stays fixed.
 *
 * Frequencies and decay times come from the Roland service notes where they exist:
 *
 *   TR-808: BD 56 Hz, decay 50/300/800 ms · CB 540 Hz (with 800 Hz) · CH 50 ms ·
 *           OH 90/450/600 ms · RS 1667 Hz
 *   TR-909: snare = two oscillators at 180 and 330 Hz plus a noise component
 *
 * The kick's 150→50 Hz sweep and the rimshot's ~1700 Hz band are tuning, not documented.
 *
 * Accent on a real 808 is a per-voice amplitude multiplier of roughly 2–4x, not a per-step
 * velocity — so it is a gain ratio on a boolean lane rather than extra velocity range.
 */

export interface DrumVoice {
  /** `at` is an absolute AudioContext time. `velocity` is 0..1. */
  play(at: number, velocity: number, accent: boolean): void;
}

export type KitStyleName = "808" | "909" | "acoustic" | "folk";

interface KitStyle {
  readonly kick: {
    readonly from: number;
    readonly to: number;
    readonly sweep: number;
    readonly decay: number;
    /** Click level, and how bright: a bandpass centre in Hz. */
    readonly click: number;
    readonly clickHz: number;
    /** Extra low thump from filtered noise — skin rather than circuit. */
    readonly skin: number;
  };
  readonly snare: {
    readonly tones: readonly (readonly [number, number])[];
    readonly toneDecay: number;
    readonly noiseHz: number;
    readonly noiseQ: number;
    readonly noiseDecay: number;
    readonly noiseLevel: number;
  };
  readonly hat: {
    readonly mode: "metal" | "noise";
    readonly closed: number;
    readonly open: number;
    readonly hp: number;
    readonly bp: number;
    readonly level: number;
    /**
     * How much struck metal rings under the noise, 0..1.
     *
     * A noise burst through a highpass is a hi-hat sample played quietly; a cymbal is a
     * bell with inharmonic partials that keep ringing after the strike. Without this the
     * ride in the jazz kit is a short hiss, and every blind listener who described these
     * renders led with "electronic drum machine".
     */
    readonly shimmer?: number;
  };
}

const STYLES: Record<KitStyleName, KitStyle> = {
  // Long, round, metallic hats. The reference's own drums are 909 samples, but the 808
  // voices are the documented ones.
  "808": {
    kick: { from: 150, to: 52, sweep: 0.045, decay: 0.45, click: 0.3, clickHz: 1400, skin: 0 },
    snare: { tones: [[180, 0.5], [330, 0.35]], toneDecay: 0.1, noiseHz: 1800, noiseQ: 0.9, noiseDecay: 0.16, noiseLevel: 0.6 },
    hat: { mode: "metal", closed: 0.05, open: 0.3, hp: 7500, bp: 10000, level: 0.28 },
  },
  // Shorter and harder: a fast sweep, more click, noise hats that cut.
  "909": {
    kick: { from: 210, to: 55, sweep: 0.028, decay: 0.3, click: 0.42, clickHz: 2200, skin: 0 },
    snare: { tones: [[180, 0.45], [330, 0.3]], toneDecay: 0.08, noiseHz: 2200, noiseQ: 0.8, noiseDecay: 0.14, noiseLevel: 0.7 },
    hat: { mode: "noise", closed: 0.045, open: 0.28, hp: 8000, bp: 11000, level: 0.3 },
  },
  // A soft kit for lo-fi: low sweep, a dull click, a skin thump, darker hats.
  acoustic: {
    kick: { from: 95, to: 50, sweep: 0.06, decay: 0.32, click: 0.12, clickHz: 700, skin: 0.35 },
    snare: { tones: [[185, 0.4], [270, 0.3]], toneDecay: 0.12, noiseHz: 1300, noiseQ: 0.7, noiseDecay: 0.2, noiseLevel: 0.5 },
    // The open hat is a ride: long, and with metal in it. A drummer's cymbal is the
    // loudest clue in the kit that a human is playing.
    hat: { mode: "noise", closed: 0.06, open: 1.3, hp: 5200, bp: 7000, level: 0.22, shimmer: 0.4 },
  },
  // Tupan and tapan: a deep skin drum and a slapped one, brushed hats.
  folk: {
    kick: { from: 80, to: 46, sweep: 0.05, decay: 0.5, click: 0.08, clickHz: 500, skin: 0.6 },
    snare: { tones: [[210, 0.35]], toneDecay: 0.07, noiseHz: 1100, noiseQ: 1.8, noiseDecay: 0.09, noiseLevel: 0.8 },
    hat: { mode: "noise", closed: 0.045, open: 0.7, hp: 6000, bp: 8500, level: 0.18, shimmer: 0.28 },
  },
};

export interface Kit {
  readonly kick: DrumVoice;
  readonly snare: DrumVoice;
  readonly clap: DrumVoice;
  readonly closedHat: DrumVoice;
  readonly openHat: DrumVoice;
  readonly rim: DrumVoice;
  readonly cowbell: DrumVoice;
  readonly tom: DrumVoice;
  /** A frame drum: a short, skin-coloured tap. */
  readonly frame: DrumVoice;
  /** Every voice, in a stable order, for indexing by voice number. */
  readonly voices: readonly DrumVoice[];
  readonly names: readonly string[];
}

/** 808 hi-hat oscillator bank — six squares, from the circuit. */
const HAT_PARTIALS = [800, 540, 522.7, 369.6, 304.4, 205.3] as const;

const ACCENT_GAIN = 2.2; // within the 808's 2–4x range

/** Inharmonic mode ratios for a struck plate. */
const RING_RATIOS = [1, 1.47, 2.09, 2.71, 3.33, 4.17] as const;

export function createKit(ctx: BaseAudioContext, out: AudioNode, styleName: KitStyleName = "808"): Kit {
  const style = STYLES[styleName];
  const noise = noiseBuffer(ctx, 2);
  // A rolling read offset so successive hits do not replay the identical noise burst.
  let noiseCursor = 0;
  const nextOffset = () => {
    noiseCursor = (noiseCursor + 0.037) % noise.duration;
    return noiseCursor;
  };

  const level = (velocity: number, accent: boolean) =>
    Math.max(0, Math.min(1, velocity)) * (accent ? ACCENT_GAIN : 1);

  /** Filtered noise with a decay — the building block for skin, click and hats. */
  const burst = (
    at: number,
    gain: number,
    decay: number,
    type: BiquadFilterType,
    hz: number,
    q: number,
    to: AudioNode = out,
  ) => {
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    const vca = ctx.createGain();
    decayTo(vca.gain, at, gain, decay);
    playNoise(ctx, noise, at, decay + 0.02, nextOffset()).connect(filter).connect(vca).connect(to);
  };

  const kick: DrumVoice = {
    play(at, velocity, accent) {
      const k = style.kick;
      const g = level(velocity, accent);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      pitchDrop(osc.frequency, at, k.from, k.to, k.sweep);
      const vca = ctx.createGain();
      decayTo(vca.gain, at, 0.9 * g, accent ? k.decay * 1.3 : k.decay);
      osc.connect(vca).connect(out);
      playFor(osc, at, k.decay * 2 + 0.1);

      // The click is most of what makes a kick audible on a small speaker.
      if (k.click > 0) burst(at, k.click * g, 0.006, "bandpass", k.clickHz, 0.8);
      // Skin: a low thump of filtered noise, which a circuit does not have and a drum does.
      if (k.skin > 0) burst(at, k.skin * g, 0.05, "lowpass", 180, 0.7);
    },
  };

  const snare: DrumVoice = {
    play(at, velocity, accent) {
      const s = style.snare;
      const g = level(velocity, accent);
      for (const [freq, amp] of s.tones) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const vca = ctx.createGain();
        decayTo(vca.gain, at, amp * g, s.toneDecay);
        osc.connect(vca).connect(out);
        playFor(osc, at, s.toneDecay * 2);
      }
      // Snap: the noise decay is the knob that matters most on a snare.
      burst(at, s.noiseLevel * g, accent ? s.noiseDecay * 1.4 : s.noiseDecay, "bandpass", s.noiseHz, s.noiseQ);
    },
  };

  const clap: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1100;
      band.Q.value = 1.2;
      band.connect(out);

      // Three short bursts 10 ms apart, then a longer one for the room tail. The
      // multi-burst is the whole trick; a single noise burst is not a clap.
      for (let i = 0; i < 3; i++) {
        const t = at + i * 0.01;
        const vca = ctx.createGain();
        decayTo(vca.gain, t, (0.55 - i * 0.08) * g, 0.006);
        playNoise(ctx, noise, t, 0.012, nextOffset()).connect(vca).connect(band);
      }
      const tail = ctx.createGain();
      decayTo(tail.gain, at + 0.03, 0.4 * g, 0.2);
      playNoise(ctx, noise, at + 0.03, 0.25, nextOffset()).connect(tail).connect(band);
    },
  };

  /**
   * The metal under a cymbal: inharmonic partials that outlast the strike.
   *
   * The ratios are not a series — a circular plate's modes are not harmonics, and using
   * harmonic ones gives a pitched bell rather than a cymbal.
   */
  const ring = (at: number, gain: number, decay: number) => {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = style.hat.bp;
    bp.Q.value = 0.5;
    const vca = ctx.createGain();
    decayTo(vca.gain, at, gain, decay * 1.4);
    for (const ratio of RING_RATIOS) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = style.hat.hp * ratio;
      osc.connect(bp);
      playFor(osc, at, decay * 1.4 + 0.05);
    }
    bp.connect(vca).connect(out);
  };

  /** The hat, in either voicing. */
  const hat = (at: number, gain: number, decay: number) => {
    const h = style.hat;
    if (h.mode === "noise") {
      burst(at, gain, decay, "highpass", h.hp, 0.7);
      if ((h.shimmer ?? 0) > 0) ring(at, gain * (h.shimmer ?? 0), decay);
      return;
    }
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = h.hp;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = h.bp;
    bp.Q.value = 0.8;
    const vca = ctx.createGain();
    decayTo(vca.gain, at, gain, decay);
    for (const f of HAT_PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = f;
      osc.connect(hp);
      playFor(osc, at, decay + 0.05);
    }
    hp.connect(bp).connect(vca).connect(out);
  };

  const closedHat: DrumVoice = {
    play(at, velocity, accent) {
      hat(at, style.hat.level * level(velocity, accent), style.hat.closed);
    },
  };

  const openHat: DrumVoice = {
    play(at, velocity, accent) {
      hat(at, style.hat.level * 0.93 * level(velocity, accent), accent ? style.hat.open * 1.5 : style.hat.open);
    },
  };

  const rim: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1667; // 808 RS, from the service notes
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1700; // tuning, not a documented figure
      bp.Q.value = 6;
      const vca = ctx.createGain();
      decayTo(vca.gain, at, 0.4 * g, 0.03);
      osc.connect(bp).connect(vca).connect(out);
      playFor(osc, at, 0.06);
    },
  };

  const cowbell: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 2;
      const vca = ctx.createGain();
      // A little attack, or the two squares click.
      attackDecay(vca.gain, at, 0.35 * g, 0.002, accent ? 0.25 : 0.12);
      for (const f of [800, 540] as const) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = f;
        osc.connect(bp);
        playFor(osc, at, 0.35);
      }
      bp.connect(vca).connect(out);
    },
  };

  const tom: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      pitchDrop(osc.frequency, at, 165, 118, 0.08);
      const vca = ctx.createGain();
      decayTo(vca.gain, at, 0.7 * g, accent ? 0.35 : 0.26);
      osc.connect(vca).connect(out);
      playFor(osc, at, 0.6);
      burst(at, 0.2 * g, 0.03, "lowpass", 900, 0.7);
    },
  };

  const frame: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      // A tap on skin: a short filtered noise with a faint pitched body.
      burst(at, 0.45 * g, accent ? 0.06 : 0.04, "bandpass", 2300, 2.5);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      pitchDrop(osc.frequency, at, 260, 190, 0.03);
      const vca = ctx.createGain();
      decayTo(vca.gain, at, 0.25 * g, 0.05);
      osc.connect(vca).connect(out);
      playFor(osc, at, 0.1);
    },
  };

  const names = ["kick", "snare", "clap", "closedHat", "openHat", "rim", "cowbell", "tom", "frame"];
  const voices = [kick, snare, clap, closedHat, openHat, rim, cowbell, tom, frame];
  return { kick, snare, clap, closedHat, openHat, rim, cowbell, tom, frame, voices, names };
}
