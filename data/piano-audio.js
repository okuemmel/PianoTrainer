/* Local FluidR3 piano samples. Attribution and source: /piano-credits.txt. */
(function (root) {
  "use strict";
  function unpack(bytes) {
    if (
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength < 10 ||
      bytes.byteLength > 524288
    )
      throw Error("Ungültiges Klavier-Klangpaket.");
    const raw = new Uint8Array(bytes);
    if (String.fromCharCode(...raw.slice(0, 4)) !== "PTPN")
      throw Error("Unbekanntes Klavier-Klangpaket.");
    const size = new DataView(bytes).getUint32(4, true);
    if (size < 2 || size > 8192 || size + 8 >= bytes.byteLength)
      throw Error("Ungültiger Klangpaket-Index.");
    const index = JSON.parse(new TextDecoder().decode(raw.slice(8, 8 + size)));
    if (!Array.isArray(index) || !index.length || index.length > 32)
      throw Error("Ungültige Klavier-Samples.");
    const samples = new Map();
    for (const item of index) {
      const { note, offset, length } = item;
      if (
        !Number.isInteger(note) ||
        note < 21 ||
        note > 108 ||
        samples.has(note) ||
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(length) ||
        length < 16 ||
        size + 8 + offset + length > bytes.byteLength
      )
        throw Error("Ungültiger Klavier-Samplebereich.");
      samples.set(
        note,
        bytes.slice(size + 8 + offset, size + 8 + offset + length),
      );
    }
    return samples;
  }
  class Bank {
    constructor(fetcher = (...args) => root.fetch(...args)) {
      this.fetcher = fetcher;
      this.loading = null;
      this.contexts = new WeakMap();
    }
    load() {
      if (!this.loading)
        this.loading = (async () => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);
          try {
            const response = await this.fetcher("/piano-samples.bin", {
              credentials: "same-origin",
              signal: controller.signal,
            });
            if (!response.ok)
              throw Error("Klavier-Klangpaket nicht erreichbar.");
            return unpack(await response.arrayBuffer());
          } finally {
            clearTimeout(timeout);
          }
        })().catch((error) => {
          this.loading = null;
          throw error;
        });
      return this.loading;
    }
    prepare(context) {
      if (!this.contexts.has(context))
        this.contexts.set(
          context,
          (async () => {
            const encoded = await this.load(),
              buffers = new Map();
            // Decode in sequence to avoid a large temporary memory spike on phones.
            for (const [note, bytes] of encoded) {
              const buffer = await context.decodeAudioData(bytes.slice(0));
              if (
                !buffer ||
                !Number.isFinite(buffer.duration) ||
                buffer.duration <= 0 ||
                buffer.duration > 15
              )
                throw Error("Klavier-Sample konnte nicht gelesen werden.");
              buffers.set(note, buffer);
            }
            return buffers;
          })().catch((error) => {
            this.contexts.delete(context);
            throw error;
          }),
        );
      return this.contexts.get(context);
    }
  }
  function sampleVoice(
    context,
    destination,
    samples,
    note,
    velocity,
    start,
    end,
    ended = () => {},
  ) {
    if (!samples?.size || note < 21 || note > 108) return null;
    const rootNote = [...samples.keys()].reduce((a, b) =>
      Math.abs(b - note) < Math.abs(a - note) ? b : a,
    );
    const buffer = samples.get(rootNote),
      rate = Math.pow(2, (note - rootNote) / 12);
    end = Math.min(end, start + buffer.duration / rate);
    const source = context.createBufferSource(),
      gain = context.createGain();
    const filter = context.createBiquadFilter();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    filter.type = "lowpass";
    filter.frequency.value = 2200 + (9500 * velocity) / 127;
    filter.Q.value = 0.5;
    const amplitude = 0.9 * Math.pow(velocity / 127, 1.45);
    const attack = Math.min(0.004, (end - start) / 4),
      fade = Math.min(0.12, (end - start) / 3);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(amplitude, start + attack);
    gain.gain.setValueAtTime(amplitude, end - fade);
    gain.gain.linearRampToValueAtTime(0.0001, end + 0.09);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    const voice = { gain, oscillators: [source], start, end, note, velocity };
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      ended(voice);
    };
    source.start(start);
    source.stop(end + 0.12);
    return voice;
  }
  const api = { Bank, unpack, sampleVoice, bank: new Bank() };
  root.PianoAudio = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
