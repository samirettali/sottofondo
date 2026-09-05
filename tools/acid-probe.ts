import { createSongPlan, type Cell } from "../src/composer/plan.ts";
import { ComposerPlayer } from "../src/composer/player.ts";
import { currentRecipe } from "../src/recipe.ts";

/** The production score and player render a fixed, unaccented bass note. This
 * isolates whether expression and timbral automation actually reach the audio.
 */
async function probe(): Promise<void> {
  const variant = new URLSearchParams(location.search).get("variant");
  const ctx = new OfflineAudioContext(2, 48000 * 3, 48000);
  const base = createSongPlan("acid", 2);
  const cell: Cell = { step: 0, degree: 0, length: 6, velocity: variant === "quiet" ? .3 : .75, accent: false, slide: false };
  const plan = { ...base, bpm: 120, space: 0, drive: 0,
    motifs: [[cell], [cell]],
    roles: base.roles.map(r => ({ ...r, density: r.id === "bass" ? 1 : 0 })),
    performance: { ...base.performance!, cutoff: [variant === "cutoff-low" ? .3 : variant === "cutoff-high" ? 5 : 1],
      envelope: [variant === "envelope-flat" ? 0 : variant === "envelope-wide" ? 1.5 : 1],
      decay: [variant === "decay-short" ? .15 : variant === "decay-long" ? 2 : 1] },
  };
  const engine = new ComposerPlayer(ctx, currentRecipe("acid", 2), plan);
  await engine.scheduleRender(0, 1);
  const buffer = await ctx.startRendering();
  const data = buffer.getChannelData(0);
  const rms = (start: number, end: number) => Math.sqrt(data.slice(start * 48000, end * 48000).reduce((sum, v) => sum + v * v, 0) / ((end - start) * 48000));
  let energy = 0, difference = 0;
  for (let i = 2400; i < 12000; i++) { energy += data[i]! ** 2; difference += (data[i]! - data[i - 1]!) ** 2; }
  Object.assign(window, { probeResult: { rms: rms(.02, .3), tail: rms(.2, .5), roughness: difference / energy } });
  engine.dispose();
}
void probe().catch(error => Object.assign(window, { probeError: String(error) }));
