/**
 * Metric weight — how structurally strong each step of a bar is.
 *
 * This one table does most of the work that keeps procedural patterns from sounding
 * random. Added notes are drawn in descending weight order, removed notes in ascending,
 * and accents land on the strong positions. Without it, "increase density" scatters;
 * with it, density increase sounds like a drummer filling in.
 *
 * The shape is the standard metrical hierarchy: the downbeat outranks beat 3, which
 * outranks beats 2 and 4, which outrank the eighths, which outrank the sixteenths.
 */

/** 16 steps of 4/4, normalised to [0, 1]. */
export const METRIC_16: readonly number[] = [
  1.0, 0.1, 0.3, 0.15, 0.7, 0.1, 0.35, 0.15, 0.85, 0.1, 0.3, 0.15, 0.7, 0.1, 0.35, 0.2,
];

/** 12 steps: 4/4 in eighth-note triplets, or 12/8. */
export const METRIC_12: readonly number[] = [
  1.0, 0.15, 0.25, 0.7, 0.15, 0.25, 0.85, 0.15, 0.25, 0.7, 0.15, 0.3,
];

/** 8 steps of eighths. */
export const METRIC_8: readonly number[] = [1.0, 0.2, 0.7, 0.25, 0.85, 0.2, 0.7, 0.3];

/**
 * Weight for any pattern length, falling back to a generated hierarchy when the length
 * is not one of the tabulated ones. The generated form halves the weight at each level
 * of subdivision, which is the same idea Longuet-Higgins and Lee's metrical tree encodes.
 */
export function metricWeight(step: number, len: number): number {
  const table =
    len === 16 ? METRIC_16 : len === 12 ? METRIC_12 : len === 8 ? METRIC_8 : null;
  if (table !== null) return table[((step % len) + len) % len] ?? 0;

  const i = ((step % len) + len) % len;
  if (i === 0) return 1;
  // Deeper the subdivision a step first appears at, weaker it is.
  let level = 0;
  let span = len;
  while (span % 2 === 0 && i % span !== 0) {
    span /= 2;
    level++;
    if (i % span === 0) break;
  }
  return Math.max(0.1, 2 ** -level);
}

/**
 * Reshape the metric curve.
 *
 * `syncopation < 1` flattens it, so onsets spread away from the beats — house, dnb,
 * anything that wants the grid to feel even. `> 1` sharpens it, pushing everything onto
 * the strong positions. It is a single exponent and it does more for genre feel than a
 * separate rhythm model would.
 */
export function shapedWeight(step: number, len: number, syncopation = 1): number {
  const w = metricWeight(step, len);
  return syncopation === 1 ? w : w ** syncopation;
}

/** Step indices ordered strongest first — the order to add notes in. */
export function byStrength(len: number): number[] {
  return Array.from({ length: len }, (_, i) => i).sort(
    (a, b) => metricWeight(b, len) - metricWeight(a, len) || a - b,
  );
}
