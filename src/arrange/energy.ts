import type { GenreDef } from "../genre/schema.ts";

/**
 * The energy curve.
 *
 * One scalar per bar, in [0, 1], and everything about the arrangement reads from it: which
 * voices are in, how dense they are, how open the filter is. Driving several parameters
 * from one number is what reads as an arc — automating any single one of them well does
 * not, because a build is not a filter sweep, it is a filter sweep *and* more voices *and*
 * more density arriving together.
 *
 * This is the shape game audio middleware settled on: per-stem gain automated against a
 * parameter rather than against playback time. The parameter here is energy, and a lane
 * enters when the curve crosses its threshold rather than at a bar number, so the same
 * arrangement logic works whatever section it is in.
 */

export interface SectionDef {
  readonly name: string;
  readonly bars: number;
  /** Energy at the start of the section. */
  readonly energy: number;
  /** If set, the energy ramps to this across the section. Otherwise it holds. */
  readonly energyTo?: number;
}

export interface SectionAt {
  readonly name: string;
  readonly index: number;
  /** Bar within the section. */
  readonly bar: number;
  readonly bars: number;
  readonly energy: number;
}

/**
 * Which section a bar falls in, and the energy there.
 *
 * Sections cycle: the form repeats rather than ending, which is what a generative piece
 * with no length wants. Deriving the position from the bar rather than tracking it keeps
 * seeking working.
 */
export function sectionAt(sections: readonly SectionDef[], bar: number): SectionAt | null {
  if (sections.length === 0) return null;
  const total = sections.reduce((a, s) => a + Math.max(1, s.bars), 0);
  let position = ((bar % total) + total) % total;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (section === undefined) continue;
    const bars = Math.max(1, section.bars);
    if (position < bars) {
      const to = section.energyTo ?? section.energy;
      // Linear across the section. This is the one place a ramp beats a step: a build is
      // the only section whose job is to be on its way somewhere.
      const t = bars <= 1 ? 0 : position / (bars - 1);
      return {
        name: section.name,
        index: i,
        bar: position,
        bars,
        energy: clamp01(section.energy + (to - section.energy) * t),
      };
    }
    position -= bars;
  }
  return null;
}

/** Energy at a bar, or a flat mid value when a genre declares no sections. */
export function energyAt(genre: GenreDef, bar: number): number {
  const sections = genre.arrangement.sections;
  if (sections === undefined || sections.length === 0) return 0.5;
  return sectionAt(sections, bar)?.energy ?? 0.5;
}

/**
 * Whether a lane is in at this energy.
 *
 * A window rather than a threshold, so a voice can also drop *out* at the top — which is
 * how a breakdown works, and how a pad gets out of the way of a drop.
 */
export function laneIsIn(
  energy: number,
  window: { readonly minEnergy?: number; readonly maxEnergy?: number } | undefined,
): boolean {
  if (window === undefined) return true;
  if (window.minEnergy !== undefined && energy < window.minEnergy) return false;
  if (window.maxEnergy !== undefined && energy > window.maxEnergy) return false;
  return true;
}

/**
 * Density scaled by energy.
 *
 * `swing` is how much of the lane's density the curve is allowed to move — zero leaves a
 * lane fixed, which is what a kick usually wants.
 */
export function densityAt(base: number, energy: number, swing: number): number {
  if (swing <= 0) return base;
  return clamp01(base + (energy - 0.5) * 2 * swing);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** A default form for a genre that declares none: a long build and a long hold. */
export const DEFAULT_SECTIONS: readonly SectionDef[] = [
  { name: "intro", bars: 16, energy: 0.3 },
  { name: "build", bars: 16, energy: 0.4, energyTo: 0.8 },
  { name: "main", bars: 32, energy: 0.85 },
  { name: "break", bars: 16, energy: 0.25 },
  { name: "main", bars: 32, energy: 0.95 },
  { name: "outro", bars: 16, energy: 0.5, energyTo: 0.3 },
];
