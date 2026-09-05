import { Orbit } from "superdough/superdoughoutput.mjs";
import { setAudioContext } from "superdough/audioContext.mjs";

/** Fixed stereo output into our master. WebKit may report maxChannelCount=0;
 * Superdough's default multichannel output tries to assign that value and throws.
 * Orbit is upstream's effect bus; only the destination routing is ours.
 */
export class StereoOutput {
  nodes: Record<string, Orbit> = {};
  buses: Record<string, GainNode> = {};
  readonly output: { destinationGain: GainNode; disconnect(): void; connectToDestination(input: AudioNode): void };
  private readonly ctx: BaseAudioContext;
  constructor(ctx: BaseAudioContext, destination: AudioNode) {
    this.ctx = ctx;
    // Orbit's source-module helpers and the bundled synth must use the same context.
    setAudioContext(ctx);
    const gain = ctx.createGain();
    gain.channelCount = 2; gain.channelCountMode = "explicit";
    gain.connect(destination);
    this.output = { destinationGain: gain, disconnect: () => gain.disconnect(),
      connectToDestination: node => { node.connect(gain); } };
  }
  getOrbit(index: number): Orbit {
    if (!this.nodes[index]) {
      const orbit = new Orbit(this.ctx);
      this.nodes[index] = orbit;
      this.output.connectToDestination(orbit.output);
    }
    return this.nodes[index]!;
  }
  getBus(index: number): GainNode {
    return this.buses[index] ??= this.ctx.createGain();
  }
  duck(targets: number | number[], time: number, onset = 0, attack = 0.1, depth = 1): void {
    for (const target of [targets].flat()) this.nodes[target]?.duck(time, onset, attack, depth);
  }
  reset(): void {
    Object.values(this.nodes).forEach(node => node.disconnect());
    Object.values(this.buses).forEach(node => node.disconnect());
    this.nodes = {}; this.buses = {};
  }
  dispose(): void { this.reset(); this.output.disconnect(); }
}
