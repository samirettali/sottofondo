const startButton = document.getElementById("start") as HTMLButtonElement | null;

// The AudioContext is created inside the gesture handler, not before it: a context
// constructed outside a user gesture starts suspended and stays that way.
startButton?.addEventListener(
  "click",
  async () => {
    const ctx = new AudioContext();
    await ctx.resume();
    startButton.textContent = `running at ${ctx.sampleRate} Hz`;
    startButton.disabled = true;
  },
  { once: true },
);
