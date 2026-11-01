const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Player, scoreSteps } = require("../data/midi-player.js");
test("MIDI player schedules exact pitch and release, supports pause/resume and cancels all voices", async () => {
  let tick;
  const oscillators = [],
    notifications = [];
  class Audio {
    state = "suspended";
    currentTime = 0;
    destination = {};
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
          setTargetAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
    createOscillator() {
      const o = {
        frequency: {},
        stops: [],
        starts: [],
        connect() {},
        disconnect() {},
        start(t) {
          this.starts.push(t);
        },
        stop(t) {
          this.stops.push(t);
        },
      };
      oscillators.push(o);
      return o;
    }
  }
  const player = new Player((view) => notifications.push(view), Audio, {
    setInterval(fn) {
      tick = fn;
      return 1;
    },
    clearInterval() {
      tick = null;
    },
  });
  await player.unlock();
  player.play({
    duration: 120,
    notes: [
      { note: 69, velocity: 127, time: 0, duration: 0.5 },
      { note: 72, velocity: 80, time: 0.5, duration: 1 },
      { note: 60, velocity: 100, time: 90, duration: 1 },
    ],
  });
  assert.equal(oscillators[0].frequency.value, 440);
  assert.equal(oscillators[0].starts[0], 0);
  assert.equal(oscillators[0].stops[0], 0.75);
  assert.deepEqual(notifications.at(-1).notes, [{ note: 69, velocity: 127 }]);
  assert.equal(notifications.at(-1).upcoming[0].index, 0);
  player.context.currentTime = 0.4;
  tick();
  assert.deepEqual(notifications.at(-1).notes, [{ note: 69, velocity: 127 }]);
  player.context.currentTime = 0.25;
  player.pause();
  assert.equal(player.state, "paused");
  assert.equal(player.position, 0.25);
  assert.equal(notifications.at(-1).upcoming[0].index, 0);
  assert.equal(player.voices.size, 0);
  assert.deepEqual(notifications.at(-1).notes, []);
  player.context.currentTime = 2;
  player.resume();
  assert.equal(player.state, "playing");
  player.context.currentTime = 2.35;
  tick();
  assert.equal(notifications.at(-1).upcoming[0].index, 1);
  assert.ok(
    oscillators.some((o) => Math.abs(o.frequency.value - 523.25113) < 0.01),
  );
  player.context.currentTime = 20;
  tick();
  assert.equal(player.state, "playing");
  assert.equal(player.position, 18.25);
  const previousVoices = [...player.voices];
  player.seek(0.25);
  assert.equal(player.state, "playing");
  assert.equal(notifications.at(-1).position, 0.25);
  assert.ok(previousVoices.every((voice) => !player.voices.has(voice)));
  assert.deepEqual(notifications.at(-1).notes, [{ note: 69, velocity: 127 }]);
  player.pause();
  player.seek(-10);
  assert.equal(player.state, "paused");
  assert.equal(player.position, 0);
  assert.equal(player.voices.size, 0);
  player.seek(1000);
  assert.equal(player.position, 120);
  player.seek(NaN);
  assert.equal(player.position, 120);
  player.resume();
  assert.equal(player.position, 120);
  player.context.currentTime = 123;
  tick();
  assert.equal(player.state, "completed");
  assert.equal(player.voices.size, 0);
  assert.equal(tick, null);
  assert.equal(notifications.at(-1).position, 120);
  assert.deepEqual(notifications.at(-1).upcoming, []);
});

test("playback score groups chords and keeps beat distances through tempo changes with a bounded rolling window", () => {
  const performance = {
    bpm: 120,
    notes: [
      { note: 67, time: 0, beat: 0 },
      { note: 60, time: 0, beat: 0 },
      { note: 60, time: 0, beat: 0 },
      { note: 62, time: 0.5, beat: 1 },
      { note: 64, time: 1.5, beat: 2 },
    ],
  };
  const groups = scoreSteps(performance);
  assert.deepEqual(groups[0].notes, [60, 67]);
  assert.deepEqual(
    groups.map((s) => s.ticks),
    [480, 480, 0],
  );
  const player = new Player();
  player.scoreSteps = scoreSteps({
    notes: Array.from({ length: 20 }, (_, i) => ({
      note: 60,
      time: i,
      beat: i,
    })),
  });
  player.state = "playing";
  assert.deepEqual(
    player.scoreStatus(12.4).upcoming.map((s) => s.index),
    [12, 13, 14, 15, 16, 17],
  );
  assert.equal(player.scoreStatus(19.1).upcoming.length, 1);
});
