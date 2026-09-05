import { test, expect } from "@playwright/test";
import { compositionPattern } from "../src/strudel/compose.ts";
import { recipe } from "../src/recipe.ts";

test("browser event decisions match Node at distant bars", async ({ page }) => {
  await page.goto("/");
  for (const genre of ["acid", "techno", "house"]) {
    const expected = compositionPattern(recipe(genre, 0xcafe1234)).queryArc(600, 608)
      .map(h => [+h.whole.begin, +h.whole.end, h.value]);
    const actual = await page.evaluate(async genre => {
      const path = "/src/strudel/compose.ts";
      const recipes = "/src/recipe.ts";
      const { compositionPattern } = await import(path);
      const { recipe } = await import(recipes);
      return compositionPattern(recipe(genre, 0xcafe1234)).queryArc(600, 608)
        .map((h: any) => [+h.whole.begin, +h.whole.end, h.value]);
    }, genre);
    expect(actual).toEqual(expected);
  }
});

for (const genre of ["acid", "techno", "house"]) {
  test(`${genre}: audio, mode switch, transport and recipe round trip`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/?g=${genre}&s=1&e=strudel-1&v=1&m=synth`);
    await page.getByRole("button", { name: "click to start" }).click();
    await expect(page.getByRole("combobox", { name: "sound mode" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const e = (window as any).engine;
      const wave = new Float32Array(e.scopeSize); e.readScope(wave);
      return Math.max(...wave.map(Math.abs));
    })).toBeGreaterThan(0.001);
    await page.getByRole("combobox", { name: "sound mode" }).selectOption("samples");
    await expect(page.getByRole("combobox", { name: "sound mode" })).toBeEnabled();
    await expect(page).toHaveURL(/m=samples/);
    await expect.poll(() => page.evaluate(() => (window as any).engine.error)).toBeNull();
    await page.getByRole("button", { name: "save this seed" }).click();
    await expect(page.getByRole("button", { name: "save this seed" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "play or stop" }).click();
    await expect.poll(() => page.evaluate(() => {
      const e = (window as any).engine; const a = new Float32Array(e.scopeSize); e.readScope(a);
      return Math.max(...a.map(Math.abs));
    })).toBeLessThan(0.0001);
    await page.getByRole("button", { name: "play or stop" }).click();
    await expect.poll(() => page.evaluate(() => (window as any).engine.currentBar)).toBe(0);
    await page.reload();
    await page.getByRole("button", { name: "click to start" }).click();
    await expect(page.getByRole("combobox", { name: "sound mode" })).toHaveValue("samples");
    expect(errors).toEqual([]);
  });
}
test("legacy links stay legacy and genre selection moves to the new engine", async ({ page }) => {
  await page.goto("/?g=acid&s=1");
  await page.getByRole("button", { name: "click to start" }).click();
  await expect(page).toHaveURL(/e=legacy-1/);
  await expect(page.getByRole("combobox", { name: "sound mode" })).toHaveCount(0);
  await page.getByRole("radio", { name: "Deep house", exact: true }).click();
  await expect(page).toHaveURL(/e=strudel-1/);
  await expect(page.getByRole("combobox", { name: "sound mode" })).toBeVisible();
});
test("failed sample loading leaves synth active and can be retried", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "click to start" }).click();
  const select = page.getByRole("combobox", { name: "sound mode" });
  await expect(select).toBeVisible();
  await page.route("**/samples/kit.json", route => route.abort());
  await select.selectOption("samples");
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue("synth");
  await expect(page.getByRole("status")).toContainText("retry");
  await page.unroute("**/samples/kit.json");
  await select.selectOption("samples");
  await expect(page).toHaveURL(/m=samples/);
});
test("unsupported recipe is explicit and recoverable", async ({ page }) => {
  await page.goto("/?g=acid&s=1&e=strudel-99");
  await page.getByRole("button", { name: "click to start" }).click();
  await expect(page.locator("main")).toContainText("not supported");
  await page.getByRole("button", { name: "Start a new composition" }).click();
  await expect(page.getByRole("combobox", { name: "sound mode" })).toBeVisible();
});
test("a late sample download cannot overwrite a newer composition URL", async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/samples/kit.json", async route => { await delayed; await route.continue(); });
  await page.goto("/?g=acid&s=1&e=strudel-1&v=1&m=synth");
  await page.getByRole("button", { name: "click to start" }).click();
  await page.getByRole("combobox", { name: "sound mode" }).waitFor();
  await page.evaluate(() => { (window as any).previousEngine = (window as any).engine; });
  const requested = page.waitForRequest("**/samples/kit.json");
  await page.getByRole("combobox", { name: "sound mode" }).selectOption("samples");
  await requested;
  await page.getByRole("radio", { name: "Deep house", exact: true }).click();
  await expect(page).toHaveURL(/g=house/);
  release();
  await expect.poll(() => page.evaluate(() => (window as any).previousEngine.samplesReady)).toBe(true);
  await expect(page).toHaveURL(/g=house.*m=synth/);
});
test("isolated listening renders produce three non-silent clips", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/tools/listen.html");
  await page.getByRole("button", { name: "Render comparison" }).click();
  await expect(page.locator("#status")).toContainText("Ready.", { timeout: 160000 });
  await expect(page.locator("audio")).toHaveCount(3);
});

test("control history stays bounded even with every lane muted", async ({ page }) => {
  await page.goto("/?g=house&s=1&e=strudel-1&v=1&m=synth");
  await page.getByRole("button", { name: "click to start" }).click();
  await page.getByRole("combobox", { name: "sound mode" }).waitFor();
  const result = await page.evaluate(async () => {
    const e = (window as any).engine;
    e.views().forEach((_: unknown, i: number) => e.setUserMute(i, true));
    // Accelerated silent playback exercises many control generations quickly.
    e.setBpm(14400);
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      e.setSwing(i % 2 ? 0.5 : 0.6);
    }
    const state = { bar: e.currentBar, snapshots: e.snapshots.length, error: e.error };
    e.stop();
    return state;
  });
  expect(result.bar).toBeGreaterThan(20);
  // At this artificial tempo, the 150 ms scheduling horizon spans three bars.
  expect(result.snapshots).toBeLessThanOrEqual(8);
  expect(result.error).toBeNull();
});
