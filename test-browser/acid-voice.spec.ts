import { test, expect } from "@playwright/test";
import { createAudition } from "../tools/procedural-score.ts";

test("mono voice links restore, all treatments play locally, and muting preserves the score", async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.goto("/tools/procedural.html?s=9d2371fe&palette=character&voice=mono-link-1&drive=grit");
  await expect(page.locator("#acid-voice")).toHaveValue("mono-link-1");
  await expect(page.locator("#acid-drive")).toHaveValue("grit");
  expect(await page.evaluate(() => (window as any).proceduralScore.events)).toEqual(createAudition(0x9d2371fe).events);
  await page.locator("#play").click();
  for (const voice of ["mono-link-1", "mono-step-1", "current"]) {
    await expect(page.locator("#acid-voice")).toBeEnabled();
    await page.locator("#acid-voice").selectOption(voice);
    for (const drive of voice === "current" ? ["bite"] : ["clean", "grit", "bite"]) {
      await expect(page.locator("#play")).toBeEnabled();
      if (voice !== "current") await page.locator("#acid-drive").selectOption(drive);
      await expect(page.locator("#status")).toContainText("Playing new composer");
      await expect.poll(() => page.evaluate(() => {
        const samples = new Float32Array(2048);
        (window as any).proceduralPlayer.analyser.getFloatTimeDomainData(samples);
        return Math.max(...samples.map(Math.abs));
      })).toBeGreaterThan(.002);
    }
  }
  await page.locator("#acid-voice").selectOption("mono-link-1");
  await expect(page.locator("#play")).toBeEnabled();
  const before = await page.evaluate(() => JSON.stringify((window as any).proceduralScore.events));
  await page.locator('#parts [data-part="acid"]').click();
  expect(await page.evaluate(() => JSON.stringify((window as any).proceduralScore.events))).toBe(before);
  await page.locator("#play").click();
  const url = page.url(); await page.reload(); expect(page.url()).toBe(url);
  await expect(page.locator("#acid-voice")).toHaveValue("mono-link-1");
  await expect(page.locator("#acid-drive")).toHaveValue("bite");
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test("isolated acid is audible and articulation and drive produce different waveforms", async ({ page }, info) => {
  test.setTimeout(180000);
  const results: { seed: number; voice: string; drive: string; peak: number; rms: number; difference: number; tail: number }[] = [];
  for (const seed of [30, 0x9d2371fe]) for (const voice of ["mono-step-1", "mono-link-1"]) for (const drive of ["clean", "grit", "bite"]) {
    await page.goto("/tools/procedural.html");
    const result = await page.evaluate(async ({ seed, voice, drive }) => {
      const { createAudition, PARTS } = await import("/tools/procedural-score.ts");
      const { withAcidVoice } = await import("/tools/acid-voice-score.ts");
      const { ReferencePlayer } = await import("/tools/acid-reference-player.ts");
      const muted = new Set(PARTS.filter(p => p !== "acid"));
      const a = withAcidVoice(createAudition(seed, "new", false, muted), { voice, drive }, muted);
      a.localSamples = {};
      const ctx = new OfflineAudioContext(2, 48000 * 10, 48000);
      const player = new ReferencePlayer(ctx, "original", seed, a);
      await player.scheduleRender(4);
      const buffer = await ctx.startRendering();
      let peak = 0, energy = 0, difference = 0, tail = 0;
      const data = buffer.getChannelData(0);
      for (let i = 1; i < data.length; i++) {
        peak = Math.max(peak, Math.abs(data[i]!)); energy += data[i]! ** 2;
        difference += (data[i]! - data[i - 1]!) ** 2;
        if (i >= data.length - 24000) tail += data[i]! ** 2;
      }
      player.dispose();
      return { seed, voice, drive, peak, rms: Math.sqrt(energy / data.length), difference: Math.sqrt(difference / data.length), tail: Math.sqrt(tail / 24000) };
    }, { seed, voice, drive });
    results.push(result);
    expect(result.peak).toBeGreaterThan(.015); expect(result.peak).toBeLessThan(.8);
    expect(result.rms).toBeGreaterThan(.003);
    expect(result.tail).toBeLessThan(result.rms * .01);
  }
  await info.attach("isolated-acid-levels", { body: JSON.stringify(results), contentType: "application/json" });
  expect(new Set(results.map(r => `${r.rms.toFixed(6)}/${r.difference.toFixed(6)}`)).size).toBe(results.length);
});

test("liked seed exports the full articulation comparison and reveals the actual takes", async ({ page }, info) => {
  test.setTimeout(150000);
  await page.goto("/tools/procedural.html?s=9d2371fe&palette=character&voice=mono-link-1&drive=grit");
  await page.getByText("Compare versions", { exact: true }).click();
  await page.locator("#compare-articulation").click();
  await expect(page.locator("#compare-articulation")).toBeEnabled({ timeout: 120000 });
  await expect(page.locator("#status")).toContainText("Both recordings span 32 bars");
  await page.locator("#reveal").click();
  await expect(page.locator("article h3").first()).toHaveText("A — Mono · linked notes · grit");
  await expect(page.locator("article h3").last()).toHaveText("B — Mono · separate notes · grit");
  for (const [index, version] of ["linked", "separate"].entries()) {
    const article = page.locator("article").nth(index);
    expect(Number(await article.getAttribute("data-peak"))).toBeLessThan(.95);
    expect(Number(await article.getAttribute("data-rms"))).toBeGreaterThan(.01);
    const [download] = await Promise.all([page.waitForEvent("download"), article.locator("a").click()]);
    await download.saveAs(info.outputPath(`seed-9d2371fe-${version}`, "clip.wav"));
  }
});

test("mono treatments stay bounded through both palettes, repeated arrangements and cropped renders", async ({ page }, info) => {
  test.setTimeout(240000);
  await page.addInitScript(() => window.addEventListener("message", event => {
    if (event.origin === location.origin) (window as any).renderResult = event.data;
  }));
  const levels = [];
  // Include the second loop: oscillator, delay and filter remain continuous while
  // the addressed articulation plan repeats. begin crops after a full preroll.
  for (const [seed, palette, drive, end, begin] of [
    ["0000001e", "character", "bite", 64, 32],
    ["0000001e", "trance-1", "clean", 32, 0],
    ["9d2371fe", "trance-1", "bite", 32, 0],
    ["9d2371fe", "trance-1", "grit", 32, 0],
  ] as const) {
    await page.goto(`/tools/render-one.html?procedural=new&s=${seed}&palette=${palette}&voice=mono-link-1&drive=${drive}&end=${end}&begin=${begin}`);
    await expect.poll(() => page.evaluate(() => !!(window as any).renderResult), { timeout: 85000 }).toBe(true);
    const r = await page.evaluate(() => {
      const result = (window as any).renderResult;
      return { type: result.type, error: result.message, peak: result.peak, rms: result.rms };
    });
    expect(r.type, r.error).toBe("rendered"); expect(r.peak).toBeLessThan(.95); expect(r.rms).toBeGreaterThan(.01);
    levels.push({ seed, palette, drive, end, begin, ...r });
  }
  await info.attach("full-mono-mixes", { body: JSON.stringify(levels), contentType: "application/json" });
});
