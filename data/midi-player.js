/* Local sampled piano with synthesis fallback; no training MIDI events. */
(function (root) {
  "use strict";
  function scoreSteps(performance) {
    const groups = [];
    const bpm = performance.bpm || 120;
    for (const note of [...performance.notes].sort((a, b) => a.time - b.time)) {
      let group = groups[groups.length - 1];
      if (!group || group.time !== note.time) {
        group = {
          index: groups.length,
          time: note.time,
          beat: note.beat ?? (note.time * bpm) / 60,
          notes: [],
        };
        groups.push(group);
      }
      if (!group.notes.includes(note.note)) group.notes.push(note.note);
    }
    for (let i = 0; i < groups.length; i++) {
      groups[i].notes.sort((a, b) => a - b);
      groups[i].ticks =
        i + 1 < groups.length
          ? Math.max(1, Math.round((groups[i + 1].beat - groups[i].beat) * 480))
          : 0;
    }
    return groups;
  }
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
      this.samples = null;
      this.sampleError = "";
      this.preparing = null;
      this.scoreSteps = [];
    }
    unlock() {
      this.Audio ||= root.AudioContext || root.webkitAudioContext;
      if (!this.Audio)
        throw Error("Dieser Browser unterstützt keine Web-Audio-Ausgabe.");
      if (!this.context) {
        this.context = new this.Audio();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume * 0.35;
        this.master.connect(this.context.destination);
      }
      const resumed =
        this.context.state === "suspended"
          ? this.context.resume()
          : Promise.resolve();
      if (!root.PianoAudio) return resumed;
      if (!this.preparing)
        this.preparing = resumed.then(async () => {
          try {
            this.samples = await root.PianoAudio.bank.prepare(this.context);
            this.sampleError = "";
          } catch (error) {
            this.sampleError = error.message;
            this.preparing = null;
          }
        });
      return resumed.then(() => this.preparing);
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
      const changed = this.performance !== performance;
      this.stop();
      this.performance = performance;
      if (changed) this.scoreSteps = scoreSteps(performance);
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
          ...this.scoreStatus(this.position),
          sound: this.samples
            ? "Klavier-Samples"
            : "Synthesizer" +
              (this.sampleError ? " (Klavier nicht geladen)" : ""),
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
    scoreStatus(position) {
      let low = 0,
        high = this.scoreSteps.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (this.scoreSteps[middle].time <= position) low = middle + 1;
        else high = middle;
      }
      return {
        scoreTotal: this.scoreSteps.length,
        upcoming:
          this.state === "completed"
            ? []
            : this.scoreSteps.slice(
                Math.max(0, low - 1),
                Math.max(0, low - 1) + 6,
              ),
      };
    }
    schedule(note, elapsed) {
      if (this.voices.size >= 32)
        this.release(this.voices.values().next().value);
      const start = this.context.currentTime + Math.max(0, note.time - elapsed),
        end =
          start +
          Math.max(0.03, note.duration - Math.max(0, elapsed - note.time));
      const sample = root.PianoAudio?.sampleVoice(
        this.context,
        this.master,
        this.samples,
        note.note,
        note.velocity,
        start,
        end,
        (voice) => this.voices.delete(voice),
      );
      if (sample) {
        this.voices.add(sample);
        return;
      }
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
    stop(reason = "") {
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
        reason,
        upcoming: [],
        scoreTotal: 0,
      });
    }
    pause(reason = "") {
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
        reason,
        ...this.scoreStatus(position),
      });
    }
    resume() {
      if (this.state === "paused") this.play(this.performance, this.position);
    }
  }
  root.MidiPlayer = { Player, scoreSteps };
  if (typeof module !== "undefined" && module.exports)
    module.exports = { Player, scoreSteps };
})(typeof window !== "undefined" ? window : globalThis);
