import { formatSeed, parseSeed } from "../src/core/rng.ts";
import { ReferencePlayer } from "./acid-reference-player.ts";
import { createStudy, STUDIES, studyForSeed, studyPattern, studySection, type StudyId, type StudyTake } from "./acid-studies-score.ts";

const study = document.querySelector<HTMLSelectElement>("#study")!;
const take = document.querySelector<HTMLSelectElement>("#take")!;
const seed = document.querySelector<HTMLInputElement>("#seed")!;
const play = document.querySelector<HTMLButtonElement>("#play")!;
const next = document.querySelector<HTMLButtonElement>("#next")!;
const compare = document.querySelector<HTMLButtonElement>("#compare")!;
const reveal = document.querySelector<HTMLButtonElement>("#reveal")!;
const status = document.querySelector("#status")!;
const clips = document.querySelector("#clips")!;
const params = new URLSearchParams(location.search);
if (params.get("piece") === "auto" || Object.hasOwn(STUDIES, params.get("piece") ?? "")) study.value = params.get("piece")!;
if (params.get("take") === "generated") take.value = "generated";
if (params.has("s")) seed.value = formatSeed(parseSeed(params.get("s")!));
if (study.value === "auto") take.value = "generated";
let ctx: AudioContext | undefined, player: ReferencePlayer | undefined;
let busy = false;
const urls: string[] = [];
const makePlan = () => createStudy(study.value === "auto" ? studyForSeed(parseSeed(seed.value)) : study.value as StudyId, take.value as StudyTake, parseSeed(seed.value));
let plan = makePlan();
const update = () => {
  const spec = STUDIES[plan.id];
  document.querySelector("#title")!.textContent = `${spec.title} · ${plan.bpm} BPM`;
  document.querySelector("#description")!.textContent = spec.description;
  study.disabled = take.disabled = play.disabled = next.disabled = compare.disabled = busy;
  seed.disabled = busy || take.value === "written";
  play.textContent = player?.transport.running ? "Stop" : "Play";
  const query = new URLSearchParams({ piece: study.value, take: take.value, s: formatSeed(parseSeed(seed.value)) });
  history.replaceState(null, "", `${location.pathname}?${query}`);
};
const stop = () => { player?.dispose(); player = undefined; update(); };
const clearClips = () => { urls.splice(0).forEach(URL.revokeObjectURL); clips.textContent = ""; reveal.disabled = true; };
async function start(): Promise<void> {
  busy = true; update(); status.textContent = "Loading instruments…";
  try {
    ctx ??= new AudioContext(); await ctx.resume();
    player = new ReferencePlayer(ctx, "original", plan.seed, { bpm: plan.bpm, pattern: studyPattern(plan) });
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
    title.textContent += ` — ${title.dataset.take === "written" ? "Written" : "Generated"}`; delete title.dataset.take;
  }); reveal.disabled = true;
});
compare.addEventListener("click", () => {
  stop(); clearClips(); busy = true; update();
  const chosen = plan;
  const takes: StudyTake[] = chosen.seed % 2 ? ["generated","written"] : ["written","generated"];
  void (async () => {
    for (const [index, version] of takes.entries()) {
      status.textContent = `Rendering ${index + 1}/2…`;
      const frame = document.createElement("iframe");
      const query = new URLSearchParams({ sketch: chosen.id, take: version, s: formatSeed(chosen.seed), begin: "0", end: "32" });
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
      link.download = `acid-study-${chosen.id}-${formatSeed(chosen.seed)}-${version}.wav`; link.textContent = "Download WAV";
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
    status.textContent = `Playing ${take.value}. Bar ${bar % 32 + 1}/32 · ${section.name}.`;
  }
}, 250);
window.addEventListener("pagehide", () => { clearInterval(monitor); stop(); clearClips(); });
update();
