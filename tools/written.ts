import { createPiece, PIECE_IDS, readPiece, type PieceId } from "./authored-pieces-score.ts";
import { ReferencePlayer } from "./acid-reference-player.ts";

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const play = $<HTMLButtonElement>("#play"), status = $("#status"), muted = new Set<string>();
let id: PieceId;
try { id = readPiece(new URLSearchParams(location.search).get("piece")); }
catch (error) { $("main").textContent = String(error); throw error; }
let score = createPiece(id, muted), player: ReferencePlayer | undefined, ctx: AudioContext | undefined;
let busy = false, renderFrame: HTMLIFrameElement | undefined, clipUrl: string | undefined;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const core = () => new Set(id === "ferro-1" ? ["kick", "acid"] : ["kick", "acid", "lead"]);
for (const key of PIECE_IDS) {
  const piece = createPiece(key), button = document.createElement("button");
  button.className = "piece"; button.dataset.piece = key;
  for (const [className, text] of [["number", key === "ferro-1" ? "01" : "02"], ["title", piece.title],
    ["meta", `${piece.bpm} BPM · ${clock(piece.bars * 240 / piece.bpm)}`], ["description", piece.description]]) {
    const span = document.createElement("span"); span.className = className!; span.textContent = text!; button.append(span);
  }
  button.addEventListener("click", () => {
    if (busy || id === key) return;
    stop(); id = key; muted.clear(); score = createPiece(id, muted); clearDownload(); display();
    status.textContent = `${score.title} selected. Press Play.`;
  });
  $("#pieces").append(button);
}
function expose() { Object.assign(window, { writtenScore: score, writtenPlayer: player }); }
function update() {
  document.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = busy; });
  document.querySelectorAll<HTMLButtonElement>("[data-piece]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.piece === id)));
  document.querySelectorAll<HTMLButtonElement>("[data-part]").forEach(button => button.setAttribute("aria-pressed", String(!muted.has(button.dataset.part!))));
  $("#full").setAttribute("aria-pressed", String(muted.size === 0));
  $("#focus").setAttribute("aria-pressed", String(Object.keys(score.parts).every(part => muted.has(part) === !core().has(part))));
  play.textContent = player?.transport.running ? "Stop" : `Play ${score.title}`;
  history.replaceState(null, "", `${location.pathname}?piece=${id}`);
  expose();
}
function position() {
  const cycle = Math.min(player?.transport.cycle ?? 0, score.bars);
  $("#position").textContent = `${clock(cycle * 240 / score.bpm)} / ${clock(score.bars * 240 / score.bpm)}`;
  $("#progress span").style.width = `${cycle / score.bars * 100}%`;
  $("#form").querySelectorAll<HTMLElement>("span").forEach((el, index) => {
    const section = score.sections[index]!;
    el.classList.toggle("active", !!player?.transport.running && cycle >= section.begin && cycle < section.end);
  });
  const section = score.sections.find(s => cycle >= s.begin && cycle < s.end) ?? score.sections.at(-1)!;
  $("#section-status").textContent = `${section.name} · Bar ${Math.min(score.bars, Math.floor(cycle) + 1)} of ${score.bars}`;
}
function display() {
  $("#form").replaceChildren(); $("#parts").replaceChildren();
  for (const [index, section] of score.sections.entries()) {
    const span = document.createElement("span"); span.textContent = section.name;
    span.dataset.index = String(index + 1).padStart(2, "0"); span.setAttribute("aria-label", section.name);
    span.style.flex = String(section.end - section.begin); span.title = `Bars ${section.begin + 1}–${section.end}`;
    $("#form").append(span);
  }
  for (const [part, name] of Object.entries(score.parts)) {
    const button = document.createElement("button"); button.textContent = name; button.dataset.part = part;
    button.addEventListener("click", () => { if (muted.has(part)) muted.delete(part); else muted.add(part); update(); });
    $("#parts").append(button);
  }
  $("#focus-help").textContent = id === "ferro-1" ? "Focus keeps the kick and the acid riff. Switch back to hear what the accompaniment adds." :
    "Focus keeps the kick, acid bass and main sequence. Switch back to hear the atmosphere and replies.";
  update(); position();
}
function stop() { player?.dispose(); player = undefined; update(); }
async function start() {
  busy = true; update(); status.textContent = "Loading local instruments…";
  try {
    ctx ??= new AudioContext(); await ctx.resume();
    player = new ReferencePlayer(ctx, "original", 0, score); await player.ready; player.start();
    status.textContent = `Playing ${score.title}. Instrument changes apply to upcoming notes.`;
  } catch (error) { stop(); status.textContent = String(error); }
  finally { busy = false; update(); }
}
play.addEventListener("click", () => {
  if (player?.transport.running) { stop(); status.textContent = "Stopped. Play starts from the beginning."; }
  else void start();
});
$("#full").addEventListener("click", () => { muted.clear(); update(); });
$("#focus").addEventListener("click", () => {
  muted.clear(); for (const part of Object.keys(score.parts)) if (!core().has(part)) muted.add(part); update();
});
$("#link").addEventListener("click", () => {
  void navigator.clipboard.writeText(location.href).then(() => { status.textContent = "Composition link copied."; })
    .catch(() => { status.textContent = "Copy the composition link from the address bar."; });
});
function clearDownload() {
  if (clipUrl) URL.revokeObjectURL(clipUrl); clipUrl = undefined;
  const link = $<HTMLAnchorElement>("#download"); link.hidden = true; link.removeAttribute("href");
}
$("#export").addEventListener("click", () => {
  stop(); clearDownload(); busy = true; update(); status.textContent = "Rendering the full piece with all instruments…";
  renderFrame = document.createElement("iframe");
  const frame = renderFrame;
  const cleanup = () => { clearTimeout(timer); window.removeEventListener("message", receive); frame.remove(); renderFrame = undefined; busy = false; update(); };
  const receive = (event: MessageEvent) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data.type !== "rendered" && event.data.type !== "render-error") return;
    cleanup();
    if (event.data.type === "render-error") { status.textContent = event.data.message; return; }
    clipUrl = URL.createObjectURL(new Blob([event.data.bytes], { type: "audio/wav" }));
    const link = $<HTMLAnchorElement>("#download"); link.href = clipUrl; link.download = `${id}.wav`;
    link.textContent = `Download ${score.title} · WAV`; link.hidden = false;
    status.textContent = "Recording ready. Includes all instruments and the ending, at the playback gain.";
  };
  const timer = setTimeout(() => { cleanup(); status.textContent = "Rendering timed out. Try Export WAV again."; }, 180000);
  window.addEventListener("message", receive);
  frame.src = `/tools/render-one.html?piece=${id}&begin=0&end=${score.bars}`; document.body.append(frame);
});
const monitor = setInterval(() => {
  if (player?.error) { const error = player.error; stop(); status.textContent = error; }
  else if (player?.transport.running && player.transport.cycle >= score.bars) {
    position(); stop(); status.textContent = `${score.title} finished. Play starts from the beginning.`; return;
  }
  if (player?.transport.running) position();
}, 100);
window.addEventListener("pagehide", () => { clearInterval(monitor); player?.dispose(); renderFrame?.remove(); clearDownload(); void ctx?.close(); });
display();
