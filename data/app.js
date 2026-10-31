"use strict";
const $ = (s) => document.querySelector(s);
let config = null,
  status = null,
  toastTimer,
  scanTimer;
let commandQueue = Promise.resolve();
const held = new Map();
let lastScoreKey = "";
let libraryBusy = false,
  librarySettings = null,
  cloudListLoaded = false;
let remoteMidi = null;
const libraryClient = new window.MidiLibrary.Client(api);
const midiPlayer = new window.MidiPlayer.Player(renderPlayback);
let playbackName = "";
let playbackLedActive = false,
  playbackLedKey = "",
  playbackLedSentAt = 0,
  playbackLedPending = null,
  playbackLedSending = false;
let audioContext = null;
let pianoSamples = null;
const voices = new Map();
let lastLedSnapshot = null,
  lastLedKey = "";
let trainingView = null,
  trainingReceivedAt = 0,
  pausePending = false,
  importedSteps = null;
function setNavigationCollapsed(collapsed) {
  const nav = $("#mainNavigation"),
    toggle = $("#toggleNavigation");
  if (collapsed && nav.contains(document.activeElement)) toggle.focus();
  nav.hidden = collapsed;
  $(".layout").classList.toggle("navigation-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  const label = collapsed ? "Menü einblenden" : "Menü ausblenden";
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
}
let navigationCollapsed =
  window.matchMedia?.("(max-width: 1000px)").matches || false;
try {
  const preference = localStorage.getItem("navigationCollapsed");
  if (preference !== null) navigationCollapsed = preference === "true";
} catch {}
setNavigationCollapsed(navigationCollapsed);
$("#toggleNavigation").onclick = () => {
  const collapsed = !$("#mainNavigation").hidden;
  setNavigationCollapsed(collapsed);
  try {
    localStorage.setItem("navigationCollapsed", String(collapsed));
  } catch {}
};
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
      silence();
      held.clear();
      document
        .querySelectorAll(".pressed")
        .forEach((k) => k.classList.remove("pressed"));
    });
  return commandQueue;
}
function route() {
  let hash = location.hash.slice(1) || "dashboard";
  if (hash === "config") hash = "control";
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
  if (mount && $("#keyboard")) mount.append($("#ledPreview"));
  if (hash !== "training") {
    midiPlayer.stop("Trainingsseite verlassen");
    pauseActiveTraining();
  }
  if (hash === "training") loadCloudListOnce();
  if (hash !== "training" && libraryBusy)
    libraryClient.cancel().catch(() => {});
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
  let whites = 0;
  const leading = [1, 3, 6, 8, 10].includes(config.baseNote % 12) ? 12 : 0;
  for (let n = config.baseNote; n < config.baseNote + config.keys; n++) {
    const key = document.createElement("button");
    key.type = "button";
    key.className = "key" + ([1, 3, 6, 8, 10].includes(n % 12) ? " black" : "");
    const black = key.classList.contains("black");
    const center = leading + whites * 40 + (black ? 0 : 20);
    key.style.left = center - (black ? 12 : 20) + "px";
    key.dataset.center = center;
    if (!black) whites++;
    key.textContent = noteName(n);
    key.title = "MIDI " + n;
    key.dataset.noteValue = n;
    key.setAttribute("aria-label", noteName(n) + ", MIDI " + n);
    key.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      midiPlayer.stop("Virtuelle Taste gespielt");
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
      soundOn(n, velocity);
      held.set(e.pointerId, { note: n, channel, key });
      key.classList.add("pressed");
      noteCommand({ note: n, velocity, channel, on: true });
    });
    const up = (e) => {
      const h = held.get(e.pointerId);
      if (!h) return;
      held.delete(e.pointerId);
      if (![...held.values()].some((v) => v.note === h.note)) {
        soundOff(h.note);
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
  const width = leading + whites * 40 + 12;
  box.style.width = width + "px";
  $("#ledStrip").style.width = width + "px";
  lastLedKey = "";
}
function release() {
  silence();
  if (!held.size) return commandQueue;
  held.clear();
  document
    .querySelectorAll(".pressed")
    .forEach((k) => k.classList.remove("pressed"));
  return noteCommand({ release: true });
}
window.addEventListener("blur", () => {
  // Release live input, but keep the independent file player running.
  release();
  pauseActiveTraining();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    midiPlayer.pause("Seite im Hintergrund · mit Fortsetzen weiterhören");
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
let hostnameLoaded = false;
$("#hostname").oninput = () => {
  hostnameLoaded = true;
  $("#hostnamePreview").textContent =
    "http://" + $("#hostname").value.trim().toLowerCase() + ".local/";
};
$("#hostnameForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const button = e.target.querySelector("button");
    button.disabled = true;
    try {
      const reply = await api("network", {
        hostname: $("#hostname").value.trim().toLowerCase(),
      });
      $("#hostname").value = reply.hostname;
      $("#hostname").oninput();
      $("#hostnameResult").textContent =
        "Gespeichert. Der Trainer startet neu. Danach im gleichen WLAN http://" +
        reply.hostname +
        ".local/ öffnen oder die aktuelle IP-Adresse verwenden.";
      toast("Hostname gespeichert. Neustart …");
    } catch (error) {
      $("#hostnameResult").textContent = error.message;
      throw error;
    } finally {
      button.disabled = false;
    }
  });
};
function renderNetwork(s) {
  function definitionList(id, values) {
    const dl = $(id);
    dl.replaceChildren();
    for (const [name, value] of Object.entries(values)) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = name;
      dd.textContent = value;
      dl.append(dt, dd);
    }
  }
  const address = (value) => (!value || value === "0.0.0.0" ? "—" : value);
  const station = (value) => (s.connected ? address(value) : "—");
  definitionList("#wifiStationInfo", {
    Status: s.wifiState || "—",
    "Netzwerk (SSID)": s.connected ? s.ssid : "Nicht verbunden",
    Adressvergabe: "Automatisch (DHCP)",
    "IPv4-Adresse": station(s.ip),
    Subnetzmaske: station(s.subnet),
    "Gateway / Router": station(s.gateway),
    "DNS-Server 1": station(s.dns1),
    "DNS-Server 2": station(s.dns2),
    "MAC-Adresse": s.mac || "—",
    Signalstärke:
      s.connected && Number.isFinite(s.rssi) ? s.rssi + " dBm" : "—",
    "Aktiver Hostname": s.hostname || "—",
    mDNS: s.connected
      ? s.mdns
        ? "Aktiv"
        : "Nicht aktiv"
      : "Erst bei Verbindung zum Router aktiv",
  });
  definitionList("#wifiApInfo", {
    Status: s.ap ? "Aktiv" : "Ausgeschaltet",
    "Netzwerk (SSID)": s.ap ? "MIDI-Trainer-Setup" : "—",
    "IPv4-Adresse": s.ap ? address(s.apIp) : "—",
    Subnetzmaske: s.ap ? address(s.apMask) : "—",
    "MAC-Adresse": s.apMac || "—",
  });
  $("#mdnsAddress").hidden = !(s.connected && s.mdns && s.hostname);
  if (s.hostname) {
    $("#mdnsAddressLink").textContent = "http://" + s.hostname + ".local/";
    $("#mdnsAddressLink").href = "http://" + s.hostname + ".local/";
    if (!hostnameLoaded) {
      $("#hostname").value = s.hostname;
      $("#hostname").oninput();
    }
  }
}
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
  renderNetwork(s);
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
      libraryBusy
        ? 1200
        : location.hash === "#training" ||
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
  await loadLibrarySettings();
  route();
  if (!status.connected) location.hash = "wifi";
  poll();
});

function trainingRunning() {
  return trainingView && ["playing", "countin"].includes(trainingView.state);
}
async function trainingCommand(body) {
  if (body.command !== "pause") midiPlayer.stop("Trainingssteuerung verwendet");
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
    midiPlayer.stop("Übung gestartet");
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
    key.classList.toggle("playback", !!t.preview && (t.held || []).includes(n));
    key.classList.toggle("target", (t.expected || []).includes(n));
    key.classList.toggle(
      "wrong",
      !t.preview && t.lastErrorNote === n && (t.held || []).includes(n),
    );
  });
  renderScore();
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
async function importSelectedMidi() {
  importedSteps = null;
  $('#trainingPreset option[value="custom"]').disabled = true;
  $("#importResult").textContent = "";
  const file = remoteMidi || $("#midiFile").files[0];
  if (!file) throw Error("Bitte eine MIDI-Datei auswählen.");
  if (file.size > 2097152) throw Error("MIDI-Datei ist größer als 2 MiB.");
  const result = window.MidiFile.parse(await file.arrayBuffer(), {
    channel: Number($("#importChannel").value),
    transpose: Number($("#importTranspose").value),
    startStep: Number($("#importStart").value) - 1,
    minNote: $("#importRange").checked ? config.baseNote : 0,
    maxNote: $("#importRange").checked
      ? config.baseNote + config.keys - 1
      : 127,
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
    " Einsätze (" +
    (result.startStep + 1) +
    "–" +
    (result.startStep + result.steps.length) +
    " von " +
    result.totalSteps +
    "). Tempo: " +
    result.bpm +
    " BPM (Übung: " +
    $("#trainingBpm").value +
    " BPM). Zum Üben oben starten." +
    (result.tempoChanges ? " Tempoänderungen werden vereinheitlicht." : "") +
    (result.quantized ? " Einsätze auf 1/32-Noten gerastert." : "") +
    (result.droppedNotes
      ? " " + result.droppedNotes + " Noten außerhalb der Tastatur ausgelassen."
      : "") +
    " Belegte Kanäle: " +
    result.channels.join(", ") +
    ". Für den nächsten Abschnitt Start-Einsatz ändern und erneut übernehmen.";
  $("#importStart").max = result.totalSteps;
}
$("#importMidi").onclick = () => run(importSelectedMidi);

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
  const keys = [...document.querySelectorAll(".key")];
  if (strip.children.length !== keys.length) {
    strip.replaceChildren();
    keys.forEach((pianoKey) => {
      const cell = document.createElement("span");
      cell.className = "led-cell";
      cell.dataset.noteValue = pianoKey.dataset.noteValue;
      cell.setAttribute("role", "img");
      const dot = document.createElement("span");
      dot.className = "led-dot";
      dot.setAttribute("aria-hidden", "true");
      const number = document.createElement("span");
      number.className = "led-index";
      number.setAttribute("aria-hidden", "true");
      cell.append(dot, number);
      strip.append(cell);
    });
  }
  let lit = 0;
  keys.forEach((pianoKey, i) => {
    const note = Number(pianoKey.dataset.noteValue),
      cell = strip.children[i];
    let index = -1;
    if (config && config.count === count && config.mapping[note] >= 0) {
      index = config.first + config.mapping[note];
      if (config.reversed) index = count - 1 - index;
      if (index < 0 || index >= count) index = -1;
    }
    cell.style.left = pianoKey.dataset.center + "px";
    const hex = index < 0 ? "000000" : frame.slice(index * 6, index * 6 + 6);
    const on = parseInt(hex, 16) !== 0;
    if (on) lit++;
    cell.classList.toggle("lit", on);
    cell.classList.toggle("unmapped", index < 0);
    if (index < 0) delete cell.dataset.led;
    else cell.dataset.led = index;
    cell.dataset.color = "#" + hex;
    cell.style.setProperty("--led-color", "#" + hex);
    cell.querySelector(".led-index").textContent = index < 0 ? "–" : index;
    const label =
      noteName(note) +
      " (" +
      note +
      ") · " +
      (index < 0 ? "keine MIDI-Zuordnung" : "LED " + index) +
      " · " +
      (on ? "an #" + hex : "aus");
    cell.title = label;
    cell.setAttribute("aria-label", label);
  });
  $("#ledPreviewInfo").textContent =
    count +
    " LEDs · GPIO " +
    pin +
    " · " +
    brightness +
    " % · " +
    lit +
    " Tastenanzeigen an";
}

// Local, opt-in audio. Samples are served by the trainer; synthesis is a fallback.
function audioReady() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio)
    throw Error("Dieser Browser unterstützt keine Web-Audio-Ausgabe.");
  if (!audioContext) audioContext = new Audio();
  if (audioContext.state === "suspended") return audioContext.resume();
  return Promise.resolve();
}
$("#soundEnabled").onchange = () => {
  if (!$("#soundEnabled").checked) {
    silence();
    $("#soundStatus").textContent = "";
    return;
  }
  try {
    const ready = audioReady();
    $("#soundStatus").textContent = "Klavier wird geladen …";
    ready
      .then(() => window.PianoAudio.bank.prepare(audioContext))
      .then((samples) => {
        pianoSamples = samples;
        $("#soundStatus").textContent = "Klavier bereit";
      })
      .catch((error) => {
        $("#soundStatus").textContent =
          "Synthesizer aktiv · Klavier nicht geladen";
        toast("Klavier: " + error.message, true);
      });
  } catch (e) {
    audioError(e);
  }
};
function audioError(e) {
  $("#soundEnabled").checked = false;
  silence();
  toast("Tonausgabe: " + e.message, true);
}
function soundOn(note, velocity) {
  if (!$("#soundEnabled").checked) return;
  try {
    audioReady().catch(audioError);
    soundOff(note);
    const sample = window.PianoAudio?.sampleVoice(
      audioContext,
      audioContext.destination,
      pianoSamples,
      note,
      velocity,
      audioContext.currentTime,
      audioContext.currentTime + 15,
      (voice) => {
        if (voices.get(note) === voice) voices.delete(note);
      },
    );
    if (sample) {
      voices.set(note, sample);
      return;
    }
    const now = audioContext.currentTime,
      gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      (0.12 * velocity) / 127,
      now + 0.008,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 6);
    gain.connect(audioContext.destination);
    const oscillators = [1, 2, 3].map((harmonic) => {
      const oscillator = audioContext.createOscillator();
      const level = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value =
        440 * Math.pow(2, (note - 69) / 12) * harmonic;
      level.gain.value = 1 / (harmonic * harmonic);
      oscillator.connect(level);
      level.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 6.1);
      oscillator.onended = () => {
        oscillator.disconnect();
        level.disconnect();
      };
      return oscillator;
    });
    const voice = { gain, oscillators };
    voices.set(note, voice);
    oscillators[0].addEventListener("ended", () => {
      if (voices.get(note) === voice) voices.delete(note);
      gain.disconnect();
    });
  } catch (e) {
    audioError(e);
  }
}
function soundOff(note) {
  const voice = voices.get(note);
  if (!voice || !audioContext) return;
  const now = audioContext.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setTargetAtTime(0.0001, now, 0.025);
  voice.oscillators.forEach((oscillator) => oscillator.stop(now + 0.15));
  voices.delete(note);
}
function silence() {
  [...voices.keys()].forEach(soundOff);
}

// Code-native notation: pitch preview from the same rolling device sequence as training.
function scorePreference(id, fallback) {
  try {
    const value = localStorage.getItem(id);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}
$("#showScore").checked = scorePreference("showScore", false);
$("#scoreLabels").checked = scorePreference("scoreLabels", true);
for (const id of ["showScore", "scoreLabels"]) {
  $("#" + id).onchange = () => {
    try {
      localStorage.setItem(id, $("#" + id).checked);
    } catch {}
    renderScore();
  };
}
function scoreName(note) {
  return noteName(note).replace(/^B/, "H");
}
function renderScore() {
  const enabled = $("#showScore").checked;
  $("#scorePanel").hidden = !enabled;
  if (!enabled) return;
  const t = trainingView;
  const steps = t && t.state !== "idle" ? (t.upcoming || []).slice(0, 6) : [];
  const labels = $("#scoreLabels").checked;
  const cacheKey = JSON.stringify([t?.state, t?.total, steps, labels]);
  if (cacheKey === lastScoreKey) return;
  lastScoreKey = cacheKey;
  const viewport = $("#scoreViewport");
  viewport.replaceChildren();
  if (!steps.length) {
    $("#scoreSummary").textContent =
      t?.state === "completed"
        ? "Übung abgeschlossen."
        : "Starte eine Übung, um die Noten zu sehen.";
    return;
  }
  const ns = "http://www.w3.org/2000/svg";
  function element(tag, attrs = {}, text) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) =>
      node.setAttribute(key, value),
    );
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const width = 140 + steps.length * 116;
  const svg = element("svg", {
    viewBox: `0 0 ${width} 330`,
    width,
    height: 330,
    role: "img",
    "aria-label": "Notenvorschau im Violin- und Bassschlüssel",
  });
  const title = element("title", {}, "Aktueller Einsatz und folgende Noten");
  svg.append(title);
  for (const bottom of [110, 230]) {
    for (let i = 0; i < 5; i++)
      svg.append(
        element("line", {
          x1: 30,
          y1: bottom - i * 10,
          x2: width - 12,
          y2: bottom - i * 10,
          class: "staff-line",
        }),
      );
  }
  svg.append(
    element("text", { x: 36, y: 106, class: "score-clef" }, "𝄞"),
    element("text", { x: 38, y: 223, class: "score-clef bass" }, "𝄢"),
  );
  svg.append(
    element("text", { x: 30, y: 45, class: "score-caption" }, "Violin"),
    element("text", { x: 30, y: 170, class: "score-caption" }, "Bass"),
  );
  steps.forEach((step, column) => {
    const x = 140 + column * 116;
    const group = element("g", {
      class: "score-step" + (column === 0 ? " current" : ""),
      "data-step": step.index,
    });
    group.append(
      element(
        "title",
        {},
        "Einsatz " +
          (step.index + 1) +
          ": " +
          (step.notes.length ? step.notes.map(scoreName).join(" + ") : "Pause"),
      ),
    );
    if (column === 0)
      group.append(
        element("rect", {
          x: x - 43,
          y: 12,
          width: 102,
          height: 300,
          rx: 10,
          class: "score-current",
        }),
      );
    group.append(
      element(
        "text",
        { x, y: 31, "text-anchor": "middle", class: "score-caption" },
        column === 0 ? "Aktuell" : "+" + column,
      ),
    );
    const noteNames = [];
    const positions = new Map();
    step.notes.forEach((original) => {
      let note = original,
        shift = 0;
      while (note > 84) {
        note -= 12;
        shift++;
      }
      while (note < 36) {
        note += 12;
        shift--;
      }
      const treble = original >= 60;
      const natural = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][note % 12];
      const position = Math.floor(note / 12 - 1) * 7 + natural;
      const bottom = treble ? 110 : 230,
        top = bottom - 40;
      const y = bottom - (position - (treble ? 30 : 18)) * 5;
      const collision =
        positions.has(y) || positions.has(y - 5) || positions.has(y + 5);
      const nx = x + (collision ? 14 : 0);
      positions.set(y, true);
      for (let ledger = bottom + 10; ledger <= y; ledger += 10)
        group.append(
          element("line", {
            x1: nx - 13,
            x2: nx + 13,
            y1: ledger,
            y2: ledger,
            class: "ledger-line",
          }),
        );
      for (let ledger = top - 10; ledger >= y; ledger -= 10)
        group.append(
          element("line", {
            x1: nx - 13,
            x2: nx + 13,
            y1: ledger,
            y2: ledger,
            class: "ledger-line",
          }),
        );
      const head = element("ellipse", {
        cx: nx,
        cy: y,
        rx: 8,
        ry: 5.5,
        transform: `rotate(-18 ${nx} ${y})`,
        class: "score-note",
        "data-note": original,
      });
      head.append(
        element("title", {}, scoreName(original) + ", MIDI " + original),
      );
      group.append(head);
      if ([1, 3, 6, 8, 10].includes(note % 12))
        group.append(
          element("text", { x: nx - 26, y: y + 5, class: "score-sharp" }, "♯"),
        );
      if (shift)
        group.append(
          element(
            "text",
            { x: nx + 12, y: y - 9, class: "score-octave" },
            (Math.abs(shift) === 1 ? "8" : 7 * Math.abs(shift) + 1) +
              (shift > 0 ? "va" : "vb"),
          ),
        );
      noteNames.push(scoreName(original));
    });
    if (!step.notes.length)
      group.append(
        element(
          "text",
          { x, y: 139, "text-anchor": "middle", class: "score-rest" },
          "Pause",
        ),
      );
    if (labels) {
      // Two short lines keep chords readable without changing the staff spacing.
      for (let line = 0; line < 2; line++)
        group.append(
          element(
            "text",
            {
              x,
              y: 270 + line * 15,
              "text-anchor": "middle",
              class: "score-note-name",
            },
            noteNames.slice(line * 4, line * 4 + 4).join(" "),
          ),
        );
    }
    group.append(
      element(
        "text",
        { x, y: 306, "text-anchor": "middle", class: "score-caption" },
        (step.ticks / 480).toLocaleString("de-DE", {
          maximumFractionDigits: 3,
        }) + " ♩ Abstand",
      ),
    );
    svg.append(group);
  });
  viewport.append(svg);
  $("#scoreSummary").textContent =
    "Einsatz " +
    (steps[0].index + 1) +
    " von " +
    t.total +
    ": " +
    (steps[0].notes.length
      ? labels
        ? steps[0].notes.map(scoreName).join(" + ")
        : steps[0].notes.length + " Töne"
      : "Pause") +
    (t.state === "paused" ? " · pausiert" : "");
}

// Shared library UI: all sources feed the same local MIDI parser above.
function setLibraryBusy(busy) {
  libraryBusy = busy;
  document
    .querySelectorAll(
      "#cloudRefresh, #midiSearchForm button, .midi-library-list button, #cloudSettingsForm button, #searchPager button",
    )
    .forEach((button) => (button.disabled = busy));
  $("#libraryCancel").hidden = !busy;
  $("#searchPrevious").disabled = busy || onlineSearch.page <= 1;
  $("#searchNext").disabled = busy || onlineSearch.page >= onlineSearch.pages;
}
async function loadLibrarySettings() {
  try {
    librarySettings = await api("library/config");
    $("#cloudFolder").value = librarySettings.folder || "";
    $("#cloudUser").value = librarySettings.user || "";
    $("#cloudPasswordHint").textContent = librarySettings.hasPassword
      ? "Passwort gespeichert. Leer lassen zum Beibehalten."
      : "Noch kein Passwort gespeichert.";
    $("#cloudCaHint").textContent = librarySettings.hasCa
      ? "Eigenes CA-Zertifikat gespeichert."
      : "Mitgelieferter Zertifikatsspeicher aktiv.";
    if (!librarySettings.folder)
      $("#libraryStatus").textContent =
        "Nextcloud-Verzeichnis in den Import-Einstellungen hinterlegen oder MIDIsss durchsuchen.";
  } catch (error) {
    $("#libraryStatus").textContent = error.message;
  }
}
function loadCloudListOnce() {
  if (!config || !librarySettings?.folder || cloudListLoaded || libraryBusy)
    return;
  cloudListLoaded = true;
  run(refreshCloud);
}
async function libraryDownload(request) {
  if (libraryBusy) throw Error("Bitte den laufenden Download abwarten.");
  midiPlayer.stop("MIDI-Bibliothek wird geladen");
  setLibraryBusy(true);
  try {
    await commandQueue;
    return await libraryClient.run(request, (received, total) => {
      $("#libraryStatus").textContent =
        "Lade " +
        Math.round(received / 1024) +
        " KiB" +
        (total > 0 ? " von " + Math.round(total / 1024) + " KiB" : " …");
    });
  } catch (error) {
    $("#libraryStatus").textContent = error.message;
    throw error;
  } finally {
    setLibraryBusy(false);
  }
}
function renderLibraryList(id, result, source) {
  const list = $(id);
  list.replaceChildren();
  result.files.forEach((file) => {
    const row = document.createElement("li"),
      text = document.createElement("div"),
      title = document.createElement("strong"),
      detail = document.createElement("small"),
      button = document.createElement("button");
    title.textContent = file.name;
    detail.textContent =
      source === "nextcloud"
        ? file.size !== null
          ? Math.round(file.size / 1024) + " KiB"
          : "MIDI-Datei"
        : (file.notes || "") +
          (file.rating !== null ? " · Bewertung: " + file.rating : "");
    text.append(title, detail);
    button.type = "button";
    button.textContent = "Übernehmen";
    button.className = "secondary";
    button.onclick = () =>
      run(async () => {
        if (file.size > 2097152)
          throw Error("MIDI-Datei ist größer als 2 MiB.");
        const bytes = await libraryDownload(
          source === "nextcloud"
            ? { source, action: "file", name: file.name }
            : {
                source,
                action: "file",
                id: file.id,
                ...(source === "midicollection" ? { path: file.path } : {}),
              },
        );
        remoteMidi = {
          name: file.name,
          size: bytes.length,
          arrayBuffer: async () => bytes.buffer,
        };
        $("#midiFile").value = "";
        $("#importStart").value = "1";
        try {
          await importSelectedMidi();
        } catch (error) {
          $("#importResult").textContent = error.message;
          $("#libraryStatus").textContent = error.message;
          throw error;
        }
        $("#libraryStatus").textContent =
          "Geladen: " +
          file.name +
          ". Kanal, Transposition und Abschnitt unten einstellen; erneut übernehmen, um die Auswahl anzuwenden.";
      });
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "secondary";
    listen.textContent = "Anhören";
    listen.onclick = () => {
      let unlock;
      try {
        $("#midiPlaybackStatus").textContent = "Klavier wird geladen …";
        unlock = midiPlayer.unlock();
      } catch (error) {
        toast(error.message, true);
        return;
      }
      run(async () => {
        await unlock;
        midiPlayer.stop("Andere MIDI ausgewählt");
        const bytes = await libraryDownload(
          source === "nextcloud"
            ? { source, action: "file", name: file.name }
            : {
                source,
                action: "file",
                id: file.id,
                ...(source === "midicollection" ? { path: file.path } : {}),
              },
        );
        remoteMidi = {
          name: file.name,
          size: bytes.length,
          arrayBuffer: async () => bytes.buffer,
        };
        $("#midiFile").value = "";
        await playSelectedMidi();
      });
    };
    const actions = document.createElement("div");
    actions.className = "library-file-actions";
    actions.append(button, listen);
    row.append(text, actions);
    list.append(row);
  });
  if (!result.files.length) {
    const row = document.createElement("li");
    row.textContent = "Keine MIDI-Dateien gefunden.";
    list.append(row);
  }
  if (result.truncated) {
    const row = document.createElement("li");
    row.textContent =
      "Liste begrenzt. Suche eingrenzen bzw. kleineren Nextcloud-Ordner verwenden.";
    list.append(row);
  }
}
async function refreshCloud() {
  try {
    const bytes = await libraryDownload({
      source: "nextcloud",
      action: "list",
    });
    const result = window.MidiLibrary.parseDav(
      new TextDecoder().decode(bytes),
      librarySettings.folder,
    );
    renderLibraryList("#cloudFiles", result, "nextcloud");
    $("#libraryStatus").textContent =
      result.files.length + " Nextcloud-MIDIs im hinterlegten Verzeichnis.";
  } catch (error) {
    $("#libraryStatus").textContent = error.message;
    throw error;
  }
}
$("#cloudRefresh").onclick = () => run(refreshCloud);
$("#libraryCancel").onclick = () =>
  run(async () => {
    await libraryClient.cancel();
    $("#libraryStatus").textContent = "Download wird abgebrochen …";
  });
let lastLibrarySearch = 0;
let onlineSearch = { source: "midisss", query: "", page: 1, pages: 1 };
async function searchOnline(page = 1, repeat = false) {
  const source = repeat ? onlineSearch.source : $("#onlineSource").value;
  const query = repeat ? onlineSearch.query : $("#midiSearch").value.trim();
  if (!query) throw Error("Bitte einen Suchbegriff eingeben.");
  if (Date.now() - lastLibrarySearch < 1000)
    throw Error("Bitte kurz warten, bevor du erneut suchst.");
  lastLibrarySearch = Date.now();
  try {
    const bytes = await libraryDownload({
      source,
      action: "search",
      query,
      page,
    });
    const text = new TextDecoder().decode(bytes);
    const result =
      source === "midicollection"
        ? window.MidiLibrary.parseCollection(text)
        : window.MidiLibrary.parseSearch(text);
    renderLibraryList("#searchFiles", result, source);
    onlineSearch = {
      source,
      query,
      page: result.page || 1,
      pages: result.pages || 1,
    };
    const name = source === "midicollection" ? "MIDICollection" : "MIDIsss";
    $("#onlineLibraryTitle").textContent = name + "-Suchergebnisse";
    $("#libraryStatus").textContent =
      result.files.length + " " + name + "-Treffer auf dieser Seite.";
    $("#searchPager").hidden = onlineSearch.pages <= 1;
    $("#searchPageInfo").textContent =
      "Seite " + onlineSearch.page + " / " + onlineSearch.pages;
    $("#searchPrevious").disabled = onlineSearch.page <= 1;
    $("#searchNext").disabled = onlineSearch.page >= onlineSearch.pages;
  } catch (error) {
    $("#libraryStatus").textContent = error.message;
    throw error;
  }
}
$("#midiSearchForm").onsubmit = (event) => {
  event.preventDefault();
  run(() => searchOnline());
};
$("#searchPrevious").onclick = () =>
  run(() => searchOnline(onlineSearch.page - 1, true));
$("#searchNext").onclick = () =>
  run(() => searchOnline(onlineSearch.page + 1, true));
$("#onlineSource").onchange = () => {
  $("#searchFiles").replaceChildren();
  $("#searchPager").hidden = true;
  $("#onlineLibraryTitle").textContent =
    $("#onlineSource").selectedOptions[0].textContent + "-Suchergebnisse";
};
$("#midiFile").onchange = () => {
  midiPlayer.stop("Andere Datei ausgewählt");
  remoteMidi = null;
};
$("#cloudSettingsForm").onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    let folder = $("#cloudFolder").value.trim();
    if (folder) {
      const url = new URL(folder);
      if (!url.pathname.endsWith("/")) url.pathname += "/";
      folder = url.href;
    }
    const body = { folder, user: $("#cloudUser").value.trim() };
    if ($("#clearCloudPassword").checked) body.password = "";
    else if ($("#cloudPassword").value)
      body.password = $("#cloudPassword").value;
    if ($("#clearCloudCa").checked) body.ca = "";
    else if ($("#cloudCa").value.trim()) body.ca = $("#cloudCa").value.trim();
    try {
      await api("library/config", body);
      $("#cloudPassword").value = "";
      $("#cloudCa").value = "";
      $("#clearCloudPassword").checked = false;
      $("#clearCloudCa").checked = false;
      cloudListLoaded = false;
      $("#cloudFiles").replaceChildren();
      await loadLibrarySettings();
      $("#cloudSettingsResult").textContent =
        "Gespeichert. Die MIDI-Liste wird beim Öffnen des Trainings geladen.";
    } catch (error) {
      $("#cloudSettingsResult").textContent = error.message;
      throw error;
    }
  });
};

function renderPlayback(view) {
  playbackLeds(view);
  const format = (seconds) =>
    Math.floor(seconds / 60) +
    ":" +
    String(Math.floor(seconds % 60)).padStart(2, "0");
  $("#pauseMidi").disabled = !["playing", "paused"].includes(view.state);
  $("#pauseMidi").textContent =
    view.state === "paused" ? "Fortsetzen" : "Pause";
  $("#stopMidi").disabled = !["playing", "paused"].includes(view.state);
  $("#pauseMidi").hidden = $("#pauseMidi").disabled;
  $("#stopMidi").hidden = $("#stopMidi").disabled;
  const label = {
    playing: "Spielt",
    paused: "Pausiert",
    completed: "Fertig",
    stopped: "Gestoppt",
  }[view.state];
  $("#midiPlaybackStatus").textContent =
    label +
    (playbackName ? ": " + playbackName : "") +
    " · " +
    format(view.position) +
    " / " +
    format(view.duration) +
    (view.reason ? " · " + view.reason : "") +
    (view.sound ? " · " + view.sound : "");
}
async function playSelectedMidi() {
  if (document.hidden || $("#training").hidden) return;
  const file = remoteMidi || $("#midiFile").files[0];
  if (!file) throw Error("Bitte zuerst eine MIDI-Datei auswählen.");
  const performance = window.MidiFile.parse(await file.arrayBuffer(), {
    performanceOnly: true,
    channel: Number($("#importChannel").value),
    transpose: Number($("#importTranspose").value),
  });
  playbackName = file.name;
  if (trainingRunning()) await trainingCommand({ command: "pause" });
  if (document.hidden || $("#training").hidden) return;
  midiPlayer.play(performance);
}
$("#listenMidi").onclick = () => {
  let unlock;
  try {
    $("#midiPlaybackStatus").textContent = "Klavier wird geladen …";
    unlock = midiPlayer.unlock();
  } catch (error) {
    toast(error.message, true);
    return;
  }
  run(async () => {
    await unlock;
    await playSelectedMidi();
  });
};
$("#pauseMidi").onclick = () => {
  if (midiPlayer.state === "playing") midiPlayer.pause();
  else
    run(async () => {
      await midiPlayer.unlock();
      midiPlayer.resume();
    });
};
$("#stopMidi").onclick = () => midiPlayer.stop("Stopp gedrückt");
$("#midiVolume").oninput = () =>
  midiPlayer.setVolume(Number($("#midiVolume").value) / 100);

function appendPlaybackCommand(body) {
  commandQueue = commandQueue
    .catch(() => {})
    .then(() => api("playback", body))
    .then((reply) => {
      if (reply.training) renderTraining(reply.training);
    })
    .catch((error) => {
      toast("LED-Wiedergabe: " + error.message, true);
    });
  return commandQueue;
}
function drainPlaybackLeds() {
  if (playbackLedSending || !playbackLedPending) return;
  const body = playbackLedPending;
  playbackLedPending = null;
  playbackLedSending = true;
  appendPlaybackCommand(body).finally(() => {
    playbackLedSending = false;
    drainPlaybackLeds();
  });
}
function playbackLeds(view) {
  if (view.state !== "playing") {
    if (playbackLedActive) {
      playbackLedActive = false;
      playbackLedPending = null;
      playbackLedKey = "";
      appendPlaybackCommand({ active: false });
    }
    return;
  }
  const notes = new Map();
  for (const note of view.notes || [])
    notes.set(note.note, Math.max(notes.get(note.note) || 0, note.velocity));
  const snapshot = [...notes]
    .sort((a, b) => a[0] - b[0])
    .map(([note, velocity]) => ({ note, velocity }));
  const key = JSON.stringify(snapshot),
    now = Date.now();
  if (
    !playbackLedActive ||
    key !== playbackLedKey ||
    now - playbackLedSentAt >= 800
  ) {
    playbackLedActive = true;
    playbackLedKey = key;
    playbackLedSentAt = now;
    playbackLedPending = { active: true, notes: snapshot };
    drainPlaybackLeds();
  }
}
