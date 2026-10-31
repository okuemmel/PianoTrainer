/* Local Standard MIDI File importer. No file contents leave the browser. */
(function (root) {
  "use strict";
  function parse(buffer, options = {}) {
    const bytes =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length > 262144)
      throw Error("MIDI-Datei ist größer als 256 KiB.");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 0,
      events = 0;
    const need = (n, limit = bytes.length) => {
      if (p + n > limit) throw Error("MIDI-Datei ist abgeschnitten.");
    };
    const word = () => {
      need(2);
      const n = view.getUint16(p);
      p += 2;
      return n;
    };
    const long = () => {
      need(4);
      const n = view.getUint32(p);
      p += 4;
      return n;
    };
    const text = () => {
      need(4);
      return String.fromCharCode(...bytes.slice(p, (p += 4)));
    };
    function variable(limit) {
      let value = 0;
      for (let i = 0; i < 4; i++) {
        need(1, limit);
        const b = bytes[p++];
        value = value * 128 + (b & 127);
        if (!(b & 128)) return value;
      }
      throw Error("Ungültige variable MIDI-Länge.");
    }
    if (text() !== "MThd") throw Error("Keine Standard-MIDI-Datei.");
    const headerLength = long();
    if (headerLength < 6) throw Error("Ungültiger MIDI-Header.");
    need(headerLength);
    const headerEnd = p + headerLength;
    const format = word(),
      tracks = word(),
      division = word();
    if (format > 1 || !tracks || tracks > 64 || (format === 0 && tracks !== 1))
      throw Error(
        "Unterstützt werden MIDI-Format 0/1 mit höchstens 64 Spuren.",
      );
    if (division & 32768 || !division)
      throw Error(
        "SMPTE-Zeitbasis wird nicht unterstützt; bitte PPQN-MIDI verwenden.",
      );
    p = headerEnd;
    const selectedChannel = options.channel || 0,
      transpose = options.transpose || 0;
    if (
      !Number.isInteger(selectedChannel) ||
      selectedChannel < 0 ||
      selectedChannel > 16 ||
      !Number.isInteger(transpose) ||
      Math.abs(transpose) > 48
    )
      throw Error("Ungültiger Importkanal oder Transposition.");
    const attacks = new Map();
    let lastNoteOff = 0,
      firstTempo = 500000,
      tempoEvents = 0;
    for (let track = 0; track < tracks; track++) {
      if (text() !== "MTrk") throw Error("MIDI-Spur fehlt.");
      const length = long();
      need(length);
      const end = p + length;
      let tick = 0,
        running = 0;
      while (p < end) {
        if (++events > 20000)
          throw Error("MIDI-Datei enthält zu viele Ereignisse.");
        tick += variable(end);
        need(1, end);
        let status = bytes[p];
        if (status & 128) {
          p++;
          if (status < 240) running = status;
        } else {
          if (!running) throw Error("MIDI-Running-Status fehlt.");
          status = running;
        }
        if (status === 255) {
          running = 0;
          need(1, end);
          const type = bytes[p++],
            size = variable(end);
          need(size, end);
          if (type === 81) {
            if (size !== 3) throw Error("Ungültiges MIDI-Tempo.");
            const tempo = bytes[p] * 65536 + bytes[p + 1] * 256 + bytes[p + 2];
            if (!tempo) throw Error("MIDI-Tempo ist null.");
            if (tick === 0) firstTempo = tempo;
            tempoEvents++;
          }
          p += size;
          if (type === 47) {
            if (size !== 0) throw Error("Ungültiges Spur-Ende.");
            p = end;
          }
          continue;
        }
        if (status === 240 || status === 247) {
          running = 0;
          const size = variable(end);
          need(size, end);
          p += size;
          continue;
        }
        if (status >= 240)
          throw Error("Nicht unterstütztes MIDI-Systemereignis.");
        const kind = status >> 4,
          channel = (status & 15) + 1;
        const size = kind === 12 || kind === 13 ? 1 : 2;
        need(size, end);
        const a = bytes[p++],
          b = size === 2 ? bytes[p++] : 0;
        if (a > 127 || b > 127) throw Error("Ungültige MIDI-Datenbytes.");
        if (
          (selectedChannel && channel !== selectedChannel) ||
          (!selectedChannel && channel === 10)
        )
          continue;
        if (kind === 9 && b > 0) {
          const note = a + transpose;
          if (note < 0 || note > 127)
            throw Error("Transponierte Note außerhalb von MIDI 0–127.");
          if (!attacks.has(tick)) attacks.set(tick, new Set());
          attacks.get(tick).add(note);
        } else if (kind === 8 || (kind === 9 && b === 0))
          lastNoteOff = Math.max(lastNoteOff, tick);
      }
    }
    const groups = [...attacks.entries()].sort((a, b) => a[0] - b[0]);
    if (!groups.length)
      throw Error("Keine spielbaren Noten im gewählten Kanal gefunden.");
    if (groups.length > 128)
      throw Error(
        "Mehr als 128 Noteneinsätze. Bitte einen kürzeren MIDI-Ausschnitt wählen.",
      );
    const steps = groups.map(([tick, notes], i) => {
      if (notes.size > 8)
        throw Error(
          "Mehr als 8 gleichzeitige Noten. Bitte einen einzelnen MIDI-Kanal wählen.",
        );
      const next =
        i + 1 < groups.length
          ? groups[i + 1][0]
          : Math.max(lastNoteOff, tick + division);
      const ticks = Math.round(((next - tick) * 480) / division);
      if (ticks < 60 || ticks > 7680)
        throw Error("Notenabstand außerhalb von 1/8 bis 16 Viertelschlägen.");
      return { notes: [...notes].sort((a, b) => a - b), ticks };
    });
    return {
      steps,
      bpm: Math.round(60000000 / firstTempo),
      tempoChanges: tempoEvents > 1,
      format,
      tracks,
    };
  }
  root.MidiFile = { parse };
  if (typeof module !== "undefined" && module.exports)
    module.exports = { parse };
})(typeof window !== "undefined" ? window : globalThis);
