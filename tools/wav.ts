/** 16-bit PCM WAV, for handing a render to something that can only read files. */
export function wav(buf: AudioBuffer): Blob {
  const chans = buf.numberOfChannels;
  const frames = buf.length;
  const data = new ArrayBuffer(44 + frames * chans * 2);
  const view = new DataView(data);
  const ascii = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + frames * chans * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, chans, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * chans * 2, true);
  view.setUint16(32, chans * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, frames * chans * 2, true);

  const src = Array.from({ length: chans }, (_, c) => buf.getChannelData(c));
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < chans; c++) {
      const x = Math.max(-1, Math.min(1, src[c]![i]!));
      view.setInt16(at, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([data], { type: "audio/wav" });
}
