import { anchor, attackDecay, decayTo, noiseBuffer, pitchDrop, playFor, playNoise } from "./env.ts";

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
    hat: { mode: "noise", closed: 0.06, open: 0.75, hp: 5200, bp: 7000, level: 0.22, shimmer: 0.22 },
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
  /** Struck metal in the hand: qraqeb, zills, finger cymbals. */
  readonly clack: DrumVoice;
  /** The open slap of a hand drum: alegre, tapan, tek, dayan. */
  readonly slap: DrumVoice;
  /** A scraped rasp: guacharaca, güiro, reco-reco. */
  readonly scrape: DrumVoice;
  /** A membrane that bends up after the strike: the tabla's bayan. */
  readonly bend: DrumVoice;
  /** Every voice, in a stable order, for indexing by voice number. */
  readonly voices: readonly DrumVoice[];
  readonly names: readonly string[];
}

/** 808 hi-hat oscillator bank — six squares, from the circuit. */
const HAT_PARTIALS = [800, 540, 522.7, 369.6, 304.4, 205.3] as const;

const ACCENT_GAIN = 2.2; // within the 808's 2–4x range

/** Inharmonic mode ratios for a struck plate, and the fundamental they sit on. */
const RING_RATIOS = [1, 1.47, 2.09, 2.71, 3.33, 4.17, 5.43, 6.79, 8.21, 9.97] as const;
const RING_HZ = 330;
/** Where on the plate the stick landed. Cycled, not rolled: generation stays pure. */
const RING_SPREAD = [1, 0.955, 1.061, 0.983, 1.032, 0.971, 1.047] as const;

/** Ridge spacing along a scraped tube. Uneven, because a hand is. */
const SCRAPE_GAPS = [1, 1.24, 0.82, 1.11, 0.9, 1.31, 0.76, 1.05] as const;

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
  let ringCursor = 0;
  const ring = (at: number, gain: number, decay: number) => {
    // Highpassed rather than bandpassed, and built up from a low fundamental: a 20-inch
    // ride's modes start in the hundreds of hertz and reach a few kilohertz, so a bank
    // built from the *hat's* highpass frequency upwards is a shrill electronic tinkle
    // with no plate under it. That mistake made the jazz preset read as chiptune.
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 600;
    const vca = ctx.createGain();
    decayTo(vca.gain, at, gain, decay * 1.4);
    // Every strike lands on a slightly different part of the plate. Without that the
    // partials of overlapping hits sum into a pitch — a ride struck three times a second
    // becomes a drone on its own fundamental, which is a synthesizer, not a cymbal.
    const spread = RING_SPREAD[ringCursor % RING_SPREAD.length] ?? 1;
    ringCursor++;
    for (const ratio of RING_RATIOS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = RING_HZ * spread * ratio;
      // The high modes die first, as they do on a real plate.
      const partial = ctx.createGain();
      decayTo(partial.gain, at, 1 / (1 + ratio * 0.6), decay * 1.4 * (1 / (1 + ratio * 0.25)));
      osc.connect(partial).connect(hp);
      playFor(osc, at, decay * 1.4 + 0.05);
    }
    hp.connect(vca).connect(out);
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

  /**
   * Struck metal in the hand: qraqeb, zills, spoons, claves' metal cousin.
   *
   * Not a frame drum and not a hi-hat. The gnawa qraqeb are iron castanets and the
   * loudest thing in the room; played on the frame voice, which is a tap on skin, the
   * whole genre came back from a blind listener as "muffled low-frequency heartbeat
   * sounds, no musical instruments".
   */
  const clack: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      const decay = accent ? 0.16 : 0.11;
      burst(at, 0.5 * g, decay * 0.6, "bandpass", 3800, 1.2);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 900;
      const vca = ctx.createGain();
      decayTo(vca.gain, at, 0.42 * g, decay);
      for (const ratio of [1, 1.63, 2.31, 3.11]) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = 1180 * ratio;
        osc.connect(hp);
        playFor(osc, at, decay + 0.02);
      }
      hp.connect(vca).connect(out);
    },
  };

  /**
   * The open slap of a hand drum: alegre, tapan, darbuka tek, dayan, bendir.
   *
   * Not a snare. A snare's tail is the wires buzzing under the head, and every preset
   * that borrowed the snare voice for a hand drum was heard as "a drum kit with a
   * backbeat on 2 and 4" — which lands the listener in a Western genre before a single
   * melodic note is considered. This is the other sound: a hard crack, a short skin tone
   * that falls, and no tail at all.
   */
  const slap: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      const decay = accent ? 0.11 : 0.08;
      // Two bands rather than one: the crack of the hand at the edge, and the head
      // answering under it. A single band with a clean sine over it is a cowbell.
      burst(at, 0.6 * g, decay * 0.5, "bandpass", 2400, 0.9);
      // The head under the hand. Without enough of this the voice is a woodblock.
      burst(at, 0.5 * g, decay * 1.6, "bandpass", 300, 1.4);
      burst(at, 0.35 * g, decay, "bandpass", 620, 1.6);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      // Short and steep: a hand drum's pitch is gone almost before it is heard, and a
      // sustained one is a bell.
      pitchDrop(osc.frequency, at, 500, 250, 0.02);
      const vca = ctx.createGain();
      decayTo(vca.gain, at, 0.22 * g, decay * 0.45);
      osc.connect(vca).connect(out);
      playFor(osc, at, decay + 0.05);
    },
  };

  /**
   * A scraped rasp: guacharaca, güiro, reco-reco.
   *
   * A stick dragged across ridges, so it is a *train* of grains rather than one burst —
   * which is the whole difference between a güiro and a shaker, and between cumbia and
   * a drum machine playing sixteenths.
   */
  const scrape: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      const grains = accent ? 17 : 13;
      for (let i = 0; i < grains; i++) {
        // Uneven spacing: evenly spaced grains at a few kilohertz are a hi-hat, which is
        // exactly what a blind listener called the first version of this.
        const jitter = SCRAPE_GAPS[i % SCRAPE_GAPS.length] ?? 1;
        const when = at + i * 0.0072 * jitter;
        // An arc across the stroke, and a wooden band rather than a metallic one.
        const arc = Math.sin((Math.PI * (i + 0.5)) / grains);
        burst(when, 0.26 * g * (0.45 + 0.55 * arc), 0.0075, "bandpass", 1500 + i * 55, 4.5);
      }
      // The tube itself: a low woody resonance under the ridges.
      burst(at, 0.14 * g, 0.09, "bandpass", 430, 3.5);
    },
  };

  /**
   * A pitched membrane that bends: the tabla's bayan, struck and then pressed.
   *
   * The heel of the hand slides across the head after the strike and the pitch goes *up*
   * before it falls away. That gliss is the single most recognisable thing about the
   * instrument, and a plain pitch drop is just a tom.
   */
  const bend: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      // The gliss has to be wide and slow enough to be *heard as a gliss*: an octave and
      // a half over a fifth of a second. The first version travelled a fifth in ninety
      // milliseconds and was called a kick drum.
      // The whole gesture has to fit between two strokes — a bayan plays four times a
      // second — or the fall is cut off by the next hit and all that is left is a pulse
      // at one pitch, which is a kick drum.
      anchor(osc.frequency, at, 88);
      osc.frequency.exponentialRampToValueAtTime(accent ? 224 : 190, at + 0.1);
      osc.frequency.exponentialRampToValueAtTime(80, at + 0.3);
      const vca = ctx.createGain();
      decayTo(vca.gain, at, 0.75 * g, accent ? 0.34 : 0.27);
      osc.connect(vca).connect(out);
      playFor(osc, at, 0.45);
      // Two more modes, following the bend. A drum head is not one sine.
      for (const [mult, gain, life] of [[1.5, 0.22, 0.1], [2.4, 0.12, 0.06]] as const) {
        const partial = ctx.createOscillator();
        partial.type = "sine";
        anchor(partial.frequency, at, 88 * mult);
        partial.frequency.exponentialRampToValueAtTime((accent ? 224 : 190) * mult, at + 0.1);
        const pv = ctx.createGain();
        decayTo(pv.gain, at, gain * g, life);
        partial.connect(pv).connect(out);
        playFor(partial, at, life + 0.05);
      }
      // The finger landing on the skin.
      burst(at, 0.2 * g, 0.02, "bandpass", 1500, 1.2);
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

  const names = ["kick", "snare", "clap", "closedHat", "openHat", "rim", "cowbell", "tom", "frame", "clack", "slap", "scrape", "bend"];
  const voices = [kick, snare, clap, closedHat, openHat, rim, cowbell, tom, frame, clack, slap, scrape, bend];
  return { kick, snare, clap, closedHat, openHat, rim, cowbell, tom, frame, clack, slap, scrape, bend, voices, names };
}
