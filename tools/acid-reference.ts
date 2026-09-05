import source from "./references/acido-sotto-casa.strudel?raw";
import { parseSeed } from "../src/core/rng.ts";
import { ReferencePlayer } from "./acid-reference-player.ts";
import { VARIANTS, type ReferenceVariant } from "./acid-reference-score.ts";

const variant = document.querySelector<HTMLSelectElement>("#variant")!;
const seed = document.querySelector<HTMLInputElement>("#seed")!;
const play = document.querySelector<HTMLButtonElement>("#play")!;
const compare = document.querySelector<HTMLButtonElement>("#compare")!;
const reveal = document.querySelector<HTMLButtonElement>("#reveal")!;
const status = document.querySelector("#status")!;
const clips = document.querySelector("#clips")!;
const descriptions: Record<ReferenceVariant, string> = {
  original: "The four written phrases, ladder filter, short envelopes and original drum arrangement. No extra layers or mix effects.",
  biquad: "Only the filter model changes. Notes, envelopes, gains, drums and timing are identical to the original.",
  "303": "Only the acid voice changes to our continuous 303. It receives the original notes and parameter sequences; the drums and mix stay fixed.",
  generated: "Only the acid phrase changes to the current generator's notes and rests, in E. The original sound, dynamics, automation and drums stay fixed.",
  variation: "The seed swaps four inner notes. Anchors, rests, endings, pitch vocabulary, sound and drums stay fixed.",
};
// Numeric-looking object keys ("303") enumerate first; keep the audition order explicit.
for (const value of ["original","biquad","303","generated","variation"] as ReferenceVariant[]) {
  variant.add(new Option(VARIANTS[value], value));
}
let ctx: AudioContext | undefined, player: ReferencePlayer | undefined;
let rendering = false, loading = false;
const urls: string[] = [];
const refresh = () => {
  const current = variant.value as ReferenceVariant;
  document.querySelector("#description")!.textContent = descriptions[current];
  seed.disabled = loading || rendering || (current !== "generated" && current !== "variation");
  variant.disabled = loading || rendering;
  play.disabled = loading || rendering;
  play.textContent = player?.transport.running ? "Stop" : `Play ${VARIANTS[current].toLowerCase()}`;
  compare.disabled = loading || rendering || current === "original";
};
const stop = () => { player?.dispose(); player = undefined; refresh(); };
variant.addEventListener("change", () => { stop(); status.textContent = "Ready. Each take starts at bar 1."; });
seed.addEventListener("change", stop);
document.querySelector("#source")!.textContent = source;
document.querySelector("#copy")!.addEventListener("click", () => {
  void navigator.clipboard.writeText(source).then(() => { status.textContent = "Original code copied."; }, error => { status.textContent = String(error); });
});
play.addEventListener("click", () => {
  if (player?.transport.running) { stop(); status.textContent = "Stopped."; return; }
  loading = true; refresh(); status.textContent = "Loading the original instruments…";
  void (async () => {
    ctx ??= new AudioContext(); await ctx.resume();
    player = new ReferencePlayer(ctx, variant.value as ReferenceVariant, parseSeed(seed.value));
    await player.ready; player.start();
    if (import.meta.env.DEV) Object.assign(window, { referencePlayer: player });
    status.textContent = "Playing. Listen through the sixteen-bar cycle.";
  })().catch(error => { stop(); status.textContent = `Could not play this take: ${String(error)}. Try Play again.`; })
    .finally(() => { loading = false; refresh(); });
});
reveal.addEventListener("click", () => {
  clips.querySelectorAll<HTMLElement>("[data-take]").forEach(title => {
    title.textContent += ` — ${VARIANTS[title.dataset.take as ReferenceVariant]}`; delete title.dataset.take;
  });
  reveal.disabled = true;
});
compare.addEventListener("click", () => {
  stop(); rendering = true; refresh(); reveal.disabled = true;
  urls.splice(0).forEach(URL.revokeObjectURL); clips.textContent = "";
  const chosen = variant.value as ReferenceVariant, selectedSeed = parseSeed(seed.value);
  const takes: ReferenceVariant[] = selectedSeed % 2 ? [chosen, "original"] : ["original", chosen];
  void (async () => {
    for (const [index, take] of takes.entries()) {
      status.textContent = `Rendering ${index + 1}/2…`;
      const frame = document.createElement("iframe");
      const params = new URLSearchParams({ reference: take, s: seed.value, e: "strudel-2", v: "2", m: "auto", begin: "0", end: "16" });
      const result = await new Promise<{ bytes: ArrayBuffer; peak: number; rms: number }>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); frame.remove(); };
        const receive = (event: MessageEvent) => {
          if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
          if (event.data.type === "rendered") { cleanup(); resolve(event.data); }
          if (event.data.type === "render-error") { cleanup(); reject(new Error(event.data.message)); }
        };
        const timer = setTimeout(() => { cleanup(); reject(new Error("Render timed out")); }, 180000);
        window.addEventListener("message", receive); frame.src = `/tools/render-one.html?${params}`; document.body.append(frame);
      });
      if (!(result.peak > 0 && result.peak <= 1 && Number.isFinite(result.rms))) throw new Error("Silent or invalid render");
      const url = URL.createObjectURL(new Blob([result.bytes], { type: "audio/wav" })); urls.push(url);
      const article = document.createElement("article"), title = document.createElement("h2");
      title.textContent = String.fromCharCode(65 + index); title.dataset.take = take;
      const audio = document.createElement("audio"); audio.controls = true; audio.src = url;
      const link = document.createElement("a"); link.href = url; link.download = `acid-reference-${selectedSeed}-${take}.wav`; link.textContent = "Download WAV";
      article.dataset.peak = String(result.peak); article.dataset.rms = String(result.rms);
      article.append(title, audio, link); clips.append(article);
    }
    status.textContent = "Ready. Listen before revealing the takes. No normalisation."; reveal.disabled = false;
  })().catch(error => { status.textContent = String(error); }).finally(() => { rendering = false; refresh(); });
});
const monitor = setInterval(() => {
  if (player?.error) { status.textContent = player.error; stop(); }
}, 250);
window.addEventListener("pagehide", () => { clearInterval(monitor); stop(); urls.forEach(URL.revokeObjectURL); });
refresh();
