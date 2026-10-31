/* Local Standard MIDI File importer. No file contents leave the browser. */
(function (root) {
  "use strict";
  function parse(buffer, options = {}) {
    const bytes =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes.length > 2097152) throw Error("MIDI-Datei ist größer als 2 MiB.");
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
    const startStep = options.startStep ?? 0,
      minNote = options.minNote ?? 0,
      maxNote = options.maxNote ?? 127;
    if (
      !Number.isInteger(startStep) ||
      startStep < 0 ||
      !Number.isInteger(minNote) ||
      !Number.isInteger(maxNote) ||
      minNote < 0 ||
      maxNote > 127 ||
      minNote > maxNote
    )
      throw Error("Ungültiger Abschnitt oder Tastaturbereich.");
    const performance = [],
      tempos = [{ tick: 0, tempo: 500000 }];
    const attacks = new Map(),
      channels = new Set();
    let droppedNotes = 0,
      quantized = false;
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
        if (++events > 250000)
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
            if (options.performanceOnly) tempos.push({ tick, tempo });
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
        if (kind === 9 && b > 0) channels.add(channel);
        if (
          (selectedChannel && channel !== selectedChannel) ||
          (!selectedChannel && channel === 10)
        )
          continue;
        if (options.performanceOnly && (kind === 8 || kind === 9)) {
          const note = a + transpose;
          if (note < 0 || note > 127)
            throw Error("Transponierte Note außerhalb von MIDI 0–127.");
          if (note >= minNote && note <= maxNote)
            performance.push({
              tick,
              note,
              velocity: b,
              channel,
              on: kind === 9 && b > 0,
            });
          continue;
        }
        if (kind === 9 && b > 0) {
          const note = a + transpose;
          if (note < 0 || note > 127)
            throw Error("Transponierte Note außerhalb von MIDI 0–127.");
          if (note < minNote || note > maxNote) {
            droppedNotes++;
            continue;
          }
          const normalized = (tick * 480) / division;
          const gridTick = Math.round(normalized / 60) * 60;
          if (Math.abs(gridTick - normalized) > 0.01) quantized = true;
          if (!attacks.has(gridTick)) attacks.set(gridTick, new Set());
          attacks.get(gridTick).add(note);
        } else if (kind === 8 || (kind === 9 && b === 0))
          lastNoteOff = Math.max(
            lastNoteOff,
            Math.round((tick * 480) / division / 60) * 60,
          );
      }
    }
    if (options.performanceOnly) {
      tempos.sort((a, b) => a.tick - b.tick);
      performance.sort((a, b) => a.tick - b.tick);
      let tempo = 500000,
        lastTick = 0,
        seconds = 0,
        cursor = 0;
      for (const event of performance) {
        while (cursor < tempos.length && tempos[cursor].tick <= event.tick) {
          const next = tempos[cursor++];
          seconds += ((next.tick - lastTick) * tempo) / division / 1000000;
          lastTick = next.tick;
          tempo = next.tempo;
        }
        event.time =
          seconds + ((event.tick - lastTick) * tempo) / division / 1000000;
        if (!Number.isFinite(event.time) || event.time > 7200)
          throw Error("MIDI-Wiedergabe ist länger als zwei Stunden.");
      }
      const held = new Map(),
        notes = [];
      const first = performance.find((e) => e.on);
      const origin = first?.time;
      if (origin === undefined)
        throw Error("Keine spielbaren Noten im gewählten Kanal gefunden.");
      const end = Math.max(origin, ...performance.slice(-1).map((e) => e.time));
      for (const event of performance) {
        const key = event.channel + ":" + event.note;
        if (event.on) {
          const voice = {
            note: event.note,
            velocity: event.velocity,
            time: event.time - origin,
            beat: (event.tick - first.tick) / division,
            duration: null,
          };
          if (!held.has(key)) held.set(key, []);
          held.get(key).push(voice);
          notes.push(voice);
        } else {
          const voice = held.get(key)?.shift();
          if (voice)
            voice.duration = Math.max(0.03, event.time - origin - voice.time);
        }
      }
      for (const note of notes)
        if (note.duration === null)
          note.duration = Math.max(
            0.1,
            Math.min(2, end - origin - note.time + 0.5),
          );
      return {
        notes,
        duration: notes.reduce(
          (end, note) => Math.max(end, note.time + note.duration),
          0,
        ),
        bpm: Math.round(60000000 / firstTempo),
      };
    }
    const groups = [...attacks.entries()].sort((a, b) => a[0] - b[0]);
    if (!groups.length)
      throw Error("Keine spielbaren Noten im gewählten Kanal gefunden.");
    const allSteps = [];
    for (let i = 0; i < groups.length; i++) {
      const [tick, notes] = groups[i];
      const next =
        i + 1 < groups.length
          ? groups[i + 1][0]
          : Math.max(lastNoteOff, tick + 480);
      let remaining = Math.max(60, next - tick);
      const ticks = Math.min(7680, remaining);
      allSteps.push({ notes: [...notes].sort((a, b) => a - b), ticks });
      remaining -= ticks;
      while (remaining > 0) {
        const rest = Math.min(7680, remaining);
        allSteps.push({ notes: [], ticks: rest });
        remaining -= rest;
        if (allSteps.length > 100000)
          throw Error("MIDI-Zeitachse ist zu lang.");
      }
    }
    if (startStep >= allSteps.length)
      throw Error(
        "Abschnitt beginnt hinter dem letzten Einsatz (" +
          allSteps.length +
          ").",
      );
    const steps = allSteps.slice(startStep, startStep + 128);
    if (steps.some((step) => step.notes.length > 8))
      throw Error(
        "Mehr als 8 gleichzeitige Noten. Bitte einen einzelnen MIDI-Kanal wählen.",
      );
    if (!steps.some((step) => step.notes.length))
      throw Error(
        "Dieser Abschnitt enthält nur Pausen. Anderen Start-Einsatz wählen.",
      );
    return {
      steps,
      totalSteps: allSteps.length,
      startStep,
      quantized,
      droppedNotes,
      channels: [...channels].sort((a, b) => a - b),
      events,
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
