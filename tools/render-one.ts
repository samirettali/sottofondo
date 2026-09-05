import { Engine } from "../src/app.ts";
import { GENRES } from "../src/genre/index.ts";
import { readRecipe } from "../src/recipe.ts";
import { createSongPlan, type ElectronicGenre } from "../src/composer/plan.ts";
import { studyPlan } from "../src/composer/studies.ts";
import { wav } from "./wav.ts";
import { REFERENCE_BPM, VARIANTS, type ReferenceVariant } from "./acid-reference-score.ts";
import { createStudy, STUDIES, studyPattern, type StudyId } from "./acid-studies-score.ts";
import { performedPattern } from "./acid-performance-score.ts";

/** Each render has a fresh realm: Superdough's node pools are process-global. */
async function render(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const r = readRecipe(params);
  const reference = params.get("reference");
  if (reference && !Object.hasOwn(VARIANTS, reference)) throw new Error("Unknown reference take");
  const sketchId = params.get("sketch");
  if (sketchId && !Object.hasOwn(STUDIES, sketchId)) throw new Error("Unknown acid study");
  if (sketchId && params.has("take") && !["written","generated"].includes(params.get("take")!)) throw new Error("Unknown study version");
  if (sketchId && reference) throw new Error("Choose either a study or a reference");
  const sketch = sketchId ? createStudy(sketchId as StudyId, params.get("take") === "generated" ? "generated" : "written", r.seed) : undefined;
  const shaped = params.get("performance") === "shaped";
  if (params.has("performance") && !shaped) throw new Error("Unknown performance version");
  if (shaped && reference !== "original" && sketch?.id !== "pressure") throw new Error("Choose Pressure or the original reference for shaped execution");
  const g = GENRES[r.genre]!;
  const begin = Number(params.get("begin") ?? 0);
  const end = Number(params.get("end") ?? 8);
  const rate = 48000;
  const plan = r.engineVersion === "strudel-2" ? params.has("study") ? studyPlan(params.get("study")!) : createSongPlan(r.genre as ElectronicGenre,r.seed,r.genreVersion) : undefined;
  const secondsPerBar = 240 / (sketch?.bpm ?? (reference ? REFERENCE_BPM : plan?.bpm ?? g.clock.bpm.default));
  const ctx = new OfflineAudioContext(2, Math.ceil((end * secondsPerBar + 2) * rate), rate);
  let rendering: Promise<AudioBuffer> | undefined;
  // Suspend at bar boundaries so future worklets do not process minutes of silence.
  // The same context keeps all preceding automation, accent charge and effect tails.
  const beforeBar = async (bar: number): Promise<void> => {
    // Firefox does not expose OfflineAudioContext.suspend; schedule ahead there.
    if (bar === 0 || typeof ctx.suspend !== "function") return;
    // suspend() quantises to a render quantum; leave two quanta of scheduling lead.
    const paused = ctx.suspend(bar * secondsPerBar - 256 / rate);
    if (!rendering) rendering = ctx.startRendering();
    else await ctx.resume();
    await paused;
  };
  let dispose = () => {};
  if (sketch || reference) {
    const { ReferencePlayer } = await import("./acid-reference-player.ts");
    const engine = new ReferencePlayer(ctx, (reference ?? "original") as ReferenceVariant, r.seed,
      shaped ? { bpm: sketch?.bpm ?? REFERENCE_BPM, pattern: performedPattern(sketch ?? "reference", params.get("bell") === "1") }
        : sketch ? { bpm: sketch.bpm, pattern: studyPattern(sketch) } : undefined);
    await engine.scheduleRender(end, beforeBar);
    dispose = () => engine.dispose();
  } else if (r.engineVersion === "strudel-2") {
    const { ComposerPlayer } = await import("../src/composer/player.ts");
    const engine = new ComposerPlayer(ctx,r,plan);
    await engine.scheduleRender(0,end,beforeBar);
    dispose = () => engine.dispose();
  } else if (r.engineVersion === "strudel-1") {
    const { StrudelPlayer } = await import("../src/strudel/engine.ts");
    const engine = new StrudelPlayer(ctx, r);
    await engine.scheduleRender(0, end, beforeBar);
    dispose = () => engine.dispose();
  } else {
    let now = 0;
    let tick = () => {};
    const engine = new Engine(ctx, g, r.seed, { now: () => now, ticker: { start(cb) { tick = cb; }, stop() {} } });
    await engine.ready;
    engine.start();
    for (let bar = 0; bar < end; bar++) {
      await beforeBar(bar);
      while (now < (bar + 1) * secondsPerBar) { now += 0.05; tick(); }
    }
    engine.clock.stop();
    dispose = () => engine.dispose();
  }
  if (rendering) await ctx.resume();
  const rendered = await (rendering ?? ctx.startRendering());
  const offset = Math.round((begin * secondsPerBar + (!sketch && !reference && r.engineVersion === "legacy-1" ? 0.05 : 0)) * rate);
  const length = Math.round((end - begin) * secondsPerBar * rate);
  const clip = new AudioBuffer({ numberOfChannels: 2, length, sampleRate: rate });
  let peak = 0; let squares = 0;
  for (let channel = 0; channel < 2; channel++) {
    const data = rendered.getChannelData(channel).subarray(offset, offset + length);
    clip.copyToChannel(data, channel);
    for (const value of data) { peak = Math.max(peak, Math.abs(value)); squares += value * value; }
  }
  const bytes = await wav(clip).arrayBuffer();
  parent.postMessage({ type: "rendered", bytes, peak, rms: Math.sqrt(squares / (2 * length)) }, location.origin, [bytes]);
  dispose();
}
void render().catch(error => parent.postMessage({ type: "render-error", message: String(error) }, location.origin));
