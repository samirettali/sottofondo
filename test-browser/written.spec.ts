import { test, expect } from "@playwright/test";
import { createPiece, PIECE_IDS } from "../tools/authored-pieces-score.ts";

test("both written pieces play locally, preserve notes through focus, and restore links", async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.goto("/tools/written.html?piece=scia-1");
  await expect(page.locator('[data-piece="scia-1"]')).toHaveAttribute("aria-pressed", "true");
  for (const id of ["scia-1", "ferro-1"]) {
    await page.locator(`[data-piece="${id}"]`).click();
    await page.locator("#play").click();
    await expect(page.locator("#play")).toHaveText("Stop");
    await expect.poll(() => page.evaluate(() => {
      const data = new Float32Array(2048);
      (window as any).writtenPlayer.analyser.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    })).toBeGreaterThan(.015);
    const before = await page.evaluate(() => JSON.stringify((window as any).writtenScore.events));
    await page.locator("#focus").click();
    await expect(page.locator("#focus")).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => (window as any).writtenScore.pattern.queryArc(0, 48).map((h: any) => h.value.laneId)))
      .toEqual(expect.arrayContaining(["kick", "acid"]));
    expect(await page.evaluate(() => (window as any).writtenScore.pattern.queryArc(0, 48).some((h: any) => ["drums", "space", "signal", "answer"].includes(h.value.laneId)))).toBe(false);
    await page.locator("#full").click();
    expect(await page.evaluate(() => JSON.stringify((window as any).writtenScore.events))).toBe(before);
    await page.locator("#play").click();
  }
  await page.reload();
  await expect(page.locator('[data-piece="ferro-1"]')).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]); expect(external).toEqual([]);
});

test("both complete written arrangements export audible unclipped WAVs with quiet endings", async ({ page }, info) => {
  test.setTimeout(240000);
  const levels = [];
  for (const id of ["ferro-1", "scia-1"]) {
    await page.goto(`/tools/written.html?piece=${id}`);
    // Export promises the full mix even when the live audition is focused.
    await page.locator("#focus").click(); await page.locator("#export").click();
    await expect(page.locator("#download")).toBeVisible({ timeout: 180000 });
    const data = await page.evaluate(async () => {
      const bytes = await (await fetch((document.querySelector("#download") as HTMLAnchorElement).href)).arrayBuffer();
      const ctx = new AudioContext(), buffer = await ctx.decodeAudioData(bytes);
      let peak = 0, energy = 0, tail = 0;
      const signal = buffer.getChannelData(0);
      for (const [i, sample] of signal.entries()) {
        peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
        if (i > signal.length - buffer.sampleRate / 2) tail += sample * sample;
      }
      await ctx.close();
      return { peak, rms: Math.sqrt(energy / signal.length), tail: Math.sqrt(tail / (buffer.sampleRate / 2)), duration: buffer.duration };
    });
    expect(data.peak).toBeGreaterThan(.08); expect(data.peak).toBeLessThan(.95);
    expect(data.rms).toBeGreaterThan(.02); expect(data.tail).toBeLessThan(.005);
    expect(data.duration).toBeCloseTo(48 * 240 / (id === "ferro-1" ? 144 : 142), 3);
    levels.push({ id, ...data });
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#download").click()]);
    expect(download.suggestedFilename()).toBe(`${id}.wav`);
    await download.saveAs(info.outputPath(id, "clip.wav"));
  }
  await info.attach("written-mix-levels", { body: JSON.stringify(levels), contentType: "application/json" });
});

test("every written part produces audio in its scored entrance", async ({ page }, info) => {
  test.setTimeout(180000);
  const levels = [];
  for (const id of PIECE_IDS) for (const part of Object.keys(createPiece(id).parts)) {
    // Fresh realm for each instrument: Superdough pools cannot cross contexts.
    await page.goto("/tools/written.html");
    const level = await page.evaluate(async ({ id, part }) => {
      const { createPiece } = await import("/tools/authored-pieces-score.ts");
      const { ReferencePlayer } = await import("/tools/acid-reference-player.ts");
      const muted = new Set(Object.keys(createPiece(id).parts).filter(p => p !== part));
      const score = createPiece(id, muted);
      if (part !== "drums") score.localSamples = {};
      const begin = Math.floor(score.events.find(n => n.laneId === part)!.begin), end = begin + 4;
      const secondsPerBar = 240 / score.bpm;
      const ctx = new OfflineAudioContext(2, Math.ceil((end * secondsPerBar + 2) * 48000), 48000);
      const player = new ReferencePlayer(ctx, "original", 0, score);
      await player.scheduleRender(end);
      const buffer = await ctx.startRendering();
      const data = buffer.getChannelData(0).subarray(Math.floor(begin * secondsPerBar * 48000), Math.floor(end * secondsPerBar * 48000));
      let peak = 0, energy = 0;
      for (const value of data) { peak = Math.max(peak, Math.abs(value)); energy += value * value; }
      player.dispose();
      return { begin, end, peak, rms: Math.sqrt(energy / data.length) };
    }, { id, part });
    expect(level.peak, `${id}/${part}`).toBeGreaterThan(.0005);
    expect(level.peak, `${id}/${part}`).toBeLessThan(.85);
    levels.push({ id, part, ...level });
  }
  await info.attach("written-isolated-parts", { body: JSON.stringify(levels), contentType: "application/json" });
});

test("the live piece reaches its ending and can restart in the same audio context", async ({ page }) => {
  test.setTimeout(115000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tools/written.html?piece=scia-1");
  await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("Scia finished", { timeout: 95000 });
  await expect(page.locator("#play")).toHaveText("Play Scia");
  await expect(page.locator("#position")).toHaveText("1:21 / 1:21");
  await page.locator("#play").click();
  await expect(page.locator("#status")).toContainText("Playing Scia");
  await expect(page.locator("#position")).toContainText("0:00 /");
  await page.locator("#play").click();
  expect(errors).toEqual([]);
});
