import { formatSeed, parseSeed } from "../src/core/rng.ts";
import { AUDITION_SEEDS } from "../src/composer/procedural.ts";
import { ReferencePlayer } from "./acid-reference-player.ts";
import { createAudition, PARTS, type Take } from "./procedural-score.ts";

const seed = document.querySelector<HTMLInputElement>("#seed")!;
const take = document.querySelector<HTMLSelectElement>("#take")!;
const fixed = document.querySelector<HTMLInputElement>("#fixed")!;
const play = document.querySelector<HTMLButtonElement>("#play")!;
const status = document.querySelector<HTMLElement>("#status")!;
const reveal = document.querySelector<HTMLButtonElement>("#reveal")!;
const clips = document.querySelector<HTMLElement>("#clips")!;
const params = new URLSearchParams(location.search);
seed.value = formatSeed(parseSeed(params.get("s") ?? "1"));
if (params.get("take") === "previous") take.value = "previous";
fixed.checked = params.get("fixed") === "1";
const muted = new Set<string>(), urls: string[] = [];
let busy = false, ctx: AudioContext | undefined, player: ReferencePlayer | undefined;
let audition = makeAudition();
function makeAudition() {
  const begin = performance.now();
  const result = createAudition(parseSeed(seed.value), take.value as Take, fixed.checked, muted);
  Object.assign(window, { proceduralGenerationMs: performance.now() - begin, proceduralScore: result });
  return result;
}
function update() {
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input,button,select").forEach(el => { el.disabled = busy; });
  reveal.disabled = busy || !clips.querySelector("[data-take]");
  play.textContent = player?.transport.running ? "Stop" : "Play";
  document.querySelectorAll<HTMLButtonElement>("#seeds button").forEach(button => button.setAttribute("aria-pressed", String(parseSeed(seed.value) === Number(button.dataset.seed))));
  history.replaceState(null, "", `${location.pathname}?${new URLSearchParams({ s: seed.value, take: take.value, fixed: fixed.checked ? "1" : "0" })}`);
}
function display() {
  const id = audition.composition.identity;
  const key = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][fixed.checked ? 4 : id.key];
  document.querySelector("#identity")!.textContent = `${audition.bpm} BPM · ${key} · ${take.value === "new" ? id.mode : "Minor blues"} · ${fixed.checked ? "sawtooth / hard kit" : `${id.wave} / ${id.kit} kit`}`;
  const form = document.querySelector("#form")!; form.textContent = "";
  if (take.value === "new") for (const section of audition.composition.sections) {
    const span = document.createElement("span"); span.style.flex = String(section.bars);
    span.textContent = section.name === "Opening" ? "Intro" : section.name;
    span.title = `${section.name} · ${section.bars} bars`;
    span.dataset.start = String(section.start); span.dataset.end = String(section.start + section.bars); form.append(span);
  }
  else { const span = document.createElement("span"); span.textContent = "Previous arrangement · first 32 bars"; form.append(span); }
  const svg = document.querySelector<SVGSVGElement>("#motif")!;
  const bars = take.value === "new" ? id.motifBars : 4;
  const notes = audition.events.slice(0, bars).flat().filter(e => e.laneId === "acid");
  const lo = Math.min(...notes.map(n => n.midi!)) - 1, hi = Math.max(...notes.map(n => n.midi!)) + 2;
  svg.replaceChildren(); svg.setAttribute("viewBox", `0 0 ${bars * 128} ${(hi - lo) * 5}`); svg.setAttribute("preserveAspectRatio", "none");
  for (const note of notes) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    for (const [key, value] of Object.entries({ x: note.begin * 128, y: (hi - note.midi! - 1) * 5, width: Math.max(1, (note.end - note.begin) * 128), height: 4, fill: "#c6ef80", opacity: .3 + note.velocity * .7 })) rect.setAttribute(key, String(value));
    svg.append(rect);
  }
  const parts = document.querySelector("#parts")!; parts.textContent = "";
  for (const part of PARTS.filter(part => audition.events.some(bar => bar.some(e => e.laneId === part)))) {
    const button = document.createElement("button"); button.textContent = part; button.setAttribute("aria-pressed", String(!muted.has(part)));
    button.addEventListener("click", () => {
      if (muted.has(part)) muted.delete(part); else muted.add(part);
      button.setAttribute("aria-pressed", String(!muted.has(part)));
    }); parts.append(button);
  }
  update();
}
function stop() { player?.dispose(); player = undefined; update(); }
function clearClips() {
  clips.querySelectorAll("audio").forEach(audio => audio.pause()); clips.textContent = "";
  urls.splice(0).forEach(URL.revokeObjectURL); reveal.disabled = true;
}
async function start() {
  busy = true; update(); status.textContent = "Loading instruments…";
  try {
    ctx ??= new AudioContext(); await ctx.resume();
    player = new ReferencePlayer(ctx, "original", parseSeed(seed.value), audition);
    await player.ready; player.start(); Object.assign(window, { proceduralPlayer: player });
  } catch (error) { stop(); status.textContent = `Could not play: ${String(error)}`; }
  finally { busy = false; update(); }
}
async function change() {
  const resume = player?.transport.running; stop(); clearClips();
  seed.value = formatSeed(parseSeed(seed.value)); audition = makeAudition(); display();
  status.textContent = "Ready. Starts at bar 1.";
  if (resume) await start();
}
for (const value of AUDITION_SEEDS) {
  const button = document.createElement("button"); button.textContent = String(value); button.dataset.seed = String(value);
  button.addEventListener("click", () => { seed.value = formatSeed(value); take.value = "new"; void change(); });
  document.querySelector("#seeds")!.append(button);
}
seed.addEventListener("change", () => { void change(); });
take.addEventListener("change", () => { void change(); });
fixed.addEventListener("change", () => { void change(); });
play.addEventListener("click", () => { if (player?.transport.running) { stop(); status.textContent = "Stopped."; } else void start(); });
document.querySelector("#next")!.addEventListener("click", () => { seed.value = formatSeed((parseSeed(seed.value) + 1) >>> 0); take.value = "new"; void change(); });
document.querySelector("#link")!.addEventListener("click", () => {
  void navigator.clipboard.writeText(location.href).then(() => { status.textContent = "Link copied."; }, error => { status.textContent = String(error); });
});
reveal.addEventListener("click", () => {
  clips.querySelectorAll<HTMLElement>("[data-take]").forEach(title => { title.textContent += ` — ${title.dataset.take}`; delete title.dataset.take; }); update();
});
document.querySelector("#compare")!.addEventListener("click", () => {
  stop(); clearClips(); busy = true; update();
  void (async () => {
    const versions: Take[] = parseSeed(seed.value) % 2 ? ["previous", "new"] : ["new", "previous"];
    for (const [index, version] of versions.entries()) {
      status.textContent = `Rendering ${index + 1}/2…`;
      const query = new URLSearchParams({ procedural: version, s: seed.value, fixed: fixed.checked ? "1" : "0", begin: "0", end: "32" });
      const frame = document.createElement("iframe");
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
      const article = document.createElement("article"), title = document.createElement("h3"), audio = document.createElement("audio"), link = document.createElement("a");
      title.textContent = String.fromCharCode(65 + index); title.dataset.take = version === "new" ? "New composer" : "Previous composer";
      audio.controls = true; audio.src = url; link.href = url; link.download = `composer-${seed.value}-${version}.wav`; link.textContent = "Download WAV";
      article.dataset.peak = String(result.peak); article.dataset.rms = String(result.rms); article.append(title, audio, link); clips.append(article);
    }
    status.textContent = "Ready. Both recordings span 32 bars, without normalisation.";
  })().catch(error => { status.textContent = String(error); }).finally(() => { busy = false; update(); });
});
const monitor = setInterval(() => {
  if (player?.error) { const error = player.error; stop(); status.textContent = error; }
  else if (player?.transport.running && !busy) {
    const bar = Math.floor(player.transport.cycle) % 32;
    status.textContent = `Playing ${take.value === "new" ? "new composer" : "previous composer"}. Bar ${bar + 1}/32.`;
    document.querySelectorAll<HTMLElement>("#form span").forEach(span => span.classList.toggle("active", bar >= Number(span.dataset.start) && bar < Number(span.dataset.end)));
  }
}, 250);
window.addEventListener("pagehide", () => { clearInterval(monitor); stop(); clearClips(); });
display();
