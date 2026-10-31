const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parse } = require("../data/midi-file.js");
const vlq = (n) => {
  const a = [n & 127];
  while ((n >>= 7)) a.unshift((n & 127) | 128);
  return a;
};
const u32 = (n) => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
function file(tracks, division = 480, format = tracks.length > 1 ? 1 : 0) {
  return Uint8Array.from([
    ...Buffer.from("MThd"),
    0,
    0,
    0,
    6,
    0,
    format,
    0,
    tracks.length,
    division >> 8,
    division & 255,
    ...tracks.flatMap((t) => [...Buffer.from("MTrk"), ...u32(t.length), ...t]),
  ]);
}
const end = [0, 255, 47, 0];
test("format 0, running status, velocity-zero off and PPQN conversion", () => {
  const data = file([
    [
      0,
      144,
      60,
      100,
      ...vlq(480),
      60,
      0,
      0,
      62,
      100,
      ...vlq(480),
      128,
      62,
      0,
      ...end,
    ],
  ]);
  assert.deepEqual(parse(data).steps, [
    { notes: [60], ticks: 480 },
    { notes: [62], ticks: 480 },
  ]);
});
test("format 1 merges simultaneous attacks into chords and excludes percussion by default", () => {
  const a = [0, 144, 60, 100, ...vlq(480), 128, 60, 0, ...end];
  const b = [0, 145, 64, 100, ...vlq(480), 129, 64, 0, ...end];
  const drum = [0, 153, 36, 100, ...vlq(480), 137, 36, 0, ...end];
  assert.deepEqual(parse(file([a, b, drum])).steps[0].notes, [60, 64]);
  assert.deepEqual(parse(file([a, b, drum]), { channel: 10 }).steps[0].notes, [
    36,
  ]);
  assert.deepEqual(
    parse(file([a, b]), { channel: 2, transpose: 12 }).steps[0].notes,
    [76],
  );
});
test("tempo metadata is read and changes are reported for fixed-tempo practice", () => {
  const data = file([
    [
      0,
      255,
      81,
      3,
      7,
      161,
      32,
      0,
      144,
      60,
      100,
      ...vlq(480),
      128,
      60,
      0,
      0,
      255,
      81,
      3,
      15,
      66,
      64,
      ...end,
    ],
  ]);
  assert.equal(parse(data).bpm, 120);
  assert.equal(parse(data).tempoChanges, true);
});
test("truncated chunks, illegal running status, SMPTE and invalid formats are rejected", () => {
  assert.throws(() => parse(Uint8Array.from([77, 84])), /abgeschnitten/);
  assert.throws(() => parse(file([[0, 60, 100, ...end]])), /Running/);
  assert.throws(() => parse(file([[...end]], 0x8001)), /SMPTE/);
  assert.throws(() => parse(file([[...end]], 480, 2)), /Format/);
  assert.throws(() => parse(file([[0, 144, 60]])), /abgeschnitten/);
});
test("bounded import rejects oversized chords and splits long lessons into selected sections", () => {
  const chord = [];
  for (let n = 60; n < 69; n++) chord.push(0, 144, n, 100);
  chord.push(...vlq(480), 128, 60, 0, ...end);
  assert.throws(() => parse(file([chord])), /8 gleichzeitige/);
  const long = [];
  for (let n = 0; n < 129; n++) long.push(...vlq(n ? 480 : 0), 144, 60, 100);
  long.push(...end);
  const first = parse(file([long]));
  assert.equal(first.steps.length, 128);
  assert.equal(first.totalSteps, 129);
  assert.equal(parse(file([long]), { startStep: 128 }).steps.length, 1);
  assert.throws(
    () => parse(file([long]), { startStep: 129 }),
    /hinter dem letzten/,
  );
  assert.throws(() => parse(new Uint8Array(2097153)), /2 MiB/);
});
test("invalid data bytes and transposition beyond MIDI range fail cleanly", () => {
  assert.throws(() => parse(file([[0, 144, 60, 200, ...end]])), /Datenbytes/);
  assert.throws(
    () =>
      parse(file([[0, 144, 120, 100, ...vlq(480), 128, 120, 0, ...end]]), {
        transpose: 12,
      }),
    /außerhalb/,
  );
});

test("dense attacks are quantized, keyboard filtering is explicit and long pauses are retained", () => {
  const data = file([
    [
      0,
      144,
      36,
      100,
      0,
      144,
      60,
      100,
      ...vlq(4),
      144,
      64,
      100,
      ...vlq(16000),
      144,
      67,
      100,
      ...end,
    ],
  ]);
  const result = parse(data, { minNote: 48, maxNote: 96 });
  assert.deepEqual(result.steps[0], { notes: [60, 64], ticks: 7680 });
  assert.equal(result.quantized, true);
  assert.equal(result.droppedNotes, 1);
  assert.ok(result.steps.some((s) => s.notes.length === 0));
  assert.ok(result.steps.every((s) => s.ticks >= 60 && s.ticks <= 7680));
  assert.equal(
    result.steps.reduce((sum, s) => sum + s.ticks, 0),
    16500,
  );
});
test("browser parser handles more than 20000 events without sending the whole song", () => {
  const track = [];
  for (let i = 0; i < 21000; i++) track.push(...vlq(i ? 120 : 0), 144, 60, 100);
  track.push(...end);
  const result = parse(file([track]), { startStep: 20000 });
  assert.equal(result.totalSteps, 21000);
  assert.equal(result.steps.length, 128);
  assert.equal(result.startStep, 20000);
});

test("listening preserves note lengths and tempo changes without the 128-step training limit", () => {
  const data = file([
    [
      0,
      255,
      81,
      3,
      7,
      161,
      32,
      0,
      144,
      60,
      100,
      ...vlq(480),
      128,
      60,
      0,
      0,
      255,
      81,
      3,
      15,
      66,
      64,
      0,
      144,
      62,
      90,
      ...vlq(480),
      128,
      62,
      0,
      ...end,
    ],
  ]);
  const result = parse(data, { performanceOnly: true });
  assert.deepEqual(result.notes, [
    { note: 60, velocity: 100, time: 0, beat: 0, duration: 0.5 },
    { note: 62, velocity: 90, time: 0.5, beat: 1, duration: 1 },
  ]);
  assert.equal(result.duration, 1.5);
  const track = [];
  for (let i = 0; i < 200; i++)
    track.push(...vlq(i ? 120 : 0), 144, 60, 100, 60, 128, 60, 0);
  track.push(...end);
  assert.equal(
    parse(file([track]), { performanceOnly: true }).notes.length,
    200,
  );
});
test("listening keeps overlapping channels independent and repairs missing note offs", () => {
  const a = [0, 144, 60, 100, ...vlq(480), 128, 60, 0, ...end],
    b = [0, 145, 60, 80, ...vlq(960), 129, 60, 0, ...end];
  const result = parse(file([a, b]), { performanceOnly: true });
  assert.equal(result.notes[0].duration, 0.5);
  assert.equal(result.notes[1].duration, 1);
  const unfinished = parse(file([[0, 144, 60, 100, ...end]]), {
    performanceOnly: true,
  });
  assert.equal(unfinished.notes[0].duration, 0.5);
  assert.equal(
    parse(file([a, b]), { performanceOnly: true, channel: 2, transpose: 12 })
      .notes[0].note,
    72,
  );
});
