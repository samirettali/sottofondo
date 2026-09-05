import { test, expect } from "@playwright/test";
import { createSongPlan, type ElectronicGenre } from "../src/composer/plan.ts";
import { songPattern } from "../src/composer/compose.ts";
import { currentRecipe, recipeParams } from "../src/recipe.ts";

for(const genre of ["acid","techno","house"] as ElectronicGenre[]) {
  test(`${genre}: v2 browser decisions match Node, audio and restart work`,async({page})=>{
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto(`/?${recipeParams(currentRecipe(genre, 2))}`);
    const expected=songPattern(createSongPlan(genre,2)).queryArc(600,608).map(h=>[+h.whole.begin,+h.whole.end,h.value]);
    const actual=await page.evaluate(async genre=>{
      const planPath="/src/composer/plan.ts",composePath="/src/composer/compose.ts";
      const {createSongPlan}=await import(planPath);const {songPattern}=await import(composePath);
      return songPattern(createSongPlan(genre,2)).queryArc(600,608).map((h:any)=>[+h.whole.begin,+h.whole.end,h.value]);
    },genre);
    expect(actual).toEqual(expected);
    await page.getByRole("button",{name:"click to start"}).click();
    await expect(page.getByRole("button",{name:"play or stop"})).toBeVisible();
    await expect(page.getByRole("combobox",{name:"sound mode"})).toHaveCount(0);
    expect(await page.evaluate(() => Boolean((window as any).engine.plan.performance))).toBe(genre === "acid");
    const amplitude=()=>page.evaluate(()=>{
      const e=(window as any).engine;const a=new Float32Array(e.scopeSize);e.readScope(a);return Math.max(...a.map(Math.abs));
    });
    await expect.poll(amplitude).toBeGreaterThan(.001);
    await page.getByRole("button",{name:"save this seed"}).click();
    await page.getByRole("button",{name:"play or stop"}).click();
    await expect.poll(amplitude).toBeLessThan(.0001);
    await page.getByRole("button",{name:"play or stop"}).click();
    await expect.poll(amplitude).toBeGreaterThan(.001);
    expect(await page.evaluate(()=>(window as any).engine.error)).toBeNull();expect(errors).toEqual([]);
  });
}
test("v2 asset failure is explicit and retries the same recipe",async({page})=>{
  await page.route("**/samples/v2/*.json",route=>route.abort());
  await page.goto("/?g=house&s=2&e=strudel-2&v=1&m=auto");
  await page.getByRole("button",{name:"click to start"}).click();
  await expect(page.getByRole("button",{name:"Retry composition"})).toBeVisible();
  await page.unroute("**/samples/v2/*.json");
  await page.getByRole("button",{name:"Retry composition"}).click();
  await expect(page.getByRole("button",{name:"play or stop"})).toBeVisible();
  await expect(page).toHaveURL(/g=house&s=00000002&e=strudel-2/);
});
test("low-level synthesis responds to FM, filter and envelope fields",async({page})=>{
  const results:Record<string,{early:number;late:number;roughness:number}>={};
  for(const variant of ["plain","fm","filter-low","filter-high","filter-envelope","short","long"]){
    await page.goto(`/tools/patch-probe.html?variant=${variant}`);
    await page.waitForFunction(()=>(window as any).probeResult||(window as any).probeError);
    expect(await page.evaluate(()=>(window as any).probeError)).toBeUndefined();
    results[variant]=await page.evaluate(()=>(window as any).probeResult);
  }
  expect(results.fm!.roughness).toBeGreaterThan(results.plain!.roughness*2);
  expect(results["filter-high"]!.roughness).toBeGreaterThan(results["filter-low"]!.roughness*2);
  expect(results["filter-envelope"]!.roughness).toBeGreaterThan(results["filter-low"]!.roughness*1.2);
  expect(results.long!.late).toBeGreaterThan(results.short!.late*10);
});
test("v2 loads only its palette and bounds control history while silent",async({page})=>{
  const downloads:string[]=[];
  page.on("request",request=>{if(request.url().includes("/samples/v2/"))downloads.push(request.url().split("/").at(-1)!);});
  await page.goto("/?g=house&s=2&e=strudel-2&v=1&m=auto");
  await page.getByRole("button",{name:"click to start"}).click();
  await page.getByRole("button",{name:"play or stop"}).waitFor();
  const expected=await page.evaluate(async()=>{
    const path="/src/composer/player.ts";const {requiredAssets}=await import(path);
    return requiredAssets((window as any).engine.plan).map((name:string)=>`${name}.json`);
  });
  expect(downloads.sort()).toEqual(expected);
  const result=await page.evaluate(async()=>{
    const e=(window as any).engine;const identity=JSON.stringify(e.plan);
    e.stop();e.views().forEach((_:unknown,i:number)=>e.setUserMute(i,true));e.setBpm(14400);e.start();
    for(let i=0;i<60;i++){await new Promise(resolve=>setTimeout(resolve,50));e.setSwing(i%2?.5:.6);e.setDensity(0,i%2?.4:.8);}
    const result={bar:e.currentBar,snapshots:e.snapshots.length,samePlan:identity===JSON.stringify(e.plan),error:e.error};e.stop();return result;
  });
  expect(result.bar).toBeGreaterThan(20);expect(result.snapshots).toBeLessThanOrEqual(8);
  expect(result.samePlan).toBe(true);expect(result.error).toBeNull();
});

test("acid expression and filter gestures reach the production audio", async ({ page }) => {
  const results: Record<string, { rms: number; tail: number; roughness: number }> = {};
  for (const variant of ["quiet", "loud", "cutoff-low", "cutoff-high", "envelope-flat", "envelope-wide", "decay-short", "decay-long"]) {
    await page.goto(`/tools/acid-probe.html?variant=${variant}`);
    await page.waitForFunction(() => (window as any).probeResult || (window as any).probeError);
    expect(await page.evaluate(() => (window as any).probeError)).toBeUndefined();
    results[variant] = await page.evaluate(() => (window as any).probeResult);
  }
  expect(results.loud!.rms).toBeGreaterThan(results.quiet!.rms * 1.3);
  expect(results["cutoff-high"]!.roughness).toBeGreaterThan(results["cutoff-low"]!.roughness * 2);
  expect(results["envelope-wide"]!.roughness).toBeGreaterThan(results["envelope-flat"]!.roughness * 1.2);
  // The 303 decay controls its filter envelope, so measure retained brightness,
  // not amplitude: resonance can make a darker note louder than an open filter.
  expect(results["decay-long"]!.roughness).toBeGreaterThan(results["decay-short"]!.roughness * 2);
});

test("saved acid revisions keep their music and new seeds use the new phrasing", async ({ page }) => {
  await page.goto("/?g=acid&s=2&e=strudel-2&v=1&m=auto");
  await page.getByRole("button", { name: "click to start" }).click();
  await page.getByRole("button", { name: "play or stop" }).waitFor();
  expect(await page.evaluate(() => (window as any).engine.plan.performance)).toBeUndefined();
  await page.getByRole("button", { name: "save this seed" }).click();
  await page.getByRole("button", { name: "new seed", exact: true }).click();
  await expect(page).toHaveURL(/e=strudel-2&v=2&m=auto/);
  expect(await page.evaluate(() => (window as any).engine.plan.performance)).toBeDefined();
  const assets = await page.evaluate(async () => {
    const path = "/src/composer/player.ts";
    const { requiredAssets } = await import(path);
    return requiredAssets((window as any).engine.plan);
  });
  expect(assets).toContain("elec_hi_snare");
});
