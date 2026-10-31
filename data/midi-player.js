/* Small local piano-like synthesizer for MIDI listening; no device MIDI events. */
(function (root) {
  "use strict";
  class Player {
    constructor(
      notify = () => {},
      Audio = root.AudioContext || root.webkitAudioContext,
      timers = root,
    ) {
      this.Audio = Audio;
      this.notify = notify;
      this.timers = timers;
      this.context = null;
      this.master = null;
      this.timer = null;
      this.voices = new Set();
      this.state = "stopped";
      this.position = 0;
      this.volume = 0.55;
      this.performance = null;
    }
    unlock() {
      if (!this.Audio)
        throw Error("Dieser Browser unterstützt keine Web-Audio-Ausgabe.");
      if (!this.context) {
        this.context = new this.Audio();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume * 0.35;
        this.master.connect(this.context.destination);
      }
      return this.context.state === "suspended"
        ? this.context.resume()
        : Promise.resolve();
    }
    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, value));
      if (this.master)
        this.master.gain.setTargetAtTime(
          this.volume * 0.35,
          this.context.currentTime,
          0.02,
        );
    }
    play(performance, offset = 0) {
      this.stop();
      this.performance = performance;
      this.position = offset;
      this.next = 0;
      if (!this.context || this.context.state === "suspended")
        throw Error("Tonausgabe zuerst per Tippen aktivieren.");
      this.started = this.context.currentTime - offset;
      this.state = "playing";
      const tick = () => {
        const elapsed = this.context.currentTime - this.started;
        while (
          this.next < performance.notes.length &&
          performance.notes[this.next].time <= elapsed + 0.15
        ) {
          const note = performance.notes[this.next++];
          if (note.time + note.duration > elapsed) this.schedule(note, elapsed);
        }
        this.position = Math.min(elapsed, performance.duration);
        if (elapsed >= performance.duration + 0.3) {
          this.stop();
          this.position = performance.duration;
          this.state = "completed";
        }
        this.notify({
          state: this.state,
          position: this.position,
          duration: performance.duration,
          notes: [...this.voices]
            .filter(
              (v) =>
                v.start <= this.context.currentTime &&
                v.end > this.context.currentTime,
            )
            .map((v) => ({ note: v.note, velocity: v.velocity })),
        });
      };
      tick();
      if (this.state === "playing")
        this.timer = this.timers.setInterval(tick, 25);
    }
    schedule(note, elapsed) {
      if (this.voices.size >= 32)
        this.release(this.voices.values().next().value);
      const start = this.context.currentTime + Math.max(0, note.time - elapsed),
        end =
          start +
          Math.max(0.03, note.duration - Math.max(0, elapsed - note.time));
      const gain = this.context.createGain(),
        amplitude = (0.08 * note.velocity) / 127;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, amplitude),
        start + 0.008,
      );
      gain.gain.setTargetAtTime(amplitude * 0.2, start + 0.015, 0.4);
      gain.gain.setTargetAtTime(0.0001, end, 0.04);
      gain.connect(this.master);
      const voice = {
        gain,
        oscillators: [],
        start,
        end,
        note: note.note,
        velocity: note.velocity,
      };
      for (const harmonic of [1, 2, 3]) {
        const oscillator = this.context.createOscillator(),
          level = this.context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value =
          440 * Math.pow(2, (note.note - 69) / 12) * harmonic;
        level.gain.value = 1 / (harmonic * harmonic);
        oscillator.connect(level);
        level.connect(gain);
        oscillator.start(start);
        oscillator.stop(end + 0.25);
        oscillator.onended = () => {
          oscillator.disconnect();
          level.disconnect();
          if (harmonic === 1) {
            gain.disconnect();
            this.voices.delete(voice);
          }
        };
        voice.oscillators.push(oscillator);
      }
      this.voices.add(voice);
    }
    release(voice) {
      for (const oscillator of voice.oscillators) {
        try {
          oscillator.stop(this.context.currentTime);
        } catch {}
      }
      voice.gain.disconnect();
      this.voices.delete(voice);
    }
    stop() {
      if (this.timer !== null) this.timers.clearInterval(this.timer);
      this.timer = null;
      for (const voice of [...this.voices]) this.release(voice);
      this.state = "stopped";
      this.position = 0;
      this.notify({
        state: this.state,
        position: 0,
        duration: this.performance?.duration || 0,
        notes: [],
      });
    }
    pause() {
      if (this.state !== "playing") return;
      const position = this.context.currentTime - this.started;
      this.stop();
      this.position = position;
      this.state = "paused";
      this.notify({
        state: this.state,
        position,
        duration: this.performance.duration,
        notes: [],
      });
    }
    resume() {
      if (this.state === "paused") this.play(this.performance, this.position);
    }
  }
  root.MidiPlayer = { Player };
  if (typeof module !== "undefined" && module.exports)
    module.exports = { Player };
})(typeof window !== "undefined" ? window : globalThis);
