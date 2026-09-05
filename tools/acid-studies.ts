import { formatSeed, parseSeed } from "../src/core/rng.ts";
import { ReferencePlayer } from "./acid-reference-player.ts";
import { createStudy, STUDIES, studyForSeed, studyPattern, studySection, type StudyId, type StudyTake } from "./acid-studies-score.ts";
import { referencePattern } from "./acid-reference-score.ts";
import { performedPattern } from "./acid-performance-score.ts";

const study = document.querySelector<HTMLSelectElement>("#study")!;
const take = document.querySelector<HTMLSelectElement>("#take")!;
const performance = document.querySelector<HTMLSelectElement>("#performance")!;
const bell = document.querySelector<HTMLInputElement>("#bell")!;
const seed = document.querySelector<HTMLInputElement>("#seed")!;
const play = document.querySelector<HTMLButtonElement>("#play")!;
const next = document.querySelector<HTMLButtonElement>("#next")!;
const compare = document.querySelector<HTMLButtonElement>("#compare")!;
const reveal = document.querySelector<HTMLButtonElement>("#reveal")!;
const status = document.querySelector("#status")!;
const clips = document.querySelector("#clips")!;
const params = new URLSearchParams(location.search);
if (["auto","reference"].includes(params.get("piece") ?? "") || Object.hasOwn(STUDIES, params.get("piece") ?? "")) study.value = params.get("piece")!;
if (params.get("take") === "generated") take.value = "generated";
if (params.get("performance") === "shaped") performance.value = "shaped";
bell.checked = params.get("bell") === "1";
if (params.has("s")) seed.value = formatSeed(parseSeed(params.get("s")!));
if (study.value === "auto") take.value = "generated";
let ctx: AudioContext | undefined, player: ReferencePlayer | undefined;
let busy = false;
const urls: string[] = [];
const makePlan = () => createStudy(study.value === "reference" ? "pressure" : study.value === "auto" ? studyForSeed(parseSeed(seed.value)) : study.value as StudyId, take.value as StudyTake, parseSeed(seed.value));
let plan = makePlan();
const update = () => {
  const reference = study.value === "reference", supported = reference || plan.id === "pressure";
  if (reference) take.value = "written";
  if (!supported) performance.value = "baseline";
  const shaped = performance.value === "shaped";
  if (!shaped) bell.checked = false;
  const spec = STUDIES[plan.id];
  document.querySelector("#title")!.textContent = `${reference ? "Acido sotto casa" : spec.title} · ${plan.bpm} BPM`;
  document.querySelector("#description")!.textContent = reference ? "The original four-bar riff and TR-909 arrangement." : spec.description;
  study.disabled = take.disabled = play.disabled = next.disabled = compare.disabled = busy;
  take.disabled = next.disabled = busy || reference;
  seed.disabled = busy || take.value === "written" || reference;
  performance.disabled = busy || !supported; bell.disabled = busy || !shaped;
  document.querySelector("#performance-help")!.textContent = bell.checked
    ? "The bell answers in a half-bar gap every eight bars during the groove and return."
    : "Shaped execution keeps the notes and drum timing. Available for Pressure and Acido sotto casa.";
  document.querySelector("#compare-help")!.textContent = supported
    ? "Render Before and After with the same notes and drums. After includes the bell gap if enabled."
    : "Render the written and generated versions at the same tempo and output level. Listen before revealing which is which.";
  play.textContent = player?.transport.running ? "Stop" : "Play";
  const query = new URLSearchParams({ piece: study.value, take: take.value, s: formatSeed(parseSeed(seed.value)) });
  if (shaped) query.set("performance", "shaped");
  if (bell.checked) query.set("bell", "1");
  history.replaceState(null, "", `${location.pathname}?${query}`);
};
const stop = () => { player?.dispose(); player = undefined; update(); };
const clearClips = () => { urls.splice(0).forEach(URL.revokeObjectURL); clips.textContent = ""; reveal.disabled = true; };
async function start(): Promise<void> {
  busy = true; update(); status.textContent = "Loading instruments…";
  try {
    ctx ??= new AudioContext(); await ctx.resume();
    const reference = study.value === "reference";
    const pattern = performance.value === "shaped" ? performedPattern(reference ? "reference" : plan, bell.checked)
      : reference ? referencePattern("original", plan.seed) : studyPattern(plan);
    player = new ReferencePlayer(ctx, "original", plan.seed, { bpm: plan.bpm, pattern });
    await player.ready; player.start();
    Object.assign(window, { studyPlayer: player });
  } catch (error) { stop(); status.textContent = `Could not play: ${String(error)}. Try Play again.`; }
  finally { busy = false; update(); }
}
async function change(): Promise<void> {
  const resume = player?.transport.running;
  stop(); clearClips(); plan = makePlan(); update();
  status.textContent = "Ready. Starts at bar 1.";
  if (resume) await start();
}
study.addEventListener("change", () => { if (study.value === "auto") take.value = "generated"; void change(); });
take.addEventListener("change", () => { if (take.value === "written" && study.value === "auto") study.value = plan.id; void change(); });
seed.addEventListener("change", () => { seed.value = formatSeed(parseSeed(seed.value)); void change(); });
performance.addEventListener("change", () => { void change(); });
bell.addEventListener("change", () => { void change(); });
next.addEventListener("click", () => {
  take.value = "generated"; seed.value = formatSeed((parseSeed(seed.value) + 1) >>> 0); void change();
});
play.addEventListener("click", () => {
  if (player?.transport.running) { stop(); status.textContent = "Stopped."; } else void start();
});
document.querySelector("#link")!.addEventListener("click", () => {
  void navigator.clipboard.writeText(location.href).then(() => { status.textContent = "Link copied."; }, error => { status.textContent = String(error); });
});
reveal.addEventListener("click", () => {
  clips.querySelectorAll<HTMLElement>("[data-take]").forEach(title => {
    title.textContent += ` — ${title.dataset.take}`; delete title.dataset.take;
  }); reveal.disabled = true;
});
compare.addEventListener("click", () => {
  stop(); clearClips(); busy = true; update();
  const chosen = plan;
  const comparePerformance = plan.id === "pressure" || study.value === "reference";
  const versions = comparePerformance ? ["Before","After"] : ["Written","Generated"];
  if (chosen.seed % 2) versions.reverse();
  void (async () => {
    for (const [index, version] of versions.entries()) {
      status.textContent = `Rendering ${index + 1}/2…`;
      const frame = document.createElement("iframe");
      const query = new URLSearchParams({ s: formatSeed(chosen.seed), begin: "0", end: "32" });
      if (study.value === "reference") query.set("reference", "original");
      else { query.set("sketch", chosen.id); query.set("take", comparePerformance ? chosen.take : version.toLowerCase()); }
      if (version === "After") { query.set("performance", "shaped"); if (bell.checked) query.set("bell", "1"); }
      const result = await new Promise<{ bytes: ArrayBuffer; peak: number; rms: number }>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); frame.remove(); };
        const receive = (event: MessageEvent) => {
          if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
          if (event.data.type === "rendered") { cleanup(); resolve(event.data); }
          if (event.data.type === "render-error") { cleanup(); reject(new Error(event.data.message)); }
        };
        const timer = setTimeout(() => { cleanup(); reject(new Error("Render timed out")); }, 180000);
        window.addEventListener("message", receive); frame.src = `/tools/render-one.html?${query}`; document.body.append(frame);
      });
      if (!(result.peak > 0 && result.peak < 1 && result.rms > 0 && Number.isFinite(result.rms))) throw new Error("Silent or clipped render");
      const url = URL.createObjectURL(new Blob([result.bytes], { type: "audio/wav" })); urls.push(url);
      const article = document.createElement("article"), title = document.createElement("h3");
      title.textContent = String.fromCharCode(65 + index); title.dataset.take = version;
      const audio = document.createElement("audio"); audio.controls = true; audio.src = url;
      const link = document.createElement("a"); link.href = url;
      link.download = `acid-study-${study.value === "reference" ? "reference" : chosen.id}-${formatSeed(chosen.seed)}-${version.toLowerCase()}.wav`; link.textContent = "Download WAV";
      article.dataset.peak = String(result.peak); article.dataset.rms = String(result.rms);
      article.append(title, audio, link); clips.append(article);
    }
    status.textContent = "Ready. Both recordings span 32 bars, without normalisation."; reveal.disabled = false;
  })().catch(error => { status.textContent = String(error); }).finally(() => { busy = false; update(); });
});
const monitor = setInterval(() => {
  if (player?.error) { const error = player.error; stop(); status.textContent = error; }
  else if (player?.transport.running && !busy) {
    const bar = Math.floor(player.transport.cycle), section = studySection(plan, bar);
    const position = study.value === "reference" ? "original arrangement" : section.name;
    status.textContent = `Playing ${take.value}. Bar ${bar % 32 + 1}/32 · ${position}. ${performance.value === "shaped" ? `After${bell.checked ? " + bell" : ""}.` : "Before."}`;
  }
}, 250);
window.addEventListener("pagehide", () => { clearInterval(monitor); stop(); clearClips(); });
update();
