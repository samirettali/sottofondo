import { variationStrength } from "./epoch.ts";

/**
 * Fills.
 *
 * The operator used here is the cheapest one and the one that is always in style:
 * **density increase**, drawn from the same metric curve the pattern came from. Extra
 * notes arrive in the places the generator already considered plausible, so a fill sounds
 * like the drummer filling in rather than like a different pattern spliced on.
 *
 * Two tiers, because that is what drummers do: a subtle marker mid-phrase and a stronger
 * one to close it. `variationStrength` supplies the tiers from the bar number alone.
 *
 * Two things this cannot do, both worth knowing before declaring a fill on a lane:
 *
 *   - **A mask lane cannot fill.** A mask puts strength on its own steps and zero
 *     everywhere else, so there is nothing latent for extra density to admit. Fills
 *     belong on probabilistic lanes.
 *   - **A saturated lane cannot fill either.** A sixteenth-note hat at high energy is
 *     already firing on nearly every step; adding density has nowhere to go. Put the
 *     fill on the sparse decorative lane — the shaker, the ghost snare — which is where
 *     a drummer's fill lives anyway.
 *
 * Also deliberately absent: rolls and ratchets. They need onsets between grid positions,
 * and the scheduler matches events to integer steps — fractional placement is a real
 * change rather than a parameter, so it is not pretended at here.
 */

export interface FillDef {
  /** How much extra density the fill adds at full strength. */
  readonly amount: number;
  /** How much of the bar the fill occupies, from the end. 0.25 is the last beat. */
  readonly span?: number;
}

/**
 * A per-step density bonus for one bar, or null when nothing is happening.
 *
 * The bonus ramps across the fill window rather than switching on, so the last steps of
 * the bar are the busiest — which is what makes it read as leading somewhere rather than
 * as a patch of noise.
 */
export function fillBonus(fill: FillDef | undefined, len: number, bar: number): number[] | null {
  if (fill === undefined || fill.amount <= 0) return null;
  const strength = variationStrength(bar);
  if (strength <= 0) return null;

  const span = Math.max(0.05, Math.min(1, fill.span ?? 0.25));
  const first = Math.floor(len * (1 - span));
  const bonus = new Array<number>(len).fill(0);
  for (let i = first; i < len; i++) {
    const t = len - 1 === first ? 1 : (i - first) / (len - 1 - first);
    bonus[i] = fill.amount * strength * t;
  }
  return bonus;
}

/** Whether this bar carries a fill at all, for a display or for logging. */
export function hasFill(fill: FillDef | undefined, bar: number): boolean {
  return fill !== undefined && fill.amount > 0 && variationStrength(bar) > 0;
}
