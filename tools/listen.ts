import { recipe, recipeParams } from "../src/recipe.ts";
import { parseSeed } from "../src/core/rng.ts";

const versions = ["legacy", "synth", "samples"] as const;
const positions: Record<string, Record<string, number>> = {
  acid: { opening: 0, development: 32, transition: 68 },
  techno: { opening: 0, development: 48, transition: 100 },
  house: { opening: 0, development: 32, transition: 52 },
};
const urls: string[] = [];
const main = document.querySelector("#clips")!;
const status = document.querySelector("#status")!;
const render = document.querySelector("#render") as HTMLButtonElement;
document.querySelector("#reveal")!.addEventListener("click", () => {
  document.querySelectorAll<HTMLElement>("[data-version]").forEach(node => { node.textContent += ` — ${node.dataset.version}`; delete node.dataset.version; });
});
render.addEventListener("click", () => {
  void (async () => {
    render.disabled = true;
    urls.splice(0).forEach(URL.revokeObjectURL); main.textContent = "";
    const genre = (document.querySelector("#genre") as HTMLSelectElement).value;
    const seed = parseSeed((document.querySelector("#seed") as HTMLSelectElement).value);
    const section = (document.querySelector("#section") as HTMLSelectElement).value;
    const begin = positions[genre]![section]!;
    const order = versions.map((_, i) => versions[(i + seed % 3) % 3]!);
    for (const [i, version] of order.entries()) {
      status.textContent = `Rendering ${i + 1}/3…`;
      const r = { ...recipe(genre, seed, version === "legacy"), soundMode: version === "samples" ? "samples" as const : "synth" as const };
      const params = recipeParams(r); params.set("begin", String(begin)); params.set("end", String(begin + 8));
      const frame = document.createElement("iframe");
      const result = await new Promise<{ bytes: ArrayBuffer; peak: number; rms: number }>((resolve, reject) => {
        const timeout = setTimeout(() => { cleanup(); reject(new Error("Render timed out")); }, 180000);
        const cleanup = () => { clearTimeout(timeout); window.removeEventListener("message", receive); frame.remove(); };
        const receive = (event: MessageEvent) => {
          if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
          if (event.data.type === "rendered") { cleanup(); resolve(event.data); }
          if (event.data.type === "render-error") { cleanup(); reject(new Error(event.data.message)); }
        };
        window.addEventListener("message", receive);
        frame.src = `/tools/render-one.html?${params}`; document.body.append(frame);
      });
      if (!(result.peak > 0 && Number.isFinite(result.rms))) throw new Error("Render is silent or invalid");
      const url = URL.createObjectURL(new Blob([result.bytes], { type: "audio/wav" })); urls.push(url);
      const article = document.createElement("article");
      const title = document.createElement("h2"); title.textContent = String.fromCharCode(65 + i); title.dataset.version = version;
      const audio = document.createElement("audio"); audio.controls = true; audio.src = url;
      const download = document.createElement("a"); download.href = url; download.download = `${genre}-${seed}-${section}-${version}.wav`; download.textContent = "Download WAV";
      article.append(title, audio, download); main.append(article);
    }
    status.textContent = "Ready. Each clip is eight bars; the transition straddles a section boundary.";
  })().catch(error => { status.textContent = String(error); }).finally(() => { render.disabled = false; });
});
