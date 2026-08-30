import { attackDecay, decayTo, noiseBuffer, pitchDrop, playFor, playNoise } from "./env.ts";

/**
 * A synthesised 808/909-flavoured kit.
 *
 * Synthesised rather than sampled: it costs no payload, every parameter is modulatable,
 * and there is no decode step to wait on. The reference implementation ships four mp3s
 * and contains an unused, perfectly good synthesised kick — this is that road taken.
 *
 * Frequencies and decay times come from the Roland service notes where they exist:
 *
 *   TR-808: BD 56 Hz, decay 50/300/800 ms · CB 540 Hz (with 800 Hz) · CH 50 ms ·
 *           OH 90/450/600 ms · CY 350/800/1200 ms · RS 1667 Hz · CL ~2500 Hz
 *   TR-909: snare = two oscillators at 180 and 330 Hz plus a noise component
 *
 * Two figures in circulation are *not* traceable to a schematic and are marked where
 * they are used: the kick's 150→50 Hz sweep and the rimshot's ~1700 Hz. They are tuning
 * choices here, not documented values.
 *
 * Accent on a real 808 is a per-voice amplitude multiplier of roughly 2–4x (6–11 dB),
 * not a per-step velocity — so it is modelled as a gain ratio on a boolean lane rather
 * than as extra velocity resolution.
 */

export interface DrumVoice {
  /** `at` is an absolute AudioContext time. `velocity` is 0..1. */
  play(at: number, velocity: number, accent: boolean): void;
}

export interface Kit {
  readonly kick: DrumVoice;
  readonly snare: DrumVoice;
  readonly clap: DrumVoice;
  readonly closedHat: DrumVoice;
  readonly openHat: DrumVoice;
  readonly rim: DrumVoice;
  readonly cowbell: DrumVoice;
  /** Every voice, in a stable order, for indexing by voice number. */
  readonly voices: readonly DrumVoice[];
  readonly names: readonly string[];
}

/** 808 hi-hat oscillator bank — six squares, from the circuit. */
const HAT_PARTIALS = [800, 540, 522.7, 369.6, 304.4, 205.3] as const;

const ACCENT_GAIN = 2.2; // within the 808's 2–4x range

export function createKit(ctx: BaseAudioContext, out: AudioNode): Kit {
  const noise = noiseBuffer(ctx, 2);
  // A rolling read offset so successive hits do not replay the identical noise burst.
  let noiseCursor = 0;
  const nextOffset = () => {
    noiseCursor = (noiseCursor + 0.037) % noise.duration;
    return noiseCursor;
  };

  const level = (velocity: number, accent: boolean) =>
    Math.max(0, Math.min(1, velocity)) * (accent ? ACCENT_GAIN : 1);

  const kick: DrumVoice = {
    play(at, velocity, accent) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      // 150 -> 50 Hz is tuning, not a documented 808 figure; the 56 Hz fundamental is.
      pitchDrop(osc.frequency, at, 150, 52, 0.045);

      const vca = ctx.createGain();
      decayTo(vca.gain, at, 0.9 * level(velocity, accent), accent ? 0.55 : 0.42);

      // The click is most of what makes a kick audible on a small speaker.
      const click = ctx.createGain();
      decayTo(click.gain, at, 0.35 * level(velocity, accent), 0.006);
      const clickSrc = playNoise(ctx, noise, at, 0.01, nextOffset());
      const clickFilter = ctx.createBiquadFilter();
      clickFilter.type = "bandpass";
      clickFilter.frequency.value = 1400;
      clickFilter.Q.value = 0.8;

      osc.connect(vca).connect(out);
      clickSrc.connect(clickFilter).connect(click).connect(out);
      playFor(osc, at, 0.9);
    },
  };

  const snare: DrumVoice = {
    play(at, velocity, accent) {
      const g = level(velocity, accent);
      // Two tone oscillators, 909 values.
      for (const [freq, amp] of [
        [180, 0.5],
        [330, 0.35],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = freq;
        const vca = ctx.createGain();
        decayTo(vca.gain, at, amp * g, 0.1);
        osc.connect(vca).connect(out);
        playFor(osc, at, 0.2);
      }

      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1800;
      band.Q.value = 0.9;
      const vca = ctx.createGain();
      // Snap: the noise decay is the knob that matters most on a snare.
      decayTo(vca.gain, at, 0.6 * g, accent ? 0.22 : 0.16);
      playNoise(ctx, noise, at, 0.3, nextOffset()).connect(band).connect(vca).connect(out);
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

  /** The 808 hat bank, shared by the closed and open voices. */
  const hat = (at: number, gain: number, decay: number) => {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 10000;
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
      hat(at, 0.28 * level(velocity, accent), 0.05); // 808 CH: 50 ms
    },
  };

  const openHat: DrumVoice = {
    play(at, velocity, accent) {
      hat(at, 0.26 * level(velocity, accent), accent ? 0.45 : 0.3); // 808 OH: 90/450/600 ms
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

  const names = ["kick", "snare", "clap", "closedHat", "openHat", "rim", "cowbell"];
  const voices = [kick, snare, clap, closedHat, openHat, rim, cowbell];
  return { kick, snare, clap, closedHat, openHat, rim, cowbell, voices, names };
}
