# Attribution and source

Sottofondo's Strudel integration is distributed under AGPL-3.0-or-later.
The complete corresponding source and build instructions are available at
https://github.com/samirettali/sottofondo . See LICENSE.

- Strudel core 1.2.6 and Superdough 1.3.0: Strudel contributors,
  https://codeberg.org/uzu/strudel, AGPL-3.0-or-later.
- The existing acid preset and 303 design descend from vitling's Endless Acid
  Banger, https://github.com/vitling/acid-banger, CC-BY-4.0. Sottofondo changes
  the timing, deterministic generation, instruments, interface and arrangement.
  The original attribution and CC-BY terms continue to apply to that material.
- The seven embedded FLAC drum samples are from Sonic Pi, CC0-1.0.
  public/samples/kit.json records their immutable source URLs and SHA-256 hashes.
  public/samples/README.md preserves the upstream attribution and original links.

Sample encoding is base64 FLAC in a single lazily fetched JSON file. The decoded
bytes are unchanged from upstream. This keeps the sample payload separate from
JavaScript and allows inspection of provenance without depending on a CDN.
