import { getPatch } from "./catalog.ts";

export type VoiceControls = Record<string, string | number | number[]>;
export interface TranceVoice { readonly label: string; readonly sound: Readonly<VoiceControls>; }
function voice(label: string, patch: string, overrides: VoiceControls = {}): TranceVoice {
  const sound: VoiceControls = { ...getPatch(patch).sound, ...overrides };
  if (Array.isArray(sound.partials)) { sound.partials = [...sound.partials]; Object.freeze(sound.partials); }
  return Object.freeze({ label, sound: Object.freeze(sound) });
}

// Instrument definitions only. No song phrases or family templates are imported
// from the production composer. These authored patches belong to trance-1.
export const TRANCE_VOICES = Object.freeze({
  wire: voice("Wire pluck", "wire", { gain: .38 }),
  spark: voice("Crystal keys", "spark"),
  bubble: voice("Pitch pluck", "bubble", { gain: .4 }),
  nasal: voice("Harmonic pulse", "nasal", { gain: .36 }),
  glass: voice("Glass FM bells", "glass", { gain: .36, decay: .3, release: .1 }),
  needle: voice("Square pluck", "wire", { s: "square", cutoff: 1600, lpenv: 1.4, gain: .3 }),
  silk: voice("Wide trance lead", "silk", { attack: .003, decay: .18, sustain: .1, release: .06 }),
  rave: voice("Detuned saw pluck", "silk", { unison: 5, spread: .4, attack: .003, decay: .13, sustain: .05, release: .04, cutoff: 3800, gain: .29 }),
  pulse: voice("Hollow pulse lead", "nasal", { partials: [1, .12, .65, .05, .25, .1], cutoff: 3400, gain: .34 }),
  mist: voice("Wide saw pad", "mist", { attack: .3, release: .35 }),
  halo: voice("Harmonic pad", "halo", { attack: .2, release: .3 }),
  velvet: voice("Soft FM pad", "velvet", { attack: .25, release: .3 }),
  sweep: voice("Filter swell", "sweep", { attack: .2, release: .3, lpattack: .3, lpdecay: .5 }),
  choir: voice("Vowel chord", "organ", { partials: [1, .2, .1, .8, .45, .1, .2], attack: .012, cutoff: 3000, gain: .21 }),
  strings: voice("Synth strings", "mist", { attack: .02, decay: .16, sustain: .45, release: .08, spread: .18, gain: .19 }),
  organ: voice("Gated harmonics", "organ", { attack: .003, decay: .1, release: .05, gain: .2 }),
  dub: voice("Resonant chord stab", "dub", { cutoff: 1000, gain: .25 }),
  mallet: voice("FM mallet chord", "mallet", { gain: .29 }),
  epiano: voice("Electric key chord", "epiano", { decay: .3, release: .09, gain: .3 }),
  "fm-tom": voice("FM tom", "bubble", { gain: .27, decay: .09, release: .02, penv: 12, pdecay: .03, fmi: 2.5, fmh: 1.5, cutoff: 2600 }),
  "metal-rim": voice("Metal rim", "metal", { gain: .26, decay: .055, release: .015, fmi: 7, fmh: 2.71, hcutoff: 900 }),
  "resonant-tick": voice("Resonant tick", "wire", { gain: .25, decay: .045, release: .02, cutoff: 2400, resonance: 8, lpenv: .5 }),
  air: voice("Filtered noise rise", "air", { gain: .1, attack: .45, sustain: .3, release: .12 }),
  wash: voice("Noise wash", "air", { s: "white", gain: .085, attack: .02, decay: .35, sustain: 0, release: .12 }),
});
export type TranceVoiceId = keyof typeof TRANCE_VOICES;
