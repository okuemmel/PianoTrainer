const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Player } = require("../data/midi-player.js");
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
    duration: 1.5,
    notes: [
      { note: 69, velocity: 127, time: 0, duration: 0.5 },
      { note: 72, velocity: 80, time: 0.5, duration: 1 },
    ],
  });
  assert.equal(oscillators[0].frequency.value, 440);
  assert.equal(oscillators[0].starts[0], 0);
  assert.equal(oscillators[0].stops[0], 0.75);
  assert.deepEqual(notifications.at(-1).notes, [{ note: 69, velocity: 127 }]);
  player.context.currentTime = 0.4;
  tick();
  assert.deepEqual(notifications.at(-1).notes, [{ note: 69, velocity: 127 }]);
  player.context.currentTime = 0.25;
  player.pause();
  assert.equal(player.state, "paused");
  assert.equal(player.position, 0.25);
  assert.equal(player.voices.size, 0);
  assert.deepEqual(notifications.at(-1).notes, []);
  player.context.currentTime = 2;
  player.resume();
  assert.equal(player.state, "playing");
  player.context.currentTime = 2.35;
  tick();
  assert.ok(
    oscillators.some((o) => Math.abs(o.frequency.value - 523.25113) < 0.01),
  );
  player.context.currentTime = 4;
  tick();
  assert.equal(player.state, "completed");
  assert.equal(player.voices.size, 0);
  assert.equal(tick, null);
  assert.equal(notifications.at(-1).position, 1.5);
});
