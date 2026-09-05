// The pinned Strudel packages ship JavaScript. Keep the boundary deliberately small.
declare module "@strudel/core/pattern.mjs" { export { Pattern } from "@strudel/core"; }
declare module "@strudel/core/hap.mjs" { export { Hap } from "@strudel/core"; }
declare module "@strudel/core/timespan.mjs" { export { TimeSpan } from "@strudel/core"; }
declare module "superdough/audioContext.mjs" { export function setAudioContext(ctx: BaseAudioContext): void; }
declare module "superdough/superdoughoutput.mjs" {
  export class Orbit {
    constructor(ctx: BaseAudioContext);
    output: GainNode;
    disconnect(): void;
    duck(time: number, onset: number, attack: number, depth: number): void;
  }
}
declare module "@strudel/core" {
  export interface FractionValue { valueOf(): number; add(n: number | FractionValue): FractionValue; }
  export class TimeSpan {
    constructor(begin: number | string, end: number | string);
    begin: FractionValue; end: FractionValue;
    intersection(other: TimeSpan): TimeSpan | undefined;
  }
  export class Hap<T = Record<string, unknown>> {
    constructor(whole: TimeSpan, part: TimeSpan, value: T);
    whole: TimeSpan; part: TimeSpan; value: T; duration: FractionValue;
    hasOnset(): boolean;
  }
  export class Pattern<T = Record<string, unknown>> {
    constructor(query: (state: { span: TimeSpan }) => Hap<T>[]);
    queryArc(begin: number, end: number): Hap<T>[];
  }
}
declare module "superdough" {
  export function setAudioContext(ctx: BaseAudioContext): void;
  export function setSuperdoughAudioController(controller: ReturnType<typeof getSuperdoughAudioController>): void;
  export function initAudio(options?: { maxPolyphony: number }): Promise<void>;
  export function registerSynthSounds(): void;
  export function superdough(value: Record<string, unknown>, time: number, duration: number, cps?: number, cycle?: number): Promise<unknown>;
  export function samples(map: Record<string, string[]>): Promise<void>;
  export function loadBuffer(url: string, ctx: BaseAudioContext, sound: string): Promise<AudioBuffer>;
  export function getSuperdoughAudioController(): {
    output: { destinationGain: GainNode; disconnect(): void };
    nodes: Record<string, { output: AudioNode; disconnect(): void }>;
    reset(): void;
  };
}
