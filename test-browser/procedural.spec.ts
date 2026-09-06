import { test, expect } from "@playwright/test";
import { createAudition } from "../tools/procedural-score.ts";

test("browser scores match Node for six seeds with no external requests", async ({ page }, info) => {
  const external: string[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  const times: number[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    await page.goto(`/tools/procedural.html?s=${seed}`);
    await expect(page.locator("#take")).toHaveValue("new");
    await expect(page.locator("#identity")).toContainText("BPM");
    expect(await page.evaluate(() => (window as any).proceduralScore.events)).toEqual(createAudition(seed).events);
    times.push(await page.evaluate(() => (window as any).proceduralGenerationMs));
  }
  expect(external).toEqual([]);
  await info.attach("generation-ms", { body: JSON.stringify(times), contentType: "application/json" });
});

test("six seeds play locally, controls restore from the URL and mute does not recompose", async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.goto("/tools/procedural.html");
  await page.locator("#play").click();
  for (let seed = 1; seed <= 6; seed++) {
    await expect(page.locator("#next")).toBeEnabled();
    await page.locator(`#seeds button[data-seed="${seed}"]`).click();
    await expect(page.locator("#status")).toContainText("Playing new composer.");
    await expect.poll(() => page.evaluate(() => {
      const samples = new Float32Array(2048);
      (window as any).proceduralPlayer.analyser.getFloatTimeDomainData(samples);
      return Math.max(...samples.map(Math.abs));
    })).toBeGreaterThan(.001);
  }
  const before = await page.evaluate(() => JSON.stringify((window as any).proceduralScore.events));
  await page.locator("#parts button", { hasText: /^acid$/ }).click();
  expect(await page.evaluate(() => JSON.stringify((window as any).proceduralScore.events))).toBe(before);
  await page.locator("#parts button", { hasText: /^acid$/ }).click();
  await page.locator("#take").selectOption("previous");
  await expect(page.locator("#status")).toContainText("Playing previous composer.");
  await page.locator('#seeds button[data-seed="30"]').click();
  await page.locator("#palette").selectOption("original");
  await expect(page.locator("#identity")).toContainText("square / dry kit");
  expect(await page.evaluate(() => (window as any).proceduralScore.events)).toEqual(createAudition(30, "new", false, new Set(), "original").events);
  await page.getByText("Compare versions", { exact: true }).click();
  await page.locator("#fixed").check();
  await expect(page.locator("#identity")).toContainText("138 BPM · E");
  await expect(page.locator("#play")).toBeEnabled();
  await page.locator("#play").click();
  await expect(page.locator("#status")).toHaveText("Stopped.");
  const url = page.url(); await page.reload();
  await expect(page.locator("#seed")).toHaveValue("0000001e");
  await expect(page.locator("#palette")).toHaveValue("original");
  await expect(page.locator("#palette")).toBeDisabled();
  await expect(page.locator("#fixed")).toBeChecked();
  await expect(page.locator("#take")).toHaveValue("new");
  expect(page.url()).toEqual(url); expect(errors).toEqual([]); expect(external).toEqual([]);
});

test("a failed local sample can be retried without substituting a sound", async ({ page }) => {
  let fail = true;
  await page.route("**/samples/v2/*.json", route => {
    if (fail) { fail = false; return route.fulfill({ status: 503, body: "Unavailable" }); }
    return route.continue();
  });
  await page.goto("/tools/procedural.html"); await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("Could not load");
  await expect(page.locator("#play")).toBeEnabled(); await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("Playing new composer.");
});

test("complete A/B exports and all six published seeds are audible and unclipped", async ({ page }, info) => {
  test.setTimeout(240000);
  await page.goto("/tools/procedural.html?s=1");
  await page.getByText("Compare versions", { exact: true }).click(); await page.locator("#compare").click();
  await expect(page.locator("#compare")).toBeEnabled({ timeout: 100000 });
  await expect(page.locator("#status")).toContainText("Both recordings span 32 bars");
  await expect(page.locator("article h3").first()).toHaveText("A");
  await page.locator("#reveal").click();
  await expect(page.locator("article h3").first()).toHaveText("A — Previous composer");
  await expect(page.locator("article h3").last()).toHaveText("B — New composer");
  const levels: { seed: number; take: string; peak: number; rms: number }[] = await page.locator("article").evaluateAll(articles => articles.map((a, i) => ({
    seed: 1, take: i ? "new" : "previous", peak: Number((a as HTMLElement).dataset.peak), rms: Number((a as HTMLElement).dataset.rms),
  })));
  for (const [index, version] of ["previous", "new"].entries()) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("article a").nth(index).click()]);
    await download.saveAs(info.outputPath(`seed-1-${version}`, "clip.wav"));
  }
  await page.addInitScript(() => window.addEventListener("message", event => {
    if (event.origin === location.origin) (window as any).renderResult = event.data;
  }));
  for (let seed = 2; seed <= 6; seed++) {
    await page.goto(`/tools/render-one.html?procedural=new&s=${seed}&begin=0&end=32`);
    await expect.poll(() => page.evaluate(() => !!(window as any).renderResult), { timeout: 60000 }).toBe(true);
    expect(await page.evaluate(() => (window as any).renderResult.type)).toBe("rendered");
    const result = await page.evaluate(() => ({ peak: (window as any).renderResult.peak, rms: (window as any).renderResult.rms }));
    levels.push({ seed, take: "new", ...result });
  }
  levels.forEach(level => { expect(level.peak).toBeGreaterThan(.05); expect(level.peak).toBeLessThan(.95); expect(level.rms).toBeGreaterThan(.005); });
  await info.attach("levels", { body: JSON.stringify(levels), contentType: "application/json" });
});

test("the liked seed can compare original and character sound as complete unnormalised WAVs", async ({ page }, info) => {
  test.setTimeout(140000);
  await page.goto("/tools/procedural.html?s=0000001e&palette=original");
  await page.getByText("Compare versions", { exact: true }).click();
  await page.locator("#compare-sound").click();
  await expect(page.locator("#compare-sound")).toBeEnabled({ timeout: 100000 });
  await expect(page.locator("#status")).toContainText("Both recordings span 32 bars");
  await page.locator("#reveal").click();
  await expect(page.locator("article h3").first()).toHaveText("A — Character sound");
  await expect(page.locator("article h3").last()).toHaveText("B — Original sound");
  const levels = await page.locator("article").evaluateAll(articles => articles.map(a => ({
    peak: Number((a as HTMLElement).dataset.peak), rms: Number((a as HTMLElement).dataset.rms),
  })));
  for (const [index, version] of ["character", "original"].entries()) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("article a").nth(index).click()]);
    await download.saveAs(info.outputPath(`seed-1e-${version}`, "clip.wav"));
  }
  levels.forEach(level => { expect(level.peak).toBeLessThan(.95); expect(level.rms).toBeGreaterThan(.005); });
  await info.attach("seed-1e-levels", { body: JSON.stringify(levels), contentType: "application/json" });
});

test("physical kick models render different tails and dispose scheduled sources", async ({ page }, info) => {
  await page.goto("/tools/procedural.html");
  const results = await page.evaluate(async () => {
    const { playCharacterKick } = await import("/src/audio/character-kick.ts");
    const { createComposition } = await import("/src/composer/procedural.ts");
    const { createCharacter } = await import("/src/composer/character.ts");
    const measurements = [];
    for (const seed of [1, 2, 3]) {
      const ctx = new OfflineAudioContext(1, 48000, 48000), design = createCharacter(createComposition(seed)).kick;
      let ended = 0;
      playCharacterKick(ctx, ctx.destination, .05, design, .35, () => { ended++; });
      const cancelled = playCharacterKick(ctx, ctx.destination, .7, design, .35, () => { ended++; });
      cancelled.dispose(); cancelled.dispose();
      const buffer = await ctx.startRendering(), data = buffer.getChannelData(0);
      const rms = (start: number, end: number) => {
        const samples = data.slice(Math.floor(start * 48000), Math.floor(end * 48000));
        return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
      };
      measurements.push({ model: design.model, attack: rms(.05, .09), tail: rms(.2, .3), cancelled: rms(.7, 1), ended });
    }
    return measurements;
  });
  results.forEach(result => { expect(result.attack).toBeGreaterThan(.01); expect(result.cancelled).toBeLessThan(.00001); expect(result.ended).toBe(2); });
  expect(results[0]!.tail).toBeLessThan(.00001);
  expect(results[1]!.tail).toBeGreaterThan(.001);
  expect(results[2]!.tail).toBeGreaterThan(.001);
  await info.attach("kick-tails", { body: JSON.stringify(results), contentType: "application/json" });
});

test("acid, arpeggio and chords remain audible through their actual effect chains", async ({ page }, info) => {
  test.setTimeout(120000);
  const levels: { seed: number; part: string; peak: number; rms: number }[] = [];
  for (const seed of [1, 30]) for (const part of ["acid", "arp", "pad"]) {
    // Each navigation isolates Superdough's global context and node pools.
    await page.goto("/tools/procedural.html");
    levels.push(await page.evaluate(async ({ seed, part }) => {
      const { createAudition, PARTS } = await import("/tools/procedural-score.ts");
      const { ReferencePlayer } = await import("/tools/acid-reference-player.ts");
      const a = createAudition(seed, "new", false, new Set(PARTS.filter(p => p !== part)));
      const seconds = 240 / a.bpm, ctx = new OfflineAudioContext(2, Math.ceil((seconds * 4 + 1) * 48000), 48000);
      const player = new ReferencePlayer(ctx, "original", seed, a);
      await player.scheduleRender(4);
      const audio = await ctx.startRendering();
      let peak = 0, squares = 0, count = 0;
      for (let channel = 0; channel < 2; channel++) {
        for (const value of audio.getChannelData(channel).subarray(Math.round(seconds * 2 * 48000), Math.round(seconds * 4 * 48000))) {
          peak = Math.max(peak, Math.abs(value)); squares += value * value; count++;
        }
      }
      player.dispose(); return { seed, part, peak, rms: Math.sqrt(squares / count) };
    }, { seed, part }));
  }
  levels.forEach(level => {
    expect(level.peak).toBeLessThan(.9);
    expect(level.rms).toBeGreaterThan(level.part === "acid" ? .005 : .001);
  });
  await info.attach("isolated-voices", { body: JSON.stringify(levels), contentType: "application/json" });
});
