import { test, expect } from "@playwright/test";

test("the original and each audition play through the same preview", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tools/acid-reference.html");
  await expect(page.locator("#variant")).toHaveValue("original");
  await expect(page.locator("#play")).toHaveText("Play original");
  for (const variant of ["original","biquad","303","generated","variation"]) {
    await page.locator("#variant").selectOption(variant);
    await page.locator("#play").click();
    await expect(page.locator("#status")).toContainText("Playing.");
    await expect.poll(() => page.evaluate(() => {
      const p = (window as any).referencePlayer;
      const data = new Float32Array(2048); p.analyser.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    })).toBeGreaterThan(.001);
    expect(await page.evaluate(() => (window as any).referencePlayer.error)).toBeNull();
    await page.locator("#play").click();
    await expect(page.locator("#status")).toHaveText("Stopped.");
  }
  expect(errors).toEqual([]);
});

test("failed original sample downloads can be retried without substituting sounds", async ({ page }) => {
  await page.route("**/tidal-drum-machines/**", route => route.abort());
  await page.goto("/tools/acid-reference.html"); await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("Could not play");
  await page.unroute("**/tidal-drum-machines/**"); await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("Playing.");
});

test("the reference comparison renders two anonymous sixteen-bar takes", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/tools/acid-reference.html"); await page.locator("#variant").selectOption("variation");
  await page.locator("#compare").click();
  await expect(page.locator("#status")).toContainText("Ready.", { timeout: 100000 });
  await expect(page.locator("audio")).toHaveCount(2);
  await expect(page.locator("article h2").first()).toHaveText("A");
  const metrics = await page.locator("article").evaluateAll(articles => articles.map(article =>
    ({ peak: Number((article as HTMLElement).dataset.peak), rms: Number((article as HTMLElement).dataset.rms) })));
  metrics.forEach(m => { expect(m.peak).toBeGreaterThan(.01); expect(m.peak).toBeLessThan(1); expect(m.rms).toBeGreaterThan(.001); });
  await page.locator("#reveal").click();
  await expect(page.locator("article h2").first()).toContainText("Original");
  await expect(page.locator("article h2").last()).toContainText("Small seeded edits");
});
