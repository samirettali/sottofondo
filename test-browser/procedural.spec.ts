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
  await page.getByText("Compare compositions", { exact: true }).click();
  await page.locator("#fixed").check();
  await expect(page.locator("#identity")).toContainText("138 BPM · E");
  await expect(page.locator("#play")).toBeEnabled();
  await page.locator("#play").click();
  await expect(page.locator("#status")).toHaveText("Stopped.");
  const url = page.url(); await page.reload();
  await expect(page.locator("#seed")).toHaveValue("00000006");
  await expect(page.locator("#fixed")).toBeChecked();
  await expect(page.locator("#take")).toHaveValue("previous");
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
  await page.getByText("Compare compositions", { exact: true }).click(); await page.locator("#compare").click();
  await expect(page.locator("#status")).toContainText("Both recordings span 32 bars", { timeout: 100000 });
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
    await expect.poll(() => page.evaluate(() => (window as any).renderResult?.type), { timeout: 60000 }).toBe("rendered");
    const result = await page.evaluate(() => ({ peak: (window as any).renderResult.peak, rms: (window as any).renderResult.rms }));
    levels.push({ seed, take: "new", ...result });
  }
  levels.forEach(level => { expect(level.peak).toBeGreaterThan(.05); expect(level.peak).toBeLessThan(.95); expect(level.rms).toBeGreaterThan(.005); });
  await info.attach("levels", { body: JSON.stringify(levels), contentType: "application/json" });
});
