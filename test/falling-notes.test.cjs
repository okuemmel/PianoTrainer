const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  Timeline,
  geometry,
  trainingNotes,
  View,
} = require("../data/falling-notes.js");

test("piano roll aligns every bar with proportional white/black keys in all keyboard profiles", () => {
  for (const [base, count] of [
    [48, 49],
    [36, 61],
    [28, 76],
    [21, 88],
    [37, 61],
  ]) {
    for (const width of [320, 768, 1440]) {
      const keys = geometry(base, count, width);
      assert.equal(keys.length, count);
      for (const k of keys) {
        assert.ok(k.x >= -0.001 && k.x + k.width <= width + 0.001);
        assert.ok(Math.abs(k.center - (k.x + k.width / 2)) < 0.001);
      }
      const white = keys.find((k) => !k.black),
        black = keys.find((k) => k.black);
      assert.ok(Math.abs(black.width / white.width - 0.62) < 0.001);
      const c = keys.find((k) => k.note % 12 === 0),
        sharp = keys.find((k) => k.note === c.note + 1);
      assert.ok(Math.abs(sharp.center - (c.x + c.width)) < 0.001);
    }
  }
});
test("visible window handles held notes, chords, exact releases and arbitrary forward/backward seeks", () => {
  const long = { note: 48, time: 0, duration: 12 },
    short = { note: 60, time: 2, duration: 1 },
    future = { note: 62, time: 9, duration: 1 };
  const timeline = new Timeline([future, short, long]);
  assert.deepEqual(timeline.visible(8, 4), [long, future]);
  assert.deepEqual(timeline.visible(2, 4), [long, short]);
  assert.deepEqual(timeline.visible(3, 4), [long]);
  assert.deepEqual(timeline.visible(12, 4), []);
  assert.deepEqual(timeline.visible(Infinity), []);
  assert.equal(timeline.visible(0, 1).length, 1);
});
test("lesson timeline includes rests, count-in and original per-note durations scaled to practice tempo", () => {
  const steps = [
    { notes: [48, 60], ticks: 480 },
    { notes: [], ticks: 240 },
    { notes: [62], ticks: 480 },
  ];
  const slow = trainingNotes(steps, 60, 4, [{ 48: 2, 60: 0.25 }]);
  const fast = trainingNotes(steps, 120, 2, [{ 48: 2, 60: 0.25 }]);
  assert.deepEqual(slow.times, [4, 5, 5.5]);
  assert.deepEqual(fast.times, [2, 2.5, 2.75]);
  assert.equal(slow.timeline.notes[0].duration, 2);
  assert.equal(fast.timeline.notes[0].duration, 1);
  assert.equal(slow.timeline.notes[1].duration, 0.25);
});
test("canvas loop uses one RAF, freezes with its clock, colors hands and held keys and stops when hidden", () => {
  const frames = new Map();
  let next = 0,
    position = 1;
  const original = [global.requestAnimationFrame, global.cancelAnimationFrame];
  global.requestAnimationFrame = (fn) => {
    frames.set(++next, fn);
    return next;
  };
  global.cancelAnimationFrame = (id) => frames.delete(id);
  try {
    const calls = [],
      ctx = new Proxy(
        {},
        {
          get: (o, k) =>
            o[k] || ((...args) => calls.push([k, ctx.fillStyle, ...args])),
        },
      );
    const canvas = {
      clientWidth: 768,
      clientHeight: 380,
      getContext: () => ctx,
    };
    const timeline = new Timeline([
      { note: 48, time: 1, duration: 0.5 },
      { note: 60, time: 2, duration: 1 },
    ]);
    const view = new View(canvas, () => ({
      base: 36,
      keys: 61,
      position,
      timeline,
      held: [64],
    }));
    view.setVisible(true);
    view.setVisible(true);
    assert.equal(frames.size, 1);
    const tick = () => {
      const [id, fn] = [...frames][0];
      frames.delete(id);
      calls.length = 0;
      fn(10);
      return calls.filter((c) => c[0] === "fillRect").map((c) => [...c]);
    };
    const first = tick(),
      paused = tick();
    assert.deepEqual(paused, first);
    assert.ok(first.some((c) => c[1] === "#58a6ff"));
    assert.ok(first.some((c) => c[1] === "#54e3a2"));
    position = 2;
    assert.notDeepEqual(tick(), first);
    position = 1;
    assert.deepEqual(tick(), first);
    assert.equal(frames.size, 1);
    view.setVisible(false);
    assert.equal(frames.size, 0);
  } finally {
    [global.requestAnimationFrame, global.cancelAnimationFrame] = original;
  }
});
