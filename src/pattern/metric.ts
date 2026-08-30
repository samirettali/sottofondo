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

/**
 * 32 steps: a two-bar pattern, which is the unit breakbeat genres actually work in.
 *
 * The second bar repeats the first's hierarchy at nine tenths the weight. That small
 * asymmetry is what makes a two-bar pattern read as one phrase rather than as the same
 * bar twice — the variation lands in bar two because bar two is where the curve is
 * weakest, which is where a drummer puts it too.
 */
export const METRIC_32: readonly number[] = [
  1.0, 0.1, 0.3, 0.15, 0.7, 0.1, 0.35, 0.15, 0.85, 0.1, 0.3, 0.15, 0.7, 0.1, 0.35, 0.2,
  0.9, 0.09, 0.27, 0.14, 0.63, 0.09, 0.32, 0.14, 0.77, 0.09, 0.27, 0.14, 0.63, 0.09, 0.32,
  0.22,
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
    len === 16
      ? METRIC_16
      : len === 32
        ? METRIC_32
        : len === 12
          ? METRIC_12
          : len === 8
            ? METRIC_8
            : null;
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
 * A metric curve from an additive grouping.
 *
 * Aksak metres — 7/8 as 3+2+2, 9/8 as 2+2+2+3 — are not a subdivision hierarchy at all.
 * They are unequal beats laid end to end, so the tabulated curves above, which halve at
 * each binary level, describe them wrongly: they would make step 6 of a 3+2+2 bar weak
 * when it is the start of a beat.
 *
 * The rule is the one the music actually follows: the downbeat is strongest, the first
 * step of every group is strong, and a *longer* group takes a slightly stronger accent
 * than a short one, which is what makes 3+2+2 audibly different from 2+2+3 rather than a
 * rotation of it.
 *
 * `grouping` is in steps, so 3+2+2 eighths on a sixteenth grid is [6, 4, 4].
 */
export function metricFromGrouping(grouping: readonly number[], len: number): number[] {
  const out = new Array<number>(len).fill(0.1);
  const total = grouping.reduce((a, b) => a + b, 0);
  if (total <= 0) return out;
  const longest = Math.max(...grouping);

  let step = 0;
  grouping.forEach((group, i) => {
    for (let j = 0; j < group && step < len; j++, step++) {
      if (j === 0) {
        // 1.0 on the bar's downbeat; other group heads scale with the group's length.
        out[step] = i === 0 ? 1 : 0.6 + 0.25 * (group / longest);
      } else if (j % 2 === 0) {
        out[step] = 0.3; // the middle of a long group
      } else {
        out[step] = 0.12; // between the eighths
      }
    }
  });
  return out;
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
