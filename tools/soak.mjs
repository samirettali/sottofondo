import { chromium } from "@playwright/test";

const minutes = Number(process.env.SOAK_MINUTES ?? 30);
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_BIN ? { executablePath: process.env.CHROMIUM_BIN } : {}) });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await page.addInitScript(() => {
  window.soak = { started: 0, ended: 0 };
  for (const Type of [OscillatorNode, AudioBufferSourceNode, ConstantSourceNode]) {
    const start = Type.prototype.start;
    Type.prototype.start = function (...args) {
      this.addEventListener("ended", () => { window.soak.ended++; }, { once: true });
      const result = start.apply(this, args);
      window.soak.started++;
      return result;
    };
  }
});
const cdp = await page.context().newCDPSession(page);
const samples = [];
try {
  await page.goto(`${process.env.SOAK_URL ?? "http://127.0.0.1:5199"}/?g=house&s=cafe1234&e=strudel-1&v=1&m=samples`);
  await page.getByRole("button", { name: "click to start" }).click();
  await page.getByRole("combobox", { name: "sound mode" }).waitFor();
  for (let minute = 0; minute <= minutes; minute++) {
    if (minute) await page.waitForTimeout(60000);
    await cdp.send("HeapProfiler.collectGarbage");
    const memory = await cdp.send("Runtime.getHeapUsage");
    const state = await page.evaluate(() => ({ ...window.soak,
      status: document.querySelector("main > p.status")?.textContent }));
    const sample = { minute, active: state.started - state.ended, heap: memory.usedSize, status: state.status };
    samples.push(sample); console.log(JSON.stringify(sample));
    if (errors.length || sample.active > 128) throw new Error(JSON.stringify({ errors, sample }));
    if (minute < minutes && minute % 5 === 4) {
      await page.getByRole("combobox", { name: "sound mode" }).selectOption(minute % 10 === 4 ? "synth" : "samples");
    }
  }
  await page.getByRole("button", { name: "play or stop" }).click();
  await page.waitForTimeout(3000);
  const active = await page.evaluate(() => window.soak.started - window.soak.ended);
  if (active !== 0) throw new Error(`${active} sources survived Stop`);
  const tail = samples.slice(5);
  if (tail.length && tail.at(-1).heap > tail[0].heap + 4 * 1024 * 1024) throw new Error("Heap grew by more than 4 MiB after warmup");
  console.log(JSON.stringify({ passed: true, minutes, activeAfterStop: active, errors }));
} finally { await browser.close(); }
