import type { Engine } from "../app.ts";
import { genreList } from "../genre/index.ts";
import { formatSeed, parseSeed } from "../core/rng.ts";
import { swingRatio } from "../core/time.ts";

/**
 * The interface.
 *
 * Range inputs rather than rotary dials. The reference implementation's dials read
 * `movementX - movementY` from mouse events with no pointer capture, which makes it
 * desktop-only and unreachable from a keyboard; a slider is honest about being a scalar
 * and works everywhere. Pointer events throughout, for the same reason.
 */

export interface UiCallbacks {
  onGenre(id: string): void;
  onSeed(seed: number): void;
}

export function buildUi(root: HTMLElement, engine: Engine, cb: UiCallbacks): () => void {
  root.textContent = "";
  root.classList.add("rack");

  const header = el("header", "bar");
  const genre = el("select", "genre") as HTMLSelectElement;
  for (const g of genreList()) {
    const option = document.createElement("option");
    option.value = g.id;
    option.textContent = g.name;
    option.selected = g.id === engine.genre.id;
    genre.append(option);
  }
  genre.setAttribute("aria-label", "genre");
  genre.addEventListener("change", () => cb.onGenre(genre.value));

  const seed = el("input", "seed") as HTMLInputElement;
  seed.value = engine.seedLabel;
  seed.spellcheck = false;
  seed.setAttribute("aria-label", "seed");
  seed.addEventListener("change", () => cb.onSeed(parseSeed(seed.value)));

  const reroll = button("↻", "new seed", () => {
    // A new seed is the old one plus one: adjacent seeds are unrelated, so this is a
    // fresh piece, and it makes the sequence walkable rather than a lottery.
    cb.onSeed((engine.seed + 1) >>> 0);
  });

  const transport = button(engine.clock.isRunning ? "stop" : "play", "play or stop", () => {
    if (engine.clock.isRunning) {
      engine.stop();
      transport.textContent = "play";
    } else {
      engine.start();
      transport.textContent = "stop";
    }
  });

  header.append(transport, genre, seed, reroll);

  const globals = el("div", "globals");
  const bpm = slider("bpm", engine.genre.clock.bpm.min, engine.genre.clock.bpm.max, 1, engine.tempo, (v) => {
    engine.setBpm(v);
    return String(v);
  });
  const swing = slider("swing", 50, 75, 0.5, engine.swingAmount * 100, (v) => {
    engine.setSwing(v / 100);
    return `${v.toFixed(1)}% · ${swingRatio(v / 100).toFixed(2)}:1`;
  });
  const volume = slider("volume", 0, 1, 0.01, 0.5, (v) => {
    engine.setVolume(v);
    return v.toFixed(2);
  });
  globals.append(bpm.row, swing.row, volume.row);

  const lanes = el("div", "lanes");
  const laneViews = engine.views().map((view, index) => {
    const lane = el("div", "lane");

    const mute = button(view.name, `mute ${view.name}`, () => {
      const muted = !lane.classList.contains("muted");
      lane.classList.toggle("muted", muted);
      mute.setAttribute("aria-pressed", String(muted));
      engine.setUserMute(index, muted);
    });
    mute.classList.add("name");
    mute.setAttribute("aria-pressed", "false");

    const density = slider("", 0, 1, 0.01, view.density, (v) => {
      engine.setDensity(index, v);
      return v.toFixed(2);
    });
    density.row.classList.add("density");
    density.input.setAttribute("aria-label", `${view.name} density`);

    const canvas = document.createElement("canvas");
    canvas.className = "steps";
    // Every lane is one bar wide, whatever its own pattern length, so a polymetric lane
    // visibly lands somewhere different each bar instead of being stretched to fit.
    canvas.width = view.steps.length * 18;
    canvas.height = 22;

    lane.append(mute, canvas, density.row);
    lanes.append(lane);
    return { lane, canvas };
  });

  const scope = document.createElement("canvas");
  scope.className = "scope";
  scope.width = 640;
  scope.height = 80;

  const energyBar = el("div", "energy");
  const energyFill = el("div", "fill");
  energyBar.append(energyFill);

  const status = el("p", "status");

  root.append(header, globals, lanes, energyBar, scope, status);

  // Drawing runs on requestAnimationFrame and reads the engine; it never writes to it,
  // and it never touches the audio clock for anything but display.
  const wave = new Float32Array(engine.master.analyser.fftSize);
  let raf = 0;
  const draw = () => {
    const bar = engine.currentBar;
    const step = engine.currentStep;
    const views = engine.views(bar);

    laneViews.forEach((lv, i) => {
      const view = views[i];
      if (view === undefined) return;
      lv.lane.classList.toggle("auto-muted", view.autoMuted && !view.userMuted);
      drawSteps(lv.canvas, view.steps, step, view.autoMuted || view.userMuted);
    });

    engine.master.analyser.getFloatTimeDomainData(wave);
    drawScope(scope, wave);

    const section = engine.sectionAt(bar);
    energyFill.style.width = `${(section.energy * 100).toFixed(1)}%`;
    const where = section.bars > 0 ? ` ${section.bar + 1}/${section.bars}` : "";
    status.textContent =
      `${engine.genre.name} · seed ${formatSeed(engine.seed)} · bar ${bar + 1}` +
      ` · ${section.name}${where} · energy ${section.energy.toFixed(2)}`;
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return () => cancelAnimationFrame(raf);
}

function drawSteps(
  canvas: HTMLCanvasElement,
  steps: readonly number[],
  playhead: number,
  dimmed: boolean,
): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  const css = getComputedStyle(canvas);
  const on = css.getPropertyValue("--on").trim() || "#4ade80";
  const off = css.getPropertyValue("--off").trim() || "#26262e";
  const head = css.getPropertyValue("--head").trim() || "#8b8b99";

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = dimmed ? 0.3 : 1;
  const w = canvas.width / steps.length;
  for (let i = 0; i < steps.length; i++) {
    const v = steps[i] ?? 0;
    ctx.fillStyle = v > 0 ? on : off;
    // Velocity is drawn as height, so ghost notes read as ghost notes.
    const h = v > 0 ? 6 + v * (canvas.height - 10) : 4;
    ctx.globalAlpha = (dimmed ? 0.3 : 1) * (v > 0 ? 0.35 + 0.65 * v : 1);
    ctx.fillRect(i * w + 1, (canvas.height - h) / 2, w - 2, h);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = head;
  ctx.beginPath();
  ctx.moveTo(playhead * w + w / 2, 0);
  ctx.lineTo(playhead * w + w / 2, canvas.height);
  ctx.stroke();
}

function drawScope(canvas: HTMLCanvasElement, wave: Float32Array): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--on").trim() || "#4ade80";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const stride = Math.max(1, Math.floor(wave.length / canvas.width));
  for (let x = 0, i = 0; i < wave.length; i += stride, x++) {
    const y = (1 - (wave[i] ?? 0)) * (canvas.height / 2);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function button(label: string, aria: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.setAttribute("aria-label", aria);
  b.addEventListener("click", onClick);
  return b;
}

function slider(
  label: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onInput: (v: number) => string,
): { row: HTMLElement; input: HTMLInputElement } {
  const row = el("label", "slider");
  const name = el("span", "label");
  name.textContent = label;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const readout = el("span", "value");
  readout.textContent = onInput(value);
  input.addEventListener("input", () => {
    readout.textContent = onInput(Number(input.value));
  });
  row.append(name, input, readout);
  return { row, input };
}
