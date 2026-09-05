import { test, expect } from "@playwright/test";

test("the three written studies and their generated variants play and switch live", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tools/acid-studies.html");
  await expect(page.locator("#study")).toHaveValue("pressure");
  await expect(page.locator("#take")).toHaveValue("written");
  await page.locator("#play").click();
  for (const piece of ["pressure","crosscurrent","afterglow"]) {
    await expect(page.locator("#study")).toBeEnabled();
    await page.locator("#study").selectOption(piece);
    for (const version of ["written","generated"]) {
      await expect(page.locator("#take")).toBeEnabled();
      await page.locator("#take").selectOption(version);
      await expect(page.locator("#status")).toContainText(`Playing ${version}.`);
      await expect.poll(() => page.evaluate(() => {
        const player = (window as any).studyPlayer, data = new Float32Array(2048);
        player.analyser.getFloatTimeDomainData(data);
        return Math.max(...data.map(Math.abs));
      })).toBeGreaterThan(.001);
      expect(await page.evaluate(() => (window as any).studyPlayer.error)).toBeNull();
    }
  }
  await page.locator("#play").click();
  await expect(page.locator("#status")).toHaveText("Stopped.");
  await expect.poll(() => page.evaluate(() => {
    const data = new Float32Array(2048); (window as any).studyPlayer.analyser.getFloatTimeDomainData(data);
    return Math.max(...data.map(Math.abs));
  })).toBeLessThan(.0001);
  expect(errors).toEqual([]);
});

test("next seed restarts playback and the URL restores its piece and version", async ({ page }) => {
  await page.goto("/tools/acid-studies.html?piece=auto&s=2");
  await expect(page.locator("#take")).toHaveValue("generated");
  await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("Playing generated.");
  await page.locator("#next").click();
  await expect(page.locator("#seed")).toHaveValue("00000003");
  await expect(page.locator("#status")).toContainText("Playing generated. Bar 1/32");
  const title = await page.locator("#title").textContent(), url = page.url();
  await page.reload();
  await expect(page.locator("#title")).toHaveText(title!);
  await expect(page.locator("#take")).toHaveValue("generated");
  expect(page.url()).toEqual(url);
  await page.locator("#take").selectOption("written");
  await expect(page.locator("#study")).not.toHaveValue("auto");
  await expect(page.locator("#seed")).toBeDisabled();
});

test("study comparisons render complete, unclipped arrangements", async ({ page }, info) => {
  test.setTimeout(240000);
  await page.goto("/tools/acid-studies.html");
  await page.getByText("Compare recordings", { exact: true }).click();
  for (const piece of ["pressure","crosscurrent","afterglow"]) {
    await page.locator("#study").selectOption(piece);
    await page.locator("#compare").click();
    await expect(page.locator("#status")).toContainText("Both recordings span 32 bars", { timeout: 100000 });
    await expect(page.locator("article h3").first()).toHaveText("A");
    const metrics = await page.locator("article").evaluateAll(articles => articles.map(article => ({
      peak: Number((article as HTMLElement).dataset.peak), rms: Number((article as HTMLElement).dataset.rms),
    })));
    metrics.forEach(m => { expect(m.peak).toBeGreaterThan(.05); expect(m.peak).toBeLessThan(.95); expect(m.rms).toBeGreaterThan(.005); });
    await info.attach(`${piece}-levels`, { body: JSON.stringify(metrics), contentType: "application/json" });
    await page.locator("#reveal").click();
    const versions = piece === "pressure" ? ["Before","After"] : ["Written","Generated"];
    await expect(page.locator("article h3").first()).toHaveText(`A — ${versions[0]}`);
    await expect(page.locator("article h3").last()).toHaveText(`B — ${versions[1]}`);
    // Attach neutral WAVs in separate directories, preserving the fixed output gain.
    for (const [index, version] of versions.entries()) {
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator("article a").nth(index).click()]);
      await download.saveAs(info.outputPath(piece, version, "clip.wav"));
    }
  }
});

test("shaped execution and bell controls play, restart and survive sharing", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tools/acid-studies.html?piece=pressure&take=generated&s=7&performance=shaped&bell=1");
  await expect(page.locator("#performance")).toHaveValue("shaped");
  await expect(page.locator("#bell")).toBeChecked();
  const url = page.url(); await page.reload(); expect(page.url()).toEqual(url);
  await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("After + bell.");
  for (const piece of ["reference","pressure"]) {
    await expect(page.locator("#study")).toBeEnabled();
    await page.locator("#study").selectOption(piece);
    await expect(page.locator("#status")).toContainText("After + bell.");
    await expect.poll(() => page.evaluate(() => {
      const data = new Float32Array(2048); (window as any).studyPlayer.analyser.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    })).toBeGreaterThan(.001);
  }
  await page.locator("#performance").selectOption("baseline");
  await expect(page.locator("#status")).toContainText("Before.");
  await expect(page.locator("#bell")).not.toBeChecked();
  await expect(page.locator("#bell")).toBeDisabled();
  await page.locator("#study").selectOption("crosscurrent");
  await expect(page.locator("#performance")).toBeDisabled();
  await expect(page.locator("#play")).toBeEnabled(); await page.locator("#play").click();
  expect(errors).toEqual([]);
});

test("reference and generated Pressure export distinct Before/After audio with bell replies", async ({ page }, info) => {
  test.setTimeout(240000);
  for (const piece of ["reference","pressure"]) {
    await page.goto(`/tools/acid-studies.html?piece=${piece}&take=generated&s=7&performance=shaped&bell=1`);
    await page.getByText("Compare recordings", { exact: true }).click();
    await page.locator("#compare").click();
    await expect(page.locator("#status")).toContainText("Both recordings span 32 bars", { timeout: 100000 });
    const metrics = await page.locator("article").evaluateAll(articles => articles.map(article => ({
      peak: Number((article as HTMLElement).dataset.peak), rms: Number((article as HTMLElement).dataset.rms),
    })));
    metrics.forEach(m => { expect(m.peak).toBeGreaterThan(.05); expect(m.peak).toBeLessThan(.95); expect(m.rms).toBeGreaterThan(.005); });
    await info.attach(`${piece}-levels`, { body: JSON.stringify(metrics), contentType: "application/json" });
    // Actual PCM must differ, including before the first optional bell entrance.
    const difference = await page.locator("article audio").evaluateAll(async audios => {
      const buffers = await Promise.all(audios.map(async audio => new DataView(await (await fetch((audio as HTMLAudioElement).src)).arrayBuffer())));
      let squares = 0;
      for (let i = 44; i < 44 + 48000 * 2 * 2; i += 2) squares += (buffers[0]!.getInt16(i,true) - buffers[1]!.getInt16(i,true)) ** 2;
      return Math.sqrt(squares / (48000 * 2)) / 32768;
    });
    expect(difference).toBeGreaterThan(.005);
    await page.locator("#reveal").click();
    await expect(page.locator("article h3").first()).toHaveText("A — After");
    await expect(page.locator("article h3").last()).toHaveText("B — Before");
    for (const [index, version] of ["after","before"].entries()) {
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator("article a").nth(index).click()]);
      await download.saveAs(info.outputPath(piece, version, "clip.wav"));
    }
  }
});
