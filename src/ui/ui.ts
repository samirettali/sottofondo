import type { Player } from "../player.ts";
import type { Recipe, SoundMode } from "../recipe.ts";
import { genreList } from "../genre/index.ts";
import {
  addFavourite,
  favouriteLabel,
  favouriteRecipe,
  isFavourited,
  loadFavourites,
  removeFavourite,
  type Favourite,
} from "./favourites.ts";
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
  /** Load a saved seed, which may belong to a different genre. */
  onLoad(recipe: Recipe): void;
  onRecipe(recipe: Recipe): void;
}

export function buildUi(root: HTMLElement, engine: Player, cb: UiCallbacks): () => void {
  root.textContent = "";
  root.classList.add("rack");

  const header = el("header", "bar");
  // A row of buttons rather than a <select>: nine entries in a native popup scroll and
  // clip, and a genre is something to see all of at once.
  const genre = el("div", "genres");
  genre.setAttribute("role", "radiogroup");
  genre.setAttribute("aria-label", "genre");
  for (const g of genreList()) {
    const b = button(g.name, g.name, () => cb.onGenre(g.id));
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(g.id === engine.genre.id));
    genre.append(b);
  }

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

  const transport = button(engine.isRunning ? "stop" : "play", "play or stop", () => {
    if (engine.isRunning) {
      engine.stop();
      transport.textContent = "play";
    } else {
      engine.start();
      transport.textContent = "stop";
    }
  });

  const copy = button("link", "copy link", () => {
    void navigator.clipboard?.writeText(location.href).then(
      () => flash(copy, "copied"),
      () => flash(copy, "failed"),
    );
  });

  const star = button("", "save this seed", () => {
    const saved = isFavourited(engine.genre.id, engine.seed, engine.recipe);
    const list = saved
      ? removeFavourite(engine.genre.id, engine.seed, engine.recipe)
      : addFavourite(engine.genre.id, engine.seed, engine.recipe);
    renderFavourites(list);
    markStar(!saved);
  });
  const markStar = (saved: boolean) => {
    star.textContent = saved ? "★" : "☆";
    star.setAttribute("aria-pressed", String(saved));
  };
  markStar(isFavourited(engine.genre.id, engine.seed, engine.recipe));

  header.append(transport, seed, reroll, copy, star);

  const saved = el("div", "favourites");
  const renderFavourites = (list: readonly Favourite[]) => {
    saved.textContent = "";
    if (list.length === 0) {
      saved.hidden = true;
      return;
    }
    saved.hidden = false;
    for (const f of list) {
      const chip = el("span", "chip");
      const load = button(favouriteLabel(f), `load ${favouriteLabel(f)}`, () =>
        cb.onLoad(favouriteRecipe(f)),
      );
      const drop = button("×", `forget ${favouriteLabel(f)}`, () => {
        renderFavourites(removeFavourite(f.genre, f.seed, f.recipe));
        markStar(isFavourited(engine.genre.id, engine.seed, engine.recipe));
      });
      drop.classList.add("drop");
      chip.append(load, drop);
      saved.append(chip);
    }
  };
  renderFavourites(loadFavourites());

  const soundRow = el("label", "bar");
  if (engine.identityLabel) soundRow.textContent = engine.identityLabel;
  if (engine.recipe.engineVersion === "strudel-1") {
    soundRow.append("Sound ");
    const select = document.createElement("select");
    select.setAttribute("aria-label", "sound mode");
    for (const [value, label] of [["synth", "Synth"], ["samples", "Samples + synth"]]) {
      const option = document.createElement("option");
      option.value = value!; option.textContent = label!; select.append(option);
    }
    select.value = engine.recipe.soundMode;
    const message = el("span", "status");
    message.setAttribute("role", "status");
    select.addEventListener("change", () => {
      select.disabled = true; message.textContent = "Loading…";
      void engine.setSoundMode(select.value as SoundMode).then(() => {
        cb.onRecipe(engine.recipe);
        markStar(isFavourited(engine.genre.id, engine.seed, engine.recipe));
        message.textContent = "";
      }).catch((error: unknown) => {
        select.value = engine.recipe.soundMode;
        message.textContent = `${String(error)} Select again to retry.`;
      }).finally(() => { select.disabled = false; });
    });
    soundRow.append(select, message);
  }

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

  // Synth and effect controls, only for the voices this genre actually has.
  const synth = engine.synthState;
  const tweaks = el("div", "globals");
  if (engine.bassLabel) { const label = el("span", "status"); label.textContent = engine.bassLabel; tweaks.append(label); }
  if (synth.bass !== null) {
    // Cutoff on a logarithmic slider: an octave should be the same distance everywhere,
    // which a linear hertz control does not give.
    tweaks.append(
      logSlider("cutoff", 60, 6000, synth.bass.cutoff, (v) => {
        engine.setBassParam("cutoff", v);
        return `${Math.round(v)} Hz`;
      }).row,
      slider("res", 0.5, 24, 0.1, synth.bass.resonance, (v) => {
        engine.setBassParam("resonance", v);
        return v.toFixed(1);
      }).row,
      slider("env mod", 0, 8000, 50, synth.bass.envMod, (v) => {
        engine.setBassParam("envMod", v);
        return `${Math.round(v)} c`;
      }).row,
      slider("decay", 0.05, 1.2, 0.01, synth.bass.decay, (v) => {
        engine.setBassParam("decay", v);
        return `${v.toFixed(2)} s`;
      }).row,
    );
  }
  tweaks.append(
    slider("delay", 0, 0.6, 0.01, synth.delay.wet, (v) => {
      engine.setDelayParam("wet", v);
      return v.toFixed(2);
    }).row,
    slider("feedback", 0, 0.9, 0.01, synth.delay.feedback, (v) => {
      engine.setDelayParam("feedback", v);
      return v.toFixed(2);
    }).row,
  );

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

  root.append(header, genre, saved, soundRow, globals, lanes, energyBar, tweaks, scope, status);

  // Drawing runs on requestAnimationFrame and reads the engine; it never writes to it,
  // and it never touches the audio clock for anything but display.
  // How long before every lane realigns. Only worth saying when it is not one bar —
  // it is the single most useful readout a polymetric sequencer can give, and there is
  // no other way to know a seven-step lane will not repeat for seven bars.
  const cycleBars = engine.compositeCycleBars;
  const cycleNote = engine.recipe.engineVersion === "strudel-2" ? ` · ${cycleBars}-bar motifs` : cycleBars > 1 ? ` · repeats every ${cycleBars} bars` : "";

  const wave = new Float32Array(engine.scopeSize);
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

    engine.readScope(wave);
    drawScope(scope, wave);

    const section = engine.sectionAt(bar);
    energyFill.style.width = `${(section.energy * 100).toFixed(1)}%`;
    const where = section.bars > 0 ? ` ${section.bar + 1}/${section.bars}` : "";
    status.textContent =
      engine.error ?? (`${engine.genre.name} · seed ${formatSeed(engine.seed)} · bar ${bar + 1}` +
      ` · ${section.name}${where} · energy ${section.energy.toFixed(2)}${cycleNote}`);
    transport.textContent = engine.isRunning ? "stop" : "play";
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

function flash(node: HTMLElement, text: string): void {
  const original = node.textContent;
  node.textContent = text;
  setTimeout(() => {
    node.textContent = original;
  }, 900);
}

/**
 * A slider whose travel is logarithmic.
 *
 * For cutoff and anything else heard as pitch, an octave should occupy the same distance
 * wherever it sits. A linear hertz control puts nine tenths of its travel above 1 kHz,
 * where almost nothing musical happens.
 */
function logSlider(
  label: string,
  min: number,
  max: number,
  value: number,
  onInput: (v: number) => string,
): { row: HTMLElement; input: HTMLInputElement } {
  const toNorm = (v: number) => Math.log(v / min) / Math.log(max / min);
  const fromNorm = (t: number) => min * (max / min) ** t;
  return slider(label, 0, 1, 0.001, toNorm(value), (t) => onInput(fromNorm(t)));
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
