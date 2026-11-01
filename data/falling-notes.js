/* Read-only piano roll: one animation loop, driven by the existing audio/device clocks. */
(function (root) {
  "use strict";
  const black = (note) => [1, 3, 6, 8, 10].includes(note % 12);
  const colors = { left: "#58a6ff", right: "#54e3a2" };
  function geometry(base, count, width) {
    let whites = 0;
    const leading = black(base) ? 0.31 : 0;
    const keys = [];
    for (let note = base; note < base + count; note++) {
      const dark = black(note),
        size = dark ? 0.62 : 1;
      const center = leading + whites + (dark ? 0 : 0.5);
      keys.push({
        note,
        black: dark,
        x: center - size / 2,
        width: size,
        center,
      });
      if (!dark) whites++;
    }
    const scale = width / Math.max(...keys.map((key) => key.x + key.width));
    return keys.map((key) => ({
      ...key,
      x: key.x * scale,
      width: key.width * scale,
      center: key.center * scale,
    }));
  }
  function upperBound(values, value) {
    let lo = 0,
      hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (values[mid] <= value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  class Timeline {
    constructor(notes = []) {
      this.notes = notes
        .filter(
          (n) =>
            Number.isFinite(n.time) &&
            Number.isFinite(n.duration) &&
            n.duration > 0,
        )
        .slice()
        .sort((a, b) => a.time - b.time);
      this.starts = this.notes.map((n) => n.time);
      let end = -Infinity;
      this.ends = this.notes.map(
        (n) => (end = Math.max(end, n.time + n.duration)),
      );
    }
    visible(position, preview = 4) {
      const first = upperBound(this.ends, position),
        last = upperBound(this.starts, position + preview);
      return this.notes
        .slice(first, last)
        .filter((n) => n.time + n.duration > position);
    }
  }
  function trainingNotes(steps, bpm, countIn = 0, durations = null) {
    let time = countIn;
    const notes = [],
      times = [];
    for (let index = 0; index < steps.length; index++) {
      const step = steps[index],
        duration = ((step.ticks / 480) * 60) / bpm;
      times.push(time);
      for (const note of step.notes)
        notes.push({
          note,
          time,
          duration: (durations?.[index]?.[note] * 60) / bpm || duration,
        });
      time += duration;
    }
    return { timeline: new Timeline(notes), times };
  }
  class View {
    constructor(canvas, snapshot) {
      this.canvas = canvas;
      this.snapshot = snapshot;
      this.enabled = false;
      this.frame = null;
      this.flashes = new Map();
      this.preview = 4;
      this.split = 60;
    }
    flash(notes, now = root.performance.now()) {
      for (const note of notes) this.flashes.set(note, now + 220);
    }
    setVisible(visible) {
      this.enabled = visible;
      if (!visible && this.frame !== null) {
        root.cancelAnimationFrame?.(this.frame);
        this.frame = null;
      }
      if (visible && this.frame === null && root.requestAnimationFrame) {
        const tick = (now) => {
          this.frame = null;
          if (!this.enabled) return;
          this.draw(now);
          this.frame = root.requestAnimationFrame(tick);
        };
        this.frame = root.requestAnimationFrame(tick);
      }
    }
    draw(now) {
      const state = this.snapshot(now);
      if (!state) return;
      const width = this.canvas.clientWidth || 640,
        height = this.canvas.clientHeight || 380;
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      if (
        this.canvas.width !== Math.round(width * dpr) ||
        this.canvas.height !== Math.round(height * dpr)
      ) {
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
      }
      const ctx = this.canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const keys = geometry(state.base, state.keys, width),
        byNote = new Map(keys.map((k) => [k.note, k]));
      const keyboardHeight = Math.min(100, Math.max(62, height * 0.22)),
        line = height - keyboardHeight;
      const speed = line / this.preview,
        active = new Map();
      ctx.fillStyle = "#0b111b";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#1c2939";
      ctx.lineWidth = 1;
      for (const key of keys.filter((k) => !k.black)) {
        ctx.beginPath();
        ctx.moveTo(key.x, 0);
        ctx.lineTo(key.x, line);
        ctx.stroke();
      }
      ctx.strokeStyle = "#243447";
      for (
        let second = Math.ceil(state.position);
        second < state.position + this.preview;
        second++
      ) {
        const y = line - (second - state.position) * speed;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, line);
      ctx.clip();
      for (const n of state.timeline.visible(state.position, this.preview)) {
        const key = byNote.get(n.note);
        if (!key) continue;
        const color =
          colors[n.hand || (n.note < this.split ? "left" : "right")] ||
          colors.right;
        const on = n.time <= state.position;
        if (on) active.set(n.note, color);
        const bottom = line - (n.time - state.position) * speed;
        const top = line - (n.time + n.duration - state.position) * speed;
        ctx.fillStyle =
          (this.flashes.get(n.note) || 0) > now ? "#ffffff" : color;
        ctx.globalAlpha = on ? 1 : 0.82;
        const gap = Math.min(1.5, key.width * 0.12);
        ctx.fillRect(
          key.x + gap,
          Math.max(-4, top),
          key.width - gap * 2,
          Math.max(1.5, bottom - Math.max(-4, top)),
        );
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      for (const note of state.held || [])
        active.set(note, note < this.split ? colors.left : colors.right);
      for (const [note, until] of this.flashes)
        if (until > now) active.set(note, "#ffffff");
      for (const dark of [false, true])
        for (const key of keys.filter((k) => k.black === dark)) {
          const h = dark ? keyboardHeight * 0.63 : keyboardHeight;
          ctx.fillStyle =
            active.get(key.note) || (dark ? "#131d2b" : "#dce5ed");
          ctx.fillRect(key.x + 0.5, line, Math.max(0.5, key.width - 1), h);
          if (!dark && key.note % 12 === 0 && key.width > 9) {
            ctx.fillStyle = "#526276";
            ctx.font = Math.min(12, key.width * 0.65) + "px system-ui";
            ctx.textAlign = "center";
            ctx.fillText(
              "C" + (Math.floor(key.note / 12) - 1),
              key.center,
              height - 9,
            );
          }
        }
      ctx.strokeStyle = "#a6c8d9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, line);
      ctx.lineTo(width, line);
      ctx.stroke();
      for (const [note, until] of this.flashes)
        if (until < now) this.flashes.delete(note);
    }
    destroy() {
      this.setVisible(false);
      this.flashes.clear();
    }
  }
  root.FallingNotes = { View, Timeline, geometry, trainingNotes };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.FallingNotes;
})(typeof window !== "undefined" ? window : globalThis);
