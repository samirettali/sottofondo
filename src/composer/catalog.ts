/** Canonical Superdough fields only: its low-level API reads fmi, not the REPL alias fm. */
export interface Sound {
  s: string; gain: number; attack: number; decay: number; sustain: number; release: number;
  cutoff?: number; hcutoff?: number; resonance?: number; fmi?: number; fmh?: number;
  fmattack?: number; fmdecay?: number; fmsustain?: number;
  lpenv?: number; lpattack?: number; lpdecay?: number; lpsustain?: number;
  penv?: number; pattack?: number; pdecay?: number;
  unison?: number; spread?: number; shape?: number; partials?: number[];
  phaserrate?: number; phaserdepth?: number;
}
export interface Patch {
  id: string; label: string; role: "bass" | "lead" | "chords" | "pad" | "texture";
  sound: Sound; source?: "303"; asset?: string; rootMidi?: number;
}
const sound = (s: string, gain: number, decay: number, extra: Partial<Sound> = {}): Sound =>
  ({ s, gain, attack: .004, decay, sustain: 0, release: .05, ...extra });
const patch = (id: string, label: string, role: Patch["role"], s: Sound, extra: Partial<Patch> = {}): Patch =>
  ({ id, label, role, sound: s, ...extra });

// Authored starting points, calibrated as patches, not arbitrary independent knob ranges.
export const PATCHES: readonly Patch[] = [
  patch("acid-liquid", "liquid 303", "bass", sound("sawtooth", .8, .36, { cutoff: 280, resonance: 13, lpenv: 3.5 }), { source: "303" }),
  patch("acid-rubber", "rubber 303", "bass", sound("square", .75, .19, { cutoff: 180, resonance: 9, lpenv: 2.6666666666666665 }), { source: "303" }),
  patch("acid-rough", "rough 303", "bass", sound("sawtooth", .7, .27, { cutoff: 430, resonance: 17, lpenv: 4.166666666666667, shape: .3 }), { source: "303" }),
  patch("acid-space", "hollow 303", "bass", sound("square", .7, .48, { cutoff: 220, resonance: 15, lpenv: 3.1666666666666665 }), { source: "303" }),
  patch("sub", "round sub", "bass", sound("sine", .95, .3, { cutoff: 450 })),
  patch("rubber", "elastic bass", "bass", sound("triangle", .8, .22, { fmi: 1.3, fmh: 1, fmdecay: .12, fmsustain: 0, cutoff: 1100 })),
  patch("hollow", "hollow bass", "bass", sound("square", .55, .17, { cutoff: 650, lpenv: 1.1666666666666667, lpdecay: .13 })),
  patch("wood", "wood bass", "bass", sound("triangle", .85, .25, { fmi: 2.2, fmh: 2, fmdecay: .04, fmsustain: 0, cutoff: 1800 })),
  patch("glass", "glass bells", "lead", sound("sine", .42, .55, { fmi: 3.2, fmh: 3.5, fmdecay: .3, fmsustain: .05, cutoff: 6000 })),
  patch("wire", "wire pluck", "lead", sound("sawtooth", .3, .12, { cutoff: 750, lpenv: 2, lpdecay: .09, resonance: 3 })),
  patch("reed", "soft reed", "lead", sound("square", .27, .24, { cutoff: 1600, attack: .025, sustain: .25, release: .2 })),
  patch("metal", "metal pulse", "lead", sound("triangle", .32, .13, { fmi: 4.1, fmh: 1.414, fmdecay: .08, fmsustain: .1, hcutoff: 350 })),
  patch("silk", "silk lead", "lead", sound("supersaw", .27, .35, { unison: 3, spread: .22, cutoff: 2400, attack: .025, sustain: .25, release: .2 })),
  patch("bubble", "bubble motif", "lead", sound("sine", .6, .16, { penv: 7, pattack: 0, pdecay: .025, fmi: .7, fmh: 2 })),
  patch("spark", "spark keys", "lead", sound("triangle", .42, .23, { fmi: 1.8, fmh: 4, fmdecay: .13, fmsustain: 0 })),
  patch("nasal", "nasal sequence", "lead", sound("user", .3, .16, { partials: [1, .2, .7, .1, .45], cutoff: 2600, resonance: 2 })),
  patch("epiano", "electric piano", "chords", sound("sine", .33, .55, { fmi: 1.6, fmh: 1, fmdecay: .25, fmsustain: .1, release: .2 })),
  patch("organ", "drawbar organ", "chords", sound("user", .22, .12, { partials: [1, .6, .2, .3, 0, .1], sustain: .45, release: .08, cutoff: 2400 })),
  patch("dub", "dub chords", "chords", sound("sawtooth", .22, .2, { cutoff: 650, lpenv: 1.5, lpdecay: .16, resonance: 2, hcutoff: 220 })),
  patch("mallet", "mallet chords", "chords", sound("triangle", .24, .3, { fmi: 2.4, fmh: 3, fmdecay: .1, fmsustain: 0, hcutoff: 180 })),
  patch("mist", "mist pad", "pad", sound("supersaw", .15, .4, { unison: 3, spread: .35, attack: .6, sustain: .65, release: 1.1, cutoff: 1400, hcutoff: 350 })),
  patch("halo", "harmonic halo", "pad", sound("user", .18, .8, { partials: [1, 0, .3, 0, .15], attack: .5, sustain: .5, release: 1, cutoff: 2200, hcutoff: 400 })),
  patch("velvet", "velvet pad", "pad", sound("triangle", .18, .7, { fmi: .6, fmh: 2, attack: .7, sustain: .55, release: 1, cutoff: 1800, hcutoff: 300 })),
  patch("sweep", "sweeping pad", "pad", sound("sawtooth", .16, .7, { attack: .4, sustain: .5, release: .8, cutoff: 500, lpenv: 1.5, lpattack: .8, lpdecay: 1, hcutoff: 300 })),
  patch("wood-sample", "sampled wood bass", "bass", sound("v2_bass_woodsy_c", .6, .35), { asset: "bass_woodsy_c", rootMidi: 36 }),
  patch("bell-sample", "sampled bell", "texture", sound("v2_elec_bell", .18, .5), { asset: "elec_bell", rootMidi: 60 }),
  patch("guitar-sample", "guitar harmonics", "texture", sound("v2_guit_harmonics", .22, .8), { asset: "guit_harmonics", rootMidi: 76 }),
  patch("air", "filtered air", "texture", sound("pink", .12, .6, { attack: .25, release: .3, hcutoff: 3000, cutoff: 6500 })),
];
export function getPatch(id: string): Patch {
  const p = PATCHES.find(p => p.id === id);
  if (!p) throw new Error(`Unknown patch: ${id}`);
  return p;
}
export const KITS = {
  round: { kick: "bd_808", backbeat: "sn_dub", hat: "hat_cab", open: "drum_cymbal_soft", perc: "elec_wood" },
  hard: { kick: "bd_tek", backbeat: "elec_hi_snare", hat: "hat_metal", open: "drum_cymbal_open", perc: "elec_fuzz_tom" },
  dry: { kick: "bd_haus", backbeat: "perc_snap2", hat: "hat_tap", open: "drum_cymbal_pedal", perc: "drum_tom_hi_soft" },
} as const;
export type KitId = keyof typeof KITS;
export type DrumId = keyof typeof KITS.round;
export const FAMILIES = {
  acid: [
    { name: "Liquid", bass: ["acid-liquid", "acid-rubber"], lead: ["bubble", "wire"], support: ["halo", "sweep"] },
    { name: "Percussive", bass: ["acid-rubber", "acid-liquid"], lead: ["metal", "nasal"], support: ["air", "bell-sample"] },
    { name: "Raw", bass: ["acid-rough", "acid-rubber"], lead: ["wire", "metal"], support: ["sweep", "air"] },
    { name: "Orbital", bass: ["acid-space", "acid-liquid"], lead: ["glass", "silk"], support: ["halo", "guitar-sample"] },
  ],
  techno: [
    { name: "Dry", bass: ["sub", "hollow"], lead: ["bubble", "wire"], support: ["air", "bell-sample"] },
    { name: "Metallic", bass: ["rubber", "hollow"], lead: ["metal", "nasal"], support: ["bell-sample", "sweep"] },
    { name: "Deep", bass: ["sub", "wood"], lead: ["reed", "spark"], support: ["velvet", "halo"] },
    { name: "Dub", bass: ["hollow", "sub"], lead: ["wire", "glass"], support: ["dub", "mist"] },
  ],
  house: [
    { name: "Electric", bass: ["wood", "wood-sample"], lead: ["spark", "glass"], support: ["epiano", "mallet"] },
    { name: "Organ", bass: ["rubber", "hollow"], lead: ["reed", "bubble"], support: ["organ", "epiano"] },
    { name: "Dub", bass: ["sub", "wood-sample"], lead: ["wire", "silk"], support: ["dub", "organ"] },
    { name: "Percussive", bass: ["wood", "rubber"], lead: ["glass", "spark"], support: ["mallet", "epiano"] },
  ],
} as const;
