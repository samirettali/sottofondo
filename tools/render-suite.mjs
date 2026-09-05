import { chromium } from "@playwright/test";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Generated listening artifacts, never source edits. Each isolated clip has a neutral name.
const output = resolve(process.env.RENDER_DIR ?? "test-results/listening");
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}) });
const page = await browser.newPage({ acceptDownloads: true });
const manifest = [];
try {
  await page.goto(`${process.env.RENDER_URL ?? "http://127.0.0.1:5198"}/tools/listen.html`);
  for (const genre of ["acid", "techno", "house"]) {
    for (const seed of ["1", "2", "cafe1234"]) {
      for (const section of ["opening", "development", "transition"]) {
        const entries = Array.from({ length: 3 }, (_, i) => {
          const label = String.fromCharCode(65 + i);
          return { genre, seed, section, label, version: ["legacy", "synth", "samples"][(i + parseInt(seed, 16) % 3) % 3],
            file: `${genre}/${seed}/${section}/${label}/clip.wav` };
        });
        if (process.env.RENDER_RESUME === "1" && (await Promise.all(entries.map(async entry =>
          (await stat(resolve(output, entry.file)).catch(() => null))?.size > 44))).every(Boolean)) {
          manifest.push(...entries);
          console.log(`${genre}/${seed}/${section}: existing clips`);
          continue;
        }
        await page.locator("#genre").selectOption(genre);
        await page.locator("#seed").selectOption(seed);
        await page.locator("#section").selectOption(section);
        await page.getByRole("button", { name: "Render comparison" }).click();
        await page.waitForFunction(() => !document.querySelector("#render").disabled, undefined, { timeout: 600000 });
        if (!(await page.locator("#status").textContent()).startsWith("Ready.")) throw new Error(await page.locator("#status").textContent());
        for (let i = 0; i < 3; i++) {
          const label = String.fromCharCode(65 + i);
          const directory = resolve(output, genre, seed, section, label);
          await mkdir(directory, { recursive: true });
          const pending = page.waitForEvent("download");
          await page.getByRole("link", { name: "Download WAV" }).nth(i).click();
          const download = await pending;
          await download.saveAs(resolve(directory, "clip.wav"));
          manifest.push({ genre, seed, section, label, version: download.suggestedFilename().split("-").at(-1).replace(".wav", ""),
            file: `${genre}/${seed}/${section}/${label}/clip.wav` });
        }
        console.log(`${genre}/${seed}/${section}: three clips`);
      }
    }
  }
  await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Rendered ${manifest.length} clips to ${output}`);
} finally { await browser.close(); }
