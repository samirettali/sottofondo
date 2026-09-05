/**
 * The thing that wakes the scheduler up.
 *
 * It decides only *when to look*, never when a note sounds — every event is scheduled
 * at an absolute `AudioContext` time, so ticker jitter costs nothing as long as it wakes
 * up often enough to stay inside the lookahead horizon.
 */
export interface Ticker {
  start(onTick: () => void, intervalMs: number): void;
  stop(): void;
}

/**
 * Timer-based ticker. Correct, but throttled to roughly 1 Hz in a background tab, which
 * stops the sequencer dead. Use it as a fallback and outside the browser.
 */
export function timeoutTicker(): Ticker {
  let handle: ReturnType<typeof setInterval> | null = null;
  return {
    start(onTick, intervalMs) {
      this.stop();
      handle = setInterval(onTick, intervalMs);
    },
    stop() {
      if (handle !== null) clearInterval(handle);
      handle = null;
    },
  };
}

/**
 * Worker-based ticker. A worker's timers are not throttled the way a hidden document's
 * are, so playback survives the tab going to the background.
 *
 * The worker source is inlined as a blob rather than a separate module: it is four lines,
 * and this keeps the build a single file with no bundler-specific worker plumbing.
 */
export function workerTicker(): Ticker {
  const source = `
    let handle = null;
    self.onmessage = (e) => {
      if (handle !== null) { clearInterval(handle); handle = null; }
      if (e.data.interval > 0) {
        handle = setInterval(() => self.postMessage(0), e.data.interval);
      }
    };
  `;
  let worker: Worker | null = null;
  return {
    start(onTick, intervalMs) {
      this.stop();
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = () => onTick();
      worker.postMessage({ interval: intervalMs });
    },
    stop() {
      worker?.postMessage({ interval: 0 });
      worker?.terminate();
      worker = null;
    },
  };
}

/** A worker if the environment has one, a timer otherwise. */
export function defaultTicker(): Ticker {
  return typeof Worker === "undefined" ? timeoutTicker() : workerTicker();
}
