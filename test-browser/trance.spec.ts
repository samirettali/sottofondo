import { test, expect } from "@playwright/test";
import { createAudition } from "../tools/procedural-score.ts";
import { TRANCE_VOICES } from "../src/composer/trance-voices.ts";

const SEEDS = [1, 2, 3, 4, 5, 6, 30, 0x9d2371fe];

test("trance scores and playback stay local, and versioned links restore the liked takes", async ({ page }, info) => {
  const errors: string[] = [], external: string[] = [], times: number[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") {
      external.push(url.href); return route.abort();
    }
    return route.continue();
  });
  await page.goto("/tools/procedural.html");
  await expect(page.locator("#palette")).toHaveValue("trance-1");
  await page.locator("#play").click();
  for (const seed of SEEDS) {
    await expect(page.locator("#next")).toBeEnabled();
    await page.locator(`#seeds button[data-seed="${seed}"]`).click();
    await expect(page.locator("#status")).toContainText("Playing new composer");
    expect(await page.evaluate(() => (window as any).proceduralScore.events)).toEqual(createAudition(seed, "new", false, new Set(), "trance-1").events);
    times.push(await page.evaluate(() => (window as any).proceduralGenerationMs));
    await expect.poll(() => page.evaluate(() => {
      const data = new Float32Array(2048);
      (window as any).proceduralPlayer.analyser.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    })).toBeGreaterThan(.001);
  }
  const before = await page.evaluate(() => JSON.stringify((window as any).proceduralScore.events));
  await page.locator('#parts [data-part="arp"]').click();
  expect(await page.evaluate(() => JSON.stringify((window as any).proceduralScore.events))).toBe(before);
  await page.locator("#play").click();
  const url = page.url(); await page.reload();
  await expect(page.locator("#palette")).toHaveValue("trance-1");
  expect(page.url()).toBe(url);
  for (const seed of [30, 0x9d2371fe]) {
    await page.goto(`/tools/procedural.html?s=${seed.toString(16)}&palette=character`);
    await expect(page.locator("#palette")).toHaveValue("character");
    expect(await page.evaluate(() => (window as any).proceduralScore.events)).toEqual(createAudition(seed).events);
  }
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await info.attach("trance-generation-ms", { body: JSON.stringify(times), contentType: "application/json" });
});

test("every selectable instrument produces audio through its real synth and effects", async ({ page }, info) => {
  test.setTimeout(180000);
  const cases = new Map<string, { seed: number; part: string }>();
  for (let seed = 0; seed < 256 && cases.size < Object.keys(TRANCE_VOICES).length; seed++) {
    const a = createAudition(seed, "new", false, new Set(), "trance-1");
    for (const [part, id] of Object.entries(a.trance!.voices)) if (!cases.has(id) && a.events.flat().some(n => n.laneId === part)) cases.set(id, { seed, part });
  }
  expect(cases.size).toBe(Object.keys(TRANCE_VOICES).length);
  const levels: { id: string; peak: number; rms: number; roughness: number }[] = [];
  for (const [id, value] of cases) {
    await page.goto("/tools/procedural.html");
    levels.push(await page.evaluate(async ({ id, seed, part }) => {
      const { createAudition } = await import("/tools/procedural-score.ts");
      const { ReferencePlayer } = await import("/tools/acid-reference-player.ts");
      const { Pattern } = await import("/node_modules/@strudel/core/pattern.mjs");
      const { Hap } = await import("/node_modules/@strudel/core/hap.mjs");
      const { TimeSpan } = await import("/node_modules/@strudel/core/timespan.mjs");
      const a = createAudition(seed, "new", false, new Set(), "trance-1");
      const original = a.events.flat().find(n => n.laneId === part)!;
      const event = { ...original, begin: 0, end: original.end - original.begin, sound: { ...original.sound, note: 69 } };
      a.pattern = new Pattern(({ span }) => {
        const whole = new TimeSpan(0, event.end), slice = whole.intersection(span);
        return slice && +slice.end > +slice.begin ? [new Hap(whole, slice, event)] : [];
      });
      a.localSamples = {};
      const ctx = new OfflineAudioContext(2, 48000 * 3, 48000), player = new ReferencePlayer(ctx, "original", seed, a);
      await player.scheduleRender(1);
      const buffer = await ctx.startRendering();
      let peak = 0, energy = 0, differences = 0;
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 1; i < data.length; i++) {
          peak = Math.max(peak, Math.abs(data[i]!)); energy += data[i]! * data[i]!;
          differences += (data[i]! - data[i - 1]!) ** 2;
        }
      }
      player.dispose();
      return { id, peak, rms: Math.sqrt(energy / (2 * buffer.length)), roughness: Math.sqrt(differences / energy) };
    }, { id, ...value }));
  }
  await info.attach("instrument-probes", { body: JSON.stringify(levels), contentType: "application/json" });
  for (const level of levels) {
    expect(level.peak, level.id).toBeGreaterThan(.0005);
    expect(level.peak, level.id).toBeLessThan(.9);
    expect(level.rms, level.id).toBeGreaterThan(.00002);
    expect(Number.isFinite(level.roughness), level.id).toBe(true);
  }
  // PCM differences, not just different labels or oscillator names.
  expect(new Set(levels.map(level => `${level.rms.toFixed(5)}/${level.roughness.toFixed(3)}`)).size).toBeGreaterThanOrEqual(22);
});

test("eight full trance arrangements render without clipping", async ({ page }, info) => {
  test.setTimeout(360000);
  await page.addInitScript(() => window.addEventListener("message", event => {
    if (event.origin === location.origin) (window as any).renderResult = event.data;
  }));
  const levels: { seed: string; peak: number; rms: number }[] = [];
  for (const seed of SEEDS) {
    await page.goto(`/tools/render-one.html?procedural=new&palette=trance-1&s=${seed.toString(16)}&begin=0&end=32`);
    await expect.poll(() => page.evaluate(() => !!(window as any).renderResult), { timeout: 80000 }).toBe(true);
    const result = await page.evaluate(() => {
      const r = (window as any).renderResult;
      return { type: r.type, error: r.message, peak: r.peak, rms: r.rms };
    });
    expect(result.type, result.error).toBe("rendered");
    levels.push({ seed: seed.toString(16), peak: result.peak, rms: result.rms });
  }
  await info.attach("trance-levels", { body: JSON.stringify(levels), contentType: "application/json" });
  levels.forEach(level => { expect(level.peak).toBeLessThan(.95); expect(level.rms).toBeGreaterThan(.01); });
});

test("the liked 9d2371fe seed exports a Character and Acid trance comparison", async ({ page }, info) => {
  test.setTimeout(140000);
  await page.goto("/tools/procedural.html?s=9d2371fe&palette=trance-1");
  await page.getByText("Compare versions", { exact: true }).click();
  await page.locator("#compare-trance").click();
  await expect(page.locator("#compare-trance")).toBeEnabled({ timeout: 120000 });
  await expect(page.locator("#status")).toContainText("Both recordings span 32 bars");
  await page.locator("#reveal").click();
  await expect(page.locator("article h3").first()).toHaveText("A — Acid trance");
  await expect(page.locator("article h3").last()).toHaveText("B — Character");
  for (const [index, version] of ["trance-1", "character"].entries()) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("article a").nth(index).click()]);
    await download.saveAs(info.outputPath(`seed-9d2371fe-${version}`, "clip.wav"));
  }
});
