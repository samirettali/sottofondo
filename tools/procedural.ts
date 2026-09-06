import { formatSeed, parseSeed } from "../src/core/rng.ts";
import { AUDITION_SEEDS } from "../src/composer/procedural.ts";
import { ReferencePlayer } from "./acid-reference-player.ts";
import { createAudition, PARTS, readPalette, type Palette, type Take } from "./procedural-score.ts";
import { TRANCE_VOICES } from "../src/composer/trance-voices.ts";
import { readAcidSettings, type AcidVoice, type AcidDrive } from "../src/audio/acid-mono.ts";
import { withAcidVoice } from "./acid-voice-score.ts";

const seed = document.querySelector<HTMLInputElement>("#seed")!;
const take = document.querySelector<HTMLSelectElement>("#take")!;
const palette = document.querySelector<HTMLSelectElement>("#palette")!;
const acidVoice = document.querySelector<HTMLSelectElement>("#acid-voice")!;
const acidDrive = document.querySelector<HTMLSelectElement>("#acid-drive")!;
const fixed = document.querySelector<HTMLInputElement>("#fixed")!;
const play = document.querySelector<HTMLButtonElement>("#play")!;
const status = document.querySelector<HTMLElement>("#status")!;
const reveal = document.querySelector<HTMLButtonElement>("#reveal")!;
const clips = document.querySelector<HTMLElement>("#clips")!;
const params = new URLSearchParams(location.search);
seed.value = formatSeed(parseSeed(params.get("s") ?? "1"));
if (params.get("take") === "previous") take.value = "previous";
// Existing seed links retain Character. A fresh visit opens the new version.
try { palette.value = readPalette(params.get("palette"), params.has("s") || params.has("take") ? "character" : "trance-1"); }
catch (error) { document.querySelector("main")!.textContent = String(error); throw error; }
fixed.checked = params.get("fixed") === "1";
const initialAcid = readAcidSettings(params.get("voice"), params.get("drive"));
acidVoice.value = initialAcid.voice; acidDrive.value = initialAcid.drive;
const muted = new Set<string>(), urls: string[] = [];
let busy = false, ctx: AudioContext | undefined, player: ReferencePlayer | undefined;
let audition = makeAudition();
function makeAudition() {
  const begin = performance.now();
  const base = createAudition(parseSeed(seed.value), take.value as Take, fixed.checked, muted, palette.value as Palette);
  const result = withAcidVoice(base, readAcidSettings(acidVoice.value, acidDrive.value), muted);
  Object.assign(window, { proceduralGenerationMs: performance.now() - begin, proceduralScore: result });
  return result;
}
function update() {
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input,button,select").forEach(el => { el.disabled = busy; });
  reveal.disabled = busy || !clips.querySelector("[data-take]");
  palette.disabled = busy || fixed.checked;
  acidDrive.disabled = busy || acidVoice.value === "current";
  document.querySelector<HTMLButtonElement>("#compare-sound")!.disabled = busy || fixed.checked;
  document.querySelector<HTMLButtonElement>("#compare-trance")!.disabled = busy || fixed.checked;
  play.textContent = player?.transport.running ? "Stop" : "Play";
  document.querySelectorAll<HTMLButtonElement>("#seeds button").forEach(button => button.setAttribute("aria-pressed", String(parseSeed(seed.value) === Number(button.dataset.seed))));
  const query = new URLSearchParams({ s: seed.value, take: take.value, palette: palette.value, fixed: fixed.checked ? "1" : "0" });
  if (acidVoice.value !== "current" || acidDrive.value !== "clean") { query.set("voice", acidVoice.value); query.set("drive", acidDrive.value); }
  history.replaceState(null, "", `${location.pathname}?${query}`);
}
function display() {
  const id = audition.composition.identity;
  const key = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][fixed.checked ? 4 : id.key];
  const character = audition.character;
  const harmony = audition.trance && { wash: "sustained chords", gated: "gated chords", stabs: "chord stabs" }[audition.trance.harmony];
  const instruments = audition.trance ? `Acid trance · ${character!.kick.model} kick${take.value === "new" ? ` · ${audition.trance.motion} lead · ${harmony}` : " · previous arrangement"}` : character ? `${character.kick.model} kick · ${id.wave} acid${take.value === "new" && character.arp ? " · arpeggio" : ""}${take.value === "new" && character.pad ? " · chords" : ""}` : fixed.checked ? "sawtooth / hard kit" : `${id.wave} / ${id.kit} kit`;
  document.querySelector("#identity")!.textContent = `${audition.bpm} BPM · ${key} · ${take.value === "new" ? id.mode : "Minor blues"} · ${instruments}`;
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
    const instrument = audition.trance?.voices[part as keyof typeof audition.trance.voices];
    const roles: Partial<Record<typeof part, string>> = { arp: "Lead", pad: "Chords", answer: "Reply", pulse: "Percussion", texture: "Transition" };
    const button = document.createElement("button"); button.textContent = instrument ? `${roles[part]} · ${TRANCE_VOICES[instrument].label}` : part;
    button.dataset.part = part; button.setAttribute("aria-pressed", String(!muted.has(part)));
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
for (const value of [...AUDITION_SEEDS, 30, 0x9d2371fe]) {
  const button = document.createElement("button"); button.textContent = value > 6 ? formatSeed(value) : String(value); button.dataset.seed = String(value);
  button.addEventListener("click", () => { seed.value = formatSeed(value); take.value = "new"; void change(); });
  document.querySelector("#seeds")!.append(button);
}
seed.addEventListener("change", () => { void change(); });
take.addEventListener("change", () => { void change(); });
palette.addEventListener("change", () => { void change(); });
fixed.addEventListener("change", () => { void change(); });
acidVoice.addEventListener("change", () => { void change(); });
acidDrive.addEventListener("change", () => { void change(); });
play.addEventListener("click", () => { if (player?.transport.running) { stop(); status.textContent = "Stopped."; } else void start(); });
document.querySelector("#next")!.addEventListener("click", () => { seed.value = formatSeed((parseSeed(seed.value) + 1) >>> 0); take.value = "new"; void change(); });
document.querySelector("#link")!.addEventListener("click", () => {
  void navigator.clipboard.writeText(location.href).then(() => { status.textContent = "Link copied."; }, error => { status.textContent = String(error); });
});
reveal.addEventListener("click", () => {
  clips.querySelectorAll<HTMLElement>("[data-take]").forEach(title => { title.textContent += ` — ${title.dataset.take}`; delete title.dataset.take; }); update();
});
function compare(kind: "composer" | "sound" | "trance" | "articulation") {
  stop(); clearClips(); busy = true; update();
  void (async () => {
    const versions: { take: Take; palette: Palette; label: string; file: string; voice?: AcidVoice; drive?: AcidDrive }[] = kind === "articulation" ? [
      { take: take.value as Take, palette: palette.value as Palette, voice: "mono-step-1", drive: acidDrive.value as AcidDrive, label: `Mono · separate notes · ${acidDrive.value}`, file: `mono-step-1-${acidDrive.value}` },
      { take: take.value as Take, palette: palette.value as Palette, voice: "mono-link-1", drive: acidDrive.value as AcidDrive, label: `Mono · linked notes · ${acidDrive.value}`, file: `mono-link-1-${acidDrive.value}` },
    ] : kind === "composer" ? [
      { take: "previous", palette: palette.value as Palette, label: "Previous composer", file: "previous" },
      { take: "new", palette: palette.value as Palette, label: "New composer", file: "new" },
    ] : kind === "trance" ? [
      { take: take.value as Take, palette: "character", label: "Character", file: "character" },
      { take: take.value as Take, palette: "trance-1", label: "Acid trance", file: "trance-1" },
    ] : [
      { take: take.value as Take, palette: "original", label: "Original sound", file: "original" },
      { take: take.value as Take, palette: "character", label: "Character sound", file: "character" },
    ];
    if (parseSeed(seed.value) % 2 === 0) versions.reverse();
    for (const [index, version] of versions.entries()) {
      status.textContent = `Rendering ${index + 1}/2…`;
      const query = new URLSearchParams({ procedural: version.take, palette: version.palette, s: seed.value, fixed: fixed.checked ? "1" : "0", begin: "0", end: "32" });
      // Existing version comparisons retain their original execution. The new
      // experiment compares articulation through one mono graph and drive setting.
      if (version.voice) { query.set("voice", version.voice); query.set("drive", version.drive!); }
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
      title.textContent = String.fromCharCode(65 + index); title.dataset.take = version.label;
      audio.controls = true; audio.src = url; link.href = url; link.download = `composer-${seed.value}-${version.file}.wav`; link.textContent = "Download WAV";
      article.dataset.peak = String(result.peak); article.dataset.rms = String(result.rms); article.append(title, audio, link); clips.append(article);
    }
    status.textContent = "Ready. Both recordings span 32 bars, without normalisation.";
  })().catch(error => { status.textContent = String(error); }).finally(() => { busy = false; update(); });
}
document.querySelector("#compare")!.addEventListener("click", () => compare("composer"));
document.querySelector("#compare-sound")!.addEventListener("click", () => compare("sound"));
document.querySelector("#compare-trance")!.addEventListener("click", () => compare("trance"));
document.querySelector("#compare-articulation")!.addEventListener("click", () => compare("articulation"));
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
