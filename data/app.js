"use strict";
const $ = (s) => document.querySelector(s);
let config = null,
  status = null,
  toastTimer,
  scanTimer;
let commandQueue = Promise.resolve();
const held = new Map();
let lastLedSnapshot = null,
  lastLedKey = "";
let trainingView = null,
  trainingReceivedAt = 0,
  pausePending = false,
  importedSteps = null;
async function api(path, body) {
  const response = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Trainer": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw Error(
      response.status === 401
        ? "Anmeldung erforderlich. Seite neu öffnen."
        : "Ungültige Geräteantwort.",
    );
  }
  if (!response.ok)
    throw Error(
      result.error || "Gerät antwortet mit Fehler " + response.status,
    );
  if (result.leds) renderLedPreview(result.leds);
  return result;
}
function toast(text, error = false) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.toggle("error", error);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 5000);
}
function run(fn) {
  return Promise.resolve()
    .then(fn)
    .catch((e) => toast(e.message, true));
}
function noteCommand(body) {
  commandQueue = commandQueue
    .catch(() => {})
    .then(() => api("midi", body))
    .then((reply) => {
      if (reply.training) renderTraining(reply.training);
      return reply;
    })
    .catch((e) => {
      toast(e.message, true);
      held.clear();
      document
        .querySelectorAll(".pressed")
        .forEach((k) => k.classList.remove("pressed"));
    });
  return commandQueue;
}
function route() {
  let hash = location.hash.slice(1) || "dashboard";
  if (!document.getElementById(hash)?.classList.contains("page"))
    hash = "dashboard";
  document.querySelectorAll(".page").forEach((p) => (p.hidden = p.id !== hash));
  document
    .querySelectorAll("nav a")
    .forEach((a) => a.classList.toggle("active", a.hash === "#" + hash));
  release();
  const mount = $(
    hash === "training" ? "#trainingKeyboardMount" : "#freeKeyboardMount",
  );
  if (mount && $("#keyboard")) mount.append($("#ledPreview"), $("#keyboard"));
  if (hash !== "training") pauseActiveTraining();
}
window.addEventListener("hashchange", route);
function noteName(n) {
  return (
    ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][n % 12] +
    (Math.floor(n / 12) - 1)
  );
}
function keyboard() {
  release();
  const box = $("#keyboard");
  box.replaceChildren();
  for (let n = config.baseNote; n < config.baseNote + config.keys; n++) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key" + ([1, 3, 6, 8, 10].includes(n % 12) ? " black" : "");
    key.textContent = noteName(n);
    key.title = "MIDI " + n;
    key.dataset.noteValue = n;
    key.setAttribute("aria-label", noteName(n) + ", MIDI " + n);
    key.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (e.isTrusted) key.setPointerCapture(e.pointerId);
      if (held.has(e.pointerId)) return;
      const channel = Number($("#sendChannel").value),
        velocity = Number($("#velocity").value);
      if (
        !Number.isInteger(channel) ||
        channel < 1 ||
        channel > 16 ||
        !Number.isInteger(velocity) ||
        velocity < 1 ||
        velocity > 127
      ) {
        toast("MIDI-Werte prüfen.", true);
        return;
      }
      held.set(e.pointerId, { note: n, channel, key });
      key.classList.add("pressed");
      noteCommand({ note: n, velocity, channel, on: true });
    });
    const up = (e) => {
      const h = held.get(e.pointerId);
      if (!h) return;
      held.delete(e.pointerId);
      if (![...held.values()].some((v) => v.note === h.note)) {
        key.classList.remove("pressed");
        noteCommand({
          note: h.note,
          velocity: 0,
          channel: h.channel,
          on: false,
        });
      }
    };
    key.addEventListener("pointerup", up);
    key.addEventListener("pointercancel", up);
    key.addEventListener("lostpointercapture", up);
    key.addEventListener("keydown", (e) => {
      if ((e.key === " " || e.key === "Enter") && !e.repeat) {
        e.preventDefault();
        key.dispatchEvent(
          new PointerEvent("pointerdown", { pointerId: 1000 + n }),
        );
      }
    });
    key.addEventListener("keyup", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        up({ pointerId: 1000 + n });
      }
    });
    box.append(key);
  }
}
function release() {
  if (!held.size) return commandQueue;
  held.clear();
  document
    .querySelectorAll(".pressed")
    .forEach((k) => k.classList.remove("pressed"));
  return noteCommand({ release: true });
}
window.addEventListener("blur", () => {
  release();
  pauseActiveTraining();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    release();
    pauseActiveTraining();
  }
});
$("#release").onclick = () => {
  release();
  run(() => api("midi", { release: true }));
};
function renderConfig() {
  const form = $("#ledForm");
  for (const name of [
    "count",
    "pin",
    "brightness",
    "first",
    "keys",
    "baseNote",
    "reversed",
    "rgb",
  ])
    form.elements[name].value = String(config[name]);
  $("#channel").value = config.channel;
  $("#sendChannel").value = config.channel || 1;
  $("#trainingRoot").value = config.baseNote + (config.keys >= 27 ? 12 : 0);
  $("#ledCount").textContent = config.count + " LEDs";
  $("#ledState").textContent = "GPIO " + config.pin + " · WS2812B";
  $("#ledIndex").max = config.count - 1;
  const map = $("#mapping");
  map.replaceChildren();
  config.mapping.forEach((value, n) => {
    const label = document.createElement("label");
    label.textContent = noteName(n) + " · " + n;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "-1";
    input.max = String(config.count - 1);
    input.value = value;
    input.dataset.note = n;
    input.required = true;
    label.append(input);
    map.append(label);
  });
  keyboard();
  if (lastLedSnapshot) renderLedPreview(lastLedSnapshot, true);
}
$("#autoMap").onclick = () => {
  const form = $("#ledForm"),
    base = Number(form.elements.baseNote.value),
    keys = Number(form.elements.keys.value),
    count = Number(form.elements.count.value),
    first = Number(form.elements.first.value);
  document.querySelectorAll("[data-note]").forEach((input) => {
    const n = Number(input.dataset.note),
      offset = n - base;
    input.value =
      offset >= 0 && offset < keys && first + offset < count ? offset : -1;
    input.max = count - first - 1;
  });
  toast("Zuordnung vorbereitet. Zum Übernehmen speichern.");
};
$("#ledForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const next = { ...config };
    for (const name of [
      "count",
      "pin",
      "brightness",
      "first",
      "keys",
      "baseNote",
    ])
      next[name] = Number(e.target.elements[name].value);
    for (const name of ["reversed", "rgb"])
      next[name] = e.target.elements[name].value === "true";
    next.mapping = Array.from(
      document.querySelectorAll("[data-note]"),
      (input) => Number(input.value),
    );
    await api("config", next);
    config = next;
    renderConfig();
    toast("LED-Konfiguration gespeichert.");
  });
};
const color = () => parseInt($("#color").value.slice(1), 16);
async function sendLed(body) {
  try {
    await api("led", body);
    $("#ledResult").textContent =
      "LED-Befehl vom ESP32 angenommen: " + body.command;
  } catch (e) {
    $("#ledResult").textContent = "LED-Befehl fehlgeschlagen: " + e.message;
    throw e;
  }
}
document.querySelectorAll("[data-command]").forEach(
  (button) =>
    (button.onclick = () =>
      run(() =>
        sendLed({
          command: button.dataset.command,
          color: color(),
          index: Number($("#ledIndex").value),
        }),
      )),
);
document
  .querySelectorAll("[data-solid]")
  .forEach(
    (button) =>
      (button.onclick = () =>
        run(() =>
          sendLed({ command: "color", color: Number(button.dataset.solid) }),
        )),
  );
$("#midiForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const next = { ...config, channel: Number($("#channel").value) };
    await api("config", next);
    config = next;
    toast("Kanalfilter gespeichert.");
  });
};
async function scan() {
  $("#scan").disabled = true;
  try {
    const r = await api("wifi/scan");
    if (r.scanning) {
      $("#scan").textContent = "Suche läuft …";
      scanTimer = setTimeout(scan, 1200);
      return;
    }
    $("#networks").replaceChildren();
    r.networks.forEach((n) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent =
        (n.ssid || "(verstecktes Netzwerk)") +
        " · " +
        n.rssi +
        " dBm" +
        (n.open ? " · offen" : "");
      b.onclick = () => ($("#wifiForm").elements.ssid.value = n.ssid);
      $("#networks").append(b);
    });
    if (!r.networks.length)
      toast("Keine Netzwerke gefunden. SSID kann manuell eingegeben werden.");
  } catch (e) {
    toast(e.message, true);
  }
  $("#scan").disabled = false;
  $("#scan").textContent = "Netzwerke suchen";
}
$("#scan").onclick = scan;
$("#wifiForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const f = e.target;
    await api("wifi", {
      ssid: f.elements.ssid.value,
      password: f.elements.password.value,
    });
    f.elements.password.value = "";
    $("#wifiResult").textContent =
      "Verbindung wird getestet. Bei Erfolg im Ziel-WLAN die neue IP-Adresse öffnen (siehe Status / serieller Monitor).";
    toast("Verbindungstest gestartet.");
  });
};
$("#setup").onclick = () =>
  run(async () => {
    await api("setup", {});
    toast("Setup-AP eingeschaltet.");
  });
$("#passwordForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    await api("password", { password: e.target.elements.password.value });
    e.target.reset();
    toast("Neustart. Danach mit neuem Passwort anmelden.");
  });
};
$("#reset").onclick = () => {
  if (
    prompt("Zum Löschen aller Einstellungen WERKSRESET eingeben:") ===
    "WERKSRESET"
  )
    run(async () => {
      await api("reset", { confirm: "WERKSRESET" });
      toast("Werkseinstellungen werden geladen. Webanmeldung: admin / admin.");
    });
};
function renderStatus(s) {
  if (s.training) renderTraining(s.training);
  $("#connection").textContent = s.connected
    ? "WLAN verbunden"
    : "Setup / Offline";
  $("#wifiState").textContent = s.wifiState;
  $("#ip").textContent = s.connected ? s.ip : s.ap ? s.apIp : "Keine IP";
  $("#keyCount").textContent = s.keys + " Tasten";
  $("#wifiAddress").hidden = !s.connected;
  if (s.connected) {
    $("#wifiAddressLink").href = "http://" + s.ip + "/";
    $("#wifiAddressLink").textContent = "http://" + s.ip + "/";
  }
  const info = {
    Board: s.board,
    Firmware: s.firmware,
    Betriebszeit: Math.floor(s.uptime / 60) + " min " + (s.uptime % 60) + " s",
    "Freier Heap": Math.round(s.heap / 1024) + " KiB",
    Flash: Math.round(s.flash / 1048576) + " MiB",
    Dateisystem: s.filesystem ? "LittleFS bereit" : "Nicht verfügbar",
    "IP-Adresse": s.connected ? s.ip : s.ap ? s.apIp : "Keine IP",
    "Setup-AP": s.ap ? s.apIp : "Aus",
    "LED-Modus": s.mode,
  };
  const dl = $("#systemInfo");
  dl.replaceChildren();
  Object.entries(info).forEach(([k, v]) => {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    dl.append(dt, dd);
  });
}
async function poll() {
  try {
    if (!document.hidden) {
      status = await api("status");
      renderStatus(status);
    }
  } catch (e) {
    $("#connection").textContent = "Gerät nicht erreichbar";
  } finally {
    const animated = [
      "sequence",
      "chase",
      "colors",
      "brightness",
      "diagnostic",
    ].includes(status?.mode);
    setTimeout(
      poll,
      location.hash === "#training" ||
        (location.hash === "#dashboard" && animated)
        ? 180
        : 2000,
    );
  }
}
setInterval(() => {
  if (
    !document.hidden &&
    (held.size || (location.hash === "#training" && trainingRunning()))
  )
    noteCommand({ heartbeat: true });
}, 900);
run(async () => {
  status = await api("status");
  renderStatus(status);
  status.pins.forEach((pin) => {
    const o = document.createElement("option");
    o.value = pin;
    o.textContent = "GPIO " + pin;
    $("#pin").append(o);
  });
  config = await api("config");
  renderConfig();
  const lesson = await api("training");
  if (lesson.training) renderTraining(lesson.training);
  route();
  if (!status.connected) location.hash = "wifi";
  poll();
});

function trainingRunning() {
  return trainingView && ["playing", "countin"].includes(trainingView.state);
}
async function trainingCommand(body) {
  await release();
  await commandQueue;
  const reply = await api("training", body);
  if (reply.training) renderTraining(reply.training);
  return reply;
}
function pauseActiveTraining() {
  if (!trainingRunning() || pausePending) return;
  pausePending = true;
  run(async () => {
    await trainingCommand({ command: "pause" });
  }).finally(() => (pausePending = false));
}
$("#trainingForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const preset = $("#trainingPreset").value;
    if (preset === "custom" && !importedSteps)
      throw Error("Zuerst eine MIDI-Datei importieren.");
    const body = {
      command: "start",
      mode: $("#trainingMode").value,
      preset,
      bpm: Number($("#trainingBpm").value),
      tolerance: Number($("#trainingTolerance").value),
      root: Number($("#trainingRoot").value),
      timed: $("#songTimed").value === "true",
    };
    if (preset === "custom") body.steps = importedSteps;
    await trainingCommand(body);
    toast("Übung gestartet. Blaue Tasten zeigen den nächsten Einsatz.");
  });
};
$("#trainingPause").onclick = () =>
  run(() => trainingCommand({ command: "pause" }));
$("#trainingResume").onclick = () =>
  run(() => trainingCommand({ command: "resume" }));
const freePlay = () => run(() => trainingCommand({ command: "free" }));
$("#trainingFree").onclick = freePlay;
$("#freePlay").onclick = freePlay;
$("#trainingRelease").onclick = () => {
  release();
  noteCommand({ release: true });
};
function renderTraining(t) {
  trainingView = t;
  trainingReceivedAt = performance.now();
  const labels = {
    idle: "FREIES SPIEL",
    countin: "EINZÄHLER",
    playing: "ÜBUNG LÄUFT",
    paused: "PAUSIERT",
    completed: "GESCHAFFT",
  };
  $("#trainingState").textContent = labels[t.state] || t.state;
  $("#trainingExercise").textContent = t.exercise || "Freies Spiel";
  $("#trainingTempo").textContent = t.bpm + " BPM";
  $("#trainingFeedback").textContent = t.feedback;
  $("#trainingTarget").textContent =
    (t.expected || []).map(noteName).join(" + ") ||
    (t.state === "completed" ? "✓" : "—");
  $("#trainingPosition").textContent = t.index + " / " + t.total;
  $("#trainingProgress").max = Math.max(1, t.total);
  $("#trainingProgress").value = t.index;
  for (const [id, field] of [
    ["trainingCorrect", "correct"],
    ["trainingWrong", "wrong"],
    ["trainingMissed", "missed"],
  ])
    $("#" + id).textContent = t[field];
  $("#trainingAccuracy").textContent = t.accuracy + " %";
  $("#trainingTiming").textContent = t.timed ? t.averageTimingMs + " ms" : "—";
  $("#trainingPause").disabled = !trainingRunning();
  $("#trainingResume").disabled = t.state !== "paused";
  document.querySelectorAll(".key").forEach((key) => {
    const n = Number(key.dataset.noteValue);
    key.classList.toggle("target", (t.expected || []).includes(n));
    key.classList.toggle(
      "wrong",
      t.lastErrorNote === n && (t.held || []).includes(n),
    );
  });
  paintTrainingTime();
}
function paintTrainingTime() {
  const t = trainingView;
  if (!t) return;
  const active = trainingRunning(),
    age = active ? performance.now() - trainingReceivedAt : 0;
  const before = t.countInMs - t.elapsedMs - age,
    due = t.dueInMs - age;
  let message = "Schrittweise: markierte Tasten spielen";
  if (t.state === "paused") message = "Mit Fortsetzen weiterspielen";
  else if (t.state === "completed")
    message = "Ergebnis ansehen oder eine neue Übung starten";
  else if (t.state === "idle") message = "Übung auswählen und starten";
  else if (t.timed && before > 0)
    message = "Einzähler: " + Math.ceil(before / t.beatMs);
  else if (t.timed)
    message =
      Math.abs(due) <= t.tolerance
        ? "Jetzt spielen!"
        : "Einsatz in " + Math.max(0, due / 1000).toFixed(1) + " s";
  $("#trainingCountdown").textContent = message;
  $("#beatLight").classList.toggle(
    "beat",
    active && t.timed && (t.elapsedMs + age) % t.beatMs < 100,
  );
}
setInterval(paintTrainingTime, 50);
$("#trainingMode").onchange = () => {
  $("#songTimed").disabled = $("#trainingMode").value !== "song";
};
$("#trainingMode").onchange();
$("#importMidi").onclick = () =>
  run(async () => {
    const file = $("#midiFile").files[0];
    if (!file) throw Error("Bitte eine MIDI-Datei auswählen.");
    if (file.size > 262144) throw Error("MIDI-Datei ist größer als 256 KiB.");
    const result = window.MidiFile.parse(await file.arrayBuffer(), {
      channel: Number($("#importChannel").value),
      transpose: Number($("#importTranspose").value),
    });
    importedSteps = result.steps;
    const option = $('#trainingPreset option[value="custom"]');
    option.disabled = false;
    option.textContent = "MIDI: " + file.name;
    $("#trainingPreset").value = "custom";
    $("#trainingMode").value = "song";
    $("#trainingMode").onchange();
    $("#trainingBpm").value = Math.max(40, Math.min(200, result.bpm));
    $("#importResult").textContent =
      file.name +
      ": " +
      result.steps.length +
      " Einsätze. Tempo: " +
      result.bpm +
      " BPM. Zum Üben oben starten." +
      (result.tempoChanges ? " Tempoänderungen werden vereinheitlicht." : "");
  });

function renderLedPreview(snapshot, force = false) {
  const { count, frame, pin, brightness } = snapshot;
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 300 ||
    typeof frame !== "string" ||
    frame.length !== count * 6 ||
    !/^[0-9a-f]+$/i.test(frame)
  ) {
    lastLedKey = "";
    $("#ledPreviewInfo").textContent = "LED-Zustand nicht verfügbar";
    return;
  }
  lastLedSnapshot = snapshot;
  const key = [count, pin, brightness, frame].join(":");
  if (!force && key === lastLedKey) return;
  lastLedKey = key;
  const strip = $("#ledStrip");
  if (strip.children.length !== count) {
    strip.replaceChildren();
    for (let index = 0; index < count; index++) {
      const cell = document.createElement("span");
      cell.className = "led-cell";
      cell.dataset.led = index;
      cell.setAttribute("role", "img");
      const dot = document.createElement("span");
      dot.className = "led-dot";
      dot.setAttribute("aria-hidden", "true");
      const number = document.createElement("span");
      number.className = "led-index";
      number.textContent = index;
      number.setAttribute("aria-hidden", "true");
      cell.append(dot, number);
      strip.append(cell);
    }
  }
  const noteLabels = Array.from({ length: count }, () => []);
  if (config && config.count === count) {
    config.mapping.forEach((offset, note) => {
      if (offset < 0) return;
      let index = config.first + offset;
      if (config.reversed) index = count - 1 - index;
      if (index >= 0 && index < count)
        noteLabels[index].push(noteName(note) + " (" + note + ")");
    });
  }
  let lit = 0;
  for (let index = 0; index < count; index++) {
    const hex = frame.slice(index * 6, index * 6 + 6),
      value = parseInt(hex, 16),
      on = value !== 0,
      cell = strip.children[index];
    if (on) lit++;
    cell.classList.toggle("lit", on);
    cell.dataset.color = "#" + hex;
    cell.style.setProperty("--led-color", "#" + hex);
    const label =
      "LED " +
      index +
      " · " +
      (noteLabels[index].join(" / ") || "keine MIDI-Zuordnung") +
      " · " +
      (on ? "an #" + hex : "aus");
    cell.title = label;
    cell.setAttribute("aria-label", label);
  }
  $("#ledPreviewInfo").textContent =
    count + " LEDs · GPIO " + pin + " · " + brightness + " % · " + lit + " an";
}
