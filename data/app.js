"use strict";
const $ = (s) => document.querySelector(s);
$("#languageSelect").onchange = async (event) => {
  const select = event.target;
  $("#languageStatus").textContent = "";
  try {
    await I18n.setLanguage(select.value);
  } catch (error) {
    select.value = I18n.language;
    $("#languageStatus").textContent = error.message;
  }
};
window.addEventListener("languagechange", () => {
  lastScoreKey = "";
  if (config) renderScore();
});
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
const favorites = new window.MidiFavorites.Store();
const cloudUploader = new window.NextcloudUpload.Client(api);
const libraryClient = new window.MidiLibrary.Client(api);
const midiPlayer = new window.MidiPlayer.Player(renderPlayback);
let playbackName = "";
let playbackView = null;
let lessons = [],
  lessonLoad = null,
  lessonsLoaded = false,
  lastLessonCompletion = "";
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
  I18n.attr(toggle, "aria-label", () => I18n.t(label));
  I18n.attr(toggle, "title", () => I18n.t(label));
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
const sessionToken = Array.from(
  crypto.getRandomValues(new Uint8Array(16)),
  (n) => n.toString(16).padStart(2, "0"),
).join("");
window.trainerSessionToken = sessionToken;
window.trainerSessionLost = blockSession;
let sessionOwned = false,
  sessionBlocked = false,
  sessionPending = null,
  pollingStarted = false;
function blockSession() {
  sessionOwned = false;
  sessionBlocked = true;
  fallingView.setVisible(false);
  silence();
  held.clear();
  midiPlayer.stop();
  document
    .querySelectorAll(".pressed")
    .forEach((key) => key.classList.remove("pressed"));
  $("#sessionBlock").hidden = false;
  $(".layout").inert = true;
  $("#takeSession").focus();
}
async function claimSession(takeover = false) {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Trainer": "1",
      "X-Session": sessionToken,
    },
    body: JSON.stringify({ takeover }),
    credentials: "same-origin",
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    if (result.code === "session_conflict") blockSession();
    throw Error(result.error || "Ungültige Geräteantwort.");
  }
  sessionOwned = true;
  sessionBlocked = false;
  $("#sessionBlock").hidden = true;
  $(".layout").inert = false;
}
async function ensureSession() {
  if (sessionBlocked) throw Error("Sitzung in einem anderen Browser aktiv.");
  if (sessionOwned) return;
  if (!sessionPending)
    sessionPending = claimSession().finally(() => {
      sessionPending = null;
    });
  return sessionPending;
}
$("#takeSession").onclick = () =>
  run(async () => {
    const button = $("#takeSession");
    button.disabled = true;
    try {
      await claimSession(true);
      await initialize();
    } finally {
      button.disabled = false;
    }
  });
async function sessionFetch(url, options = {}) {
  await ensureSession();
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, "X-Session": sessionToken },
  });
  if (response.status === 409) {
    const detail = await response.clone().json();
    if (detail.code === "session_conflict") blockSession();
  }
  return response;
}
libraryClient.fetch = sessionFetch;
async function api(path, body) {
  const response = await sessionFetch("/api/" + path, {
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
  I18n.text(t, () => I18n.t(text));
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
  if (hash === "training") loadLessons(true);
  refreshFallingVisibility();
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
    I18n.text(key, () => I18n.t(noteName(n)));
    I18n.attr(key, "title", () => I18n.t("MIDI ") + I18n.t(n));
    key.dataset.noteValue = n;
    I18n.attr(
      key,
      "aria-label",
      () => I18n.t(noteName(n)) + I18n.t(", MIDI ") + I18n.t(n),
    );
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
  syncKeyboardLayout();
  $("#channel").value = config.channel;
  $("#sendChannel").value = config.channel || 1;
  $("#trainingRoot").value =
    config.baseNote <= 48 && config.baseNote + config.keys - 1 >= 76
      ? 60
      : config.baseNote + (config.keys >= 27 ? 12 : 0);
  I18n.text($("#ledCount"), () => I18n.t(config.count) + I18n.t(" LEDs"));
  I18n.text(
    $("#ledState"),
    () => I18n.t("GPIO ") + I18n.t(config.pin) + I18n.t(" · WS2812B"),
  );
  $("#ledIndex").max = config.count - 1;
  const map = $("#mapping");
  map.replaceChildren();
  config.mapping.forEach((value, n) => {
    const label = document.createElement("label");
    I18n.text(label, () => I18n.t(noteName(n)) + I18n.t(" · ") + I18n.t(n));
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
function syncKeyboardLayout() {
  const form = $("#ledForm"),
    field = $("#keyboardLayout");
  const keys = Number(form.elements.keys.value),
    base = Number(form.elements.baseNote.value);
  const profile = [...field.options].find(
    (option) =>
      Number(option.value) === keys && Number(option.dataset.base) === base,
  );
  field.value = profile ? profile.value : "custom";
  const missing = Math.max(
    0,
    keys -
      (Number(form.elements.count.value) - Number(form.elements.first.value)),
  );
  I18n.text(
    $("#keyboardLayoutHint"),
    () =>
      (Number.isInteger(base) && keys > 0 && base >= 0 && base + keys <= 128
        ? I18n.t(noteName(base)) +
          I18n.t("–") +
          I18n.t(noteName(base + keys - 1)) +
          I18n.t(" · MIDI ") +
          I18n.t(base) +
          I18n.t("–") +
          I18n.t(base + keys - 1) +
          I18n.t(". ")
        : I18n.t("")) +
      I18n.t(
        "Profilwahl bereitet Tastenbereich und fortlaufende LED-Zuordnung vor. Anschließend speichern.",
      ) +
      (missing
        ? I18n.t(" Bei fortlaufender Zuordnung bleiben ") +
          I18n.t(missing) +
          I18n.t(
            " Tasten ohne LED; LED-Anzahl passend zum tatsächlichen Streifen einstellen.",
          )
        : I18n.t("")),
  );
}
$("#keyboardLayout").onchange = () => {
  const option = $("#keyboardLayout").selectedOptions[0];
  if (!option?.dataset.base) return;
  const form = $("#ledForm");
  form.elements.keys.value = option.value;
  form.elements.baseNote.value = option.dataset.base;
  $("#autoMap").onclick();
  syncKeyboardLayout();
};
for (const name of ["keys", "baseNote", "count", "first"])
  $("#ledForm").elements[name].addEventListener("input", syncKeyboardLayout);
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
    lessonsLoaded = false;
    toast("LED-Konfiguration gespeichert.");
  });
};
const color = () => parseInt($("#color").value.slice(1), 16);
async function sendLed(body) {
  try {
    await api("led", body);
    I18n.text(
      $("#ledResult"),
      () => I18n.t("LED-Befehl vom ESP32 angenommen: ") + I18n.t(body.command),
    );
  } catch (e) {
    I18n.text(
      $("#ledResult"),
      () => I18n.t("LED-Befehl fehlgeschlagen: ") + I18n.t(e.message),
    );
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
      I18n.text($("#scan"), () => I18n.t("Suche läuft …"));
      scanTimer = setTimeout(scan, 1200);
      return;
    }
    $("#networks").replaceChildren();
    r.networks.forEach((n) => {
      const b = document.createElement("button");
      b.type = "button";
      I18n.text(
        b,
        () =>
          I18n.t(n.ssid || "(verstecktes Netzwerk)") +
          I18n.t(" · ") +
          I18n.t(n.rssi) +
          I18n.t(" dBm") +
          (n.open ? I18n.t(" · offen") : I18n.t("")),
      );
      b.onclick = () => ($("#wifiForm").elements.ssid.value = n.ssid);
      $("#networks").append(b);
    });
    if (!r.networks.length)
      toast("Keine Netzwerke gefunden. SSID kann manuell eingegeben werden.");
  } catch (e) {
    toast(e.message, true);
  }
  $("#scan").disabled = false;
  I18n.text($("#scan"), () => I18n.t("Netzwerke suchen"));
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
    I18n.text($("#wifiResult"), () =>
      I18n.t(
        "Verbindung wird getestet. Bei Erfolg im Ziel-WLAN die neue IP-Adresse öffnen (siehe Status / serieller Monitor).",
      ),
    );
    toast("Verbindungstest gestartet.");
  });
};
let hostnameLoaded = false;
$("#hostname").oninput = () => {
  hostnameLoaded = true;
  I18n.text(
    $("#hostnamePreview"),
    () =>
      I18n.t("http://") +
      I18n.t($("#hostname").value.trim().toLowerCase()) +
      I18n.t(".local/"),
  );
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
      I18n.text(
        $("#hostnameResult"),
        () =>
          I18n.t(
            "Gespeichert. Der Trainer startet neu. Danach im gleichen WLAN http://",
          ) +
          reply.hostname +
          I18n.t(".local/ öffnen oder die aktuelle IP-Adresse verwenden."),
      );
      toast("Hostname gespeichert. Neustart …");
    } catch (error) {
      I18n.text($("#hostnameResult"), () => I18n.t(error.message));
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
      I18n.text(dt, () => I18n.t(name));
      I18n.text(dd, () => (name === "Netzwerk (SSID)" ? value : I18n.t(value)));
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
    I18n.text(
      $("#mdnsAddressLink"),
      () => I18n.t("http://") + s.hostname + I18n.t(".local/"),
    );
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
let accessDirty = false;
$("#authEnabled").onchange = () => {
  accessDirty = true;
};
$("#accessForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    await api("access", { enabled: $("#authEnabled").checked });
    accessDirty = false;
    toast("Webanmeldung gespeichert.");
  });
};
$("#passwordForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    await api("password", { password: e.target.elements.password.value });
    e.target.reset();
    toast("Passwort gespeichert. Neustart …");
  });
};
$("#reset").onclick = () => {
  if (
    prompt(
      I18n.t(
        "Zum Löschen aller Einstellungen und Lernfortschritte WERKSRESET eingeben:",
      ),
    ) === "WERKSRESET"
  )
    run(async () => {
      await api("reset", { confirm: "WERKSRESET" });
      toast("Werkseinstellungen werden geladen. Webanmeldung: admin / admin.");
    });
};
function renderStatus(s) {
  $("#appBoard").textContent = s.board;
  if (!accessDirty) $("#authEnabled").checked = s.authEnabled === true;
  I18n.text($("#appVersion"), () =>
    s.firmware ? I18n.t("v") + s.firmware : I18n.t("Version unbekannt"),
  );
  I18n.text($("#appAuthor"), () => I18n.t(s.author || "okuemmel"));
  renderNetwork(s);
  if (s.training) renderTraining(s.training);
  I18n.text($("#connection"), () =>
    s.connected ? I18n.t("WLAN verbunden") : I18n.t("Setup / Offline"),
  );
  I18n.text($("#wifiState"), () => I18n.t(s.wifiState));
  I18n.text($("#ip"), () =>
    s.connected ? s.ip : s.ap ? s.apIp : I18n.t("Keine IP"),
  );
  I18n.text($("#keyCount"), () => I18n.t(s.keys) + I18n.t(" Tasten"));
  $("#wifiAddress").hidden = !s.connected;
  if (s.connected) {
    $("#wifiAddressLink").href = "http://" + s.ip + "/";
    I18n.text(
      $("#wifiAddressLink"),
      () => I18n.t("http://") + s.ip + I18n.t("/"),
    );
  }
  const info = {
    Board: s.board,
    Firmware: s.firmware,
    Urheber: s.author || "okuemmel",
    Betriebszeit: Math.floor(s.uptime / 60) + " min " + (s.uptime % 60) + " s",
    "Freier Heap": Math.round(s.heap / 1024) + " KiB",
    Flash: Math.round(s.flash / 1048576) + " MiB",
    ...(s.psram !== undefined
      ? {
          PSRAM: Math.round(s.psram / 1048576) + " MiB",
          "Freies PSRAM": Math.round(s.freePsram / 1024) + " KiB",
        }
      : {}),
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
    I18n.text(dt, () => I18n.t(k));
    I18n.text(dd, () => I18n.t(v));
    dl.append(dt, dd);
  });
}
async function poll() {
  try {
    if (!document.hidden && !maintenanceBusy && !sessionBlocked) {
      status = await api("status");
      renderStatus(status);
    }
  } catch (e) {
    I18n.text($("#connection"), () => I18n.t("Gerät nicht erreichbar"));
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
    !maintenanceBusy &&
    (held.size || (location.hash === "#training" && trainingRunning()))
  )
    noteCommand({ heartbeat: true });
}, 900);
async function initialize() {
  await I18n.ready;
  status = await api("status");
  renderStatus(status);
  $("#pin").replaceChildren();
  status.pins.forEach((pin) => {
    const o = document.createElement("option");
    o.value = pin;
    I18n.text(o, () => I18n.t("GPIO ") + I18n.t(pin));
    $("#pin").append(o);
  });
  config = await api("config");
  renderConfig();
  const lesson = await api("training");
  renderPresetCatalog(lesson.presets);
  if (lesson.training) renderTraining(lesson.training);
  await loadLibrarySettings();
  await refreshFavorites();
  route();
  if (!status.connected) location.hash = "wifi";
  if (!pollingStarted) {
    pollingStarted = true;
    poll();
  }
}
run(initialize);

function trainingRunning() {
  return trainingView && ["playing", "countin"].includes(trainingView.state);
}
async function trainingCommand(body) {
  if (body.command !== "pause") midiPlayer.stop("Trainingssteuerung verwendet");
  await release();
  await commandQueue;
  const reply = await api("training", body);
  if (body.command === "start") {
    importedSequenceId =
      body.preset === "custom" ? reply.training?.sequenceId : null;
    importedRunDurations = body.preset === "custom" ? importedDurations : null;
    fallingTrainingCache = null;
  }
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
  if (
    trainingView &&
    t.sequenceId === trainingView.sequenceId &&
    t.correct > trainingView.correct
  )
    fallingView.flash(trainingView.expected || []);
  trainingView = t;
  trainingReceivedAt = performance.now();
  const labels = {
    idle: "FREIES SPIEL",
    countin: "EINZÄHLER",
    playing: "ÜBUNG LÄUFT",
    paused: "PAUSIERT",
    completed: "GESCHAFFT",
  };
  I18n.text($("#trainingState"), () => I18n.t(labels[t.state] || t.state));
  I18n.text($("#trainingExercise"), () => I18n.t(t.exercise || "Freies Spiel"));
  I18n.text($("#trainingTempo"), () => I18n.t(t.bpm) + I18n.t(" BPM"));
  I18n.text($("#trainingFeedback"), () => I18n.t(t.feedback));
  I18n.text($("#trainingTarget"), () =>
    I18n.t(
      (t.expected || []).map(noteName).join(" + ") ||
        (t.state === "completed" ? "✓" : "—"),
    ),
  );
  I18n.text(
    $("#trainingPosition"),
    () => I18n.t(t.index) + I18n.t(" / ") + I18n.t(t.total),
  );
  $("#trainingProgress").max = Math.max(1, t.total);
  $("#trainingProgress").value = t.index;
  for (const [id, field] of [
    ["trainingCorrect", "correct"],
    ["trainingWrong", "wrong"],
    ["trainingMissed", "missed"],
  ])
    I18n.text($("#" + id), () => I18n.t(t[field]));
  I18n.text($("#trainingAccuracy"), () => I18n.t(t.accuracy) + I18n.t(" %"));
  I18n.text($("#trainingTiming"), () =>
    t.timed ? I18n.t(t.averageTimingMs) + I18n.t(" ms") : I18n.t("—"),
  );
  $("#trainingPause").disabled = !trainingRunning();
  $("#trainingResume").disabled = t.state !== "paused";
  updateFallingPause();
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
  loadFallingSequence();
  paintTrainingTime();
  if (t.lesson && ["playing", "countin"].includes(t.state))
    lastLessonCompletion = "";
  if (t.lesson && t.state === "completed") {
    const key = t.lesson + ":" + t.lessonRun;
    if (key !== lastLessonCompletion) {
      lastLessonCompletion = key;
      loadLessons(true).then((loaded) => {
        if (!loaded) return;
        if (t.lessonRecorded && !t.lessonSaved) {
          I18n.text($("#lessonStatus"), () =>
            I18n.t(
              "Ergebnis konnte nicht dauerhaft gespeichert werden. Bitte die Lektion später wiederholen.",
            ),
          );
          return;
        }
        I18n.text(
          $("#lessonStatus"),
          () =>
            I18n.t("Lektion beendet: ") +
            I18n.t(t.accuracy) +
            I18n.t(" % · ") +
            (t.accuracy >= 80
              ? I18n.t("Bestanden! Empfehlung für die nächste Lektion wählen.")
              : I18n.t("Noch einmal üben – Ziel sind 80 %.")),
        );
      });
    }
  }
  if (t.lesson && t.lessonRecorded && !t.lessonSaved)
    I18n.text($("#lessonStatus"), () =>
      I18n.t(
        "Ergebnis konnte nicht dauerhaft gespeichert werden. Bitte die Lektion später wiederholen.",
      ),
    );
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
  I18n.text($("#trainingCountdown"), () => I18n.t(message));
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
  I18n.text($("#importResult"), () => I18n.t(""));
  const file = remoteMidi || $("#midiFile").files[0];
  if (!file) throw Error("Bitte eine MIDI-Datei auswählen.");
  if (file.size > 2097152) throw Error("MIDI-Datei ist größer als 2 MiB.");
  const bytes = await file.arrayBuffer();
  const result = window.MidiFile.parse(bytes, {
    channel: Number($("#importChannel").value),
    transpose: Number($("#importTranspose").value),
    startStep: Number($("#importStart").value) - 1,
    minNote: $("#importRange").checked ? config.baseNote : 0,
    maxNote: $("#importRange").checked
      ? config.baseNote + config.keys - 1
      : 127,
  });
  importedSteps = result.steps;
  const performance = window.MidiFile.parse(bytes, {
    performanceOnly: true,
    channel: Number($("#importChannel").value),
    transpose: Number($("#importTranspose").value),
    minNote: $("#importRange").checked ? config.baseNote : 0,
    maxNote: $("#importRange").checked
      ? config.baseNote + config.keys - 1
      : 127,
  });
  const durations = new Map();
  for (const note of performance.notes) {
    const key =
      Math.round((note.beat + performance.originBeat) * 8) + ":" + note.note;
    durations.set(
      key,
      Math.max(
        durations.get(key) || 0,
        note.durationBeats || (note.duration * performance.bpm) / 60,
      ),
    );
  }
  importedDurations = result.stepBeats.map((beat, index) =>
    Object.fromEntries(
      result.steps[index].notes.map((note) => [
        note,
        durations.get(Math.round(beat * 8) + ":" + note),
      ]),
    ),
  );
  fallingTrainingCache = null;
  const option = $('#trainingPreset option[value="custom"]');
  option.disabled = false;
  I18n.text(option, () => I18n.t("MIDI: ") + file.name);
  $("#trainingPreset").value = "custom";
  $("#trainingMode").value = "song";
  $("#trainingMode").onchange();
  $("#trainingBpm").value = Math.max(40, Math.min(200, result.bpm));
  I18n.text(
    $("#importResult"),
    () =>
      file.name +
      I18n.t(": ") +
      I18n.t(result.steps.length) +
      I18n.t(" Einsätze (") +
      (I18n.t(result.startStep) + I18n.t(1)) +
      I18n.t("–") +
      (I18n.t(result.startStep) + I18n.t(result.steps.length)) +
      I18n.t(" von ") +
      I18n.t(result.totalSteps) +
      I18n.t("). Tempo: ") +
      I18n.t(result.bpm) +
      I18n.t(" BPM (Übung: ") +
      I18n.t($("#trainingBpm").value) +
      I18n.t(" BPM). Zum Üben oben starten.") +
      (result.tempoChanges
        ? I18n.t(" Tempoänderungen werden vereinheitlicht.")
        : I18n.t("")) +
      (result.quantized
        ? I18n.t(" Einsätze auf 1/32-Noten gerastert.")
        : I18n.t("")) +
      (result.droppedNotes
        ? I18n.t(" ") +
          I18n.t(result.droppedNotes) +
          I18n.t(" Noten außerhalb der Tastatur ausgelassen.")
        : I18n.t("")) +
      I18n.t(" Belegte Kanäle: ") +
      I18n.t(result.channels.join(", ")) +
      I18n.t(
        ". Für den nächsten Abschnitt Start-Einsatz ändern und erneut übernehmen.",
      ),
  );
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
    I18n.text($("#ledPreviewInfo"), () =>
      I18n.t("LED-Zustand nicht verfügbar"),
    );
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
    I18n.text(cell.querySelector(".led-index"), () =>
      index < 0 ? I18n.t("–") : I18n.t(index),
    );
    const label = () =>
      noteName(note) +
      " (" +
      note +
      ") · " +
      (index < 0 ? I18n.t("keine MIDI-Zuordnung") : "LED " + index) +
      " · " +
      (on ? I18n.t("an") + " #" + hex : I18n.t("aus"));
    I18n.attr(cell, "title", label);
    I18n.attr(cell, "aria-label", label);
  });
  I18n.text(
    $("#ledPreviewInfo"),
    () =>
      I18n.t(count) +
      I18n.t(" LEDs · GPIO ") +
      I18n.t(pin) +
      I18n.t(" · ") +
      I18n.t(brightness) +
      I18n.t(" % · ") +
      I18n.t(lit) +
      I18n.t(" Tastenanzeigen an"),
  );
}

// Local, opt-in audio. Samples are served by the trainer; synthesis is a fallback.
function audioReady() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio)
    throw Error("Dieser Browser unterstützt keine Web-Audio-Ausgabe.");
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new Audio();
    pianoSamples = null;
  }
  return window.PianoAudio.unlock(audioContext);
}
$("#soundEnabled").onchange = () => {
  if (!$("#soundEnabled").checked) {
    silence();
    I18n.text($("#soundStatus"), () => I18n.t(""));
    return;
  }
  try {
    const ready = audioReady();
    I18n.text($("#soundStatus"), () => I18n.t("Klavier wird geladen …"));
    ready
      .then(() => window.PianoAudio.bank.prepare(audioContext))
      .then((samples) => {
        pianoSamples = samples;
        I18n.text($("#soundStatus"), () => I18n.t("Klavier bereit"));
      })
      .catch((error) => {
        I18n.text($("#soundStatus"), () =>
          I18n.t("Synthesizer aktiv · Klavier nicht geladen"),
        );
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
  if (!sessionOwned || !$("#soundEnabled").checked) return;
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

// Falling Notes only reads playback/training snapshots. It never sends MIDI or LED events.
let fallingSequence = null,
  fallingSequencePending = null,
  fallingSequenceFailed = null;
let fallingTrainingCache = null,
  fallingPlaybackSource = null,
  fallingPlaybackTimeline = null;
let importedDurations = null,
  importedRunDurations = null,
  importedSequenceId = null;
const emptyFallingTimeline = new FallingNotes.Timeline();
const fallingView = new FallingNotes.View($("#fallingCanvas"), fallingSnapshot);
function refreshFallingVisibility() {
  const enabled = $("#trainingDisplay").value === "falling";
  if (!enabled || $("#training").hidden) setFallingFocus(false);
  $("#fallingPanel").hidden = !enabled;
  fallingView.setVisible(
    enabled && !$("#training").hidden && !document.hidden && !sessionBlocked,
  );
  if (enabled) loadFallingSequence();
}
function updateFallingPause() {
  const player = ["playing", "paused"].includes(midiPlayer.state);
  $("#fallingBack").disabled =
    !midiPlayer.performance ||
    !["playing", "paused", "completed"].includes(midiPlayer.state);
  const state = player ? midiPlayer.state : trainingView?.state;
  $("#fallingPause").disabled = !["playing", "countin", "paused"].includes(
    state,
  );
  I18n.text($("#fallingPause"), () =>
    I18n.t(state === "paused" ? "Fortsetzen" : "Pause"),
  );
}
$("#fallingPause").onclick = () => {
  if (["playing", "paused"].includes(midiPlayer.state))
    $("#pauseMidi").onclick();
  else if (trainingView?.state === "paused") $("#trainingResume").click();
  else if (trainingRunning()) $("#trainingPause").click();
};
$("#fallingBack").onclick = () => {
  const source = midiPlayer.performance;
  if (!source || !["playing", "paused", "completed"].includes(midiPlayer.state))
    return;
  const position =
    midiPlayer.state === "playing"
      ? midiPlayer.context.currentTime - midiPlayer.started
      : midiPlayer.position;
  const target = Math.max(0, position - 10);
  if (midiPlayer.state !== "playing") {
    midiPlayer.seek(target);
    return;
  }
  try {
    const unlocked = midiPlayer.unlock();
    run(async () => {
      await unlocked;
      if (midiPlayer.performance === source) midiPlayer.seek(target);
    });
  } catch (error) {
    toast(error.message, true);
  }
};
function loadFallingSequence() {
  const t = trainingView;
  if (
    $("#trainingDisplay").value !== "falling" ||
    !t ||
    t.state === "idle" ||
    !Number.isInteger(t.sequenceId) ||
    t.sequenceId === fallingSequence?.id ||
    t.sequenceId === fallingSequenceFailed ||
    fallingSequencePending
  )
    return;
  const id = t.sequenceId;
  fallingSequencePending = api("training/sequence")
    .then((reply) => {
      if (reply.id !== trainingView?.sequenceId || !Array.isArray(reply.steps))
        return;
      fallingSequence = reply;
      fallingTrainingCache = null;
      I18n.text($("#fallingStatus"), () =>
        I18n.t("Synchron zur Wiedergabe · Blau links, Grün rechts."),
      );
    })
    .catch(() => {
      fallingSequenceFailed = id;
      I18n.text($("#fallingStatus"), () =>
        I18n.t(
          "Vorschau konnte nicht vollständig geladen werden. Ansicht erneut wählen, um es noch einmal zu versuchen.",
        ),
      );
    })
    .finally(() => {
      fallingSequencePending = null;
    });
}
function fallingSnapshot(now) {
  if (!config) return null;
  const common = {
    base: config.baseNote,
    keys: config.keys,
    held: [
      ...new Set([
        ...(trainingView?.held || []),
        ...[...held.values()].map((h) => h.note),
      ]),
    ],
  };
  if (
    ["playing", "paused", "completed"].includes(midiPlayer.state) &&
    midiPlayer.performance
  ) {
    if (fallingPlaybackSource !== midiPlayer.performance) {
      fallingPlaybackSource = midiPlayer.performance;
      fallingPlaybackTimeline = new FallingNotes.Timeline(
        midiPlayer.performance.notes,
      );
    }
    return {
      ...common,
      held: [...held.values()].map((h) => h.note),
      timeline: fallingPlaybackTimeline,
      position:
        midiPlayer.state === "playing"
          ? Math.min(
              midiPlayer.performance.duration,
              midiPlayer.context.currentTime - midiPlayer.started,
            )
          : midiPlayer.position,
    };
  }
  const t = trainingView;
  if (t && !t.preview && t.state !== "idle") {
    if (fallingSequence?.id === t.sequenceId) {
      const key = t.sequenceId + ":" + t.bpm + ":" + t.timed;
      if (fallingTrainingCache?.key !== key)
        fallingTrainingCache = {
          key,
          ...FallingNotes.trainingNotes(
            fallingSequence.steps,
            t.bpm,
            t.countInMs / 1000,
            importedSequenceId === t.sequenceId ? importedRunDurations : null,
          ),
        };
      const running = ["playing", "countin"].includes(t.state);
      const position = t.timed
        ? (t.elapsedMs +
            (running
              ? Math.min(1500, Math.max(0, now - trainingReceivedAt))
              : 0)) /
          1000
        : (fallingTrainingCache.times[t.index] ?? Infinity);
      return {
        ...common,
        timeline: fallingTrainingCache.timeline,
        position: t.state === "completed" ? Infinity : position,
      };
    }
    // Compatibility with older firmware: limited rolling window, no new control path.
    const start = (t.nextTimeMs ?? t.elapsedMs + t.dueInMs) / 1000;
    const sequence = FallingNotes.trainingNotes(t.upcoming || [], t.bpm, start);
    return {
      ...common,
      timeline: sequence.timeline,
      position: t.timed
        ? (t.elapsedMs +
            (["playing", "countin"].includes(t.state)
              ? Math.min(1500, now - trainingReceivedAt)
              : 0)) /
          1000
        : start,
    };
  }
  return { ...common, timeline: emptyFallingTimeline, position: 0 };
}
$("#trainingDisplay").onchange = () => {
  fallingSequenceFailed = null;
  refreshFallingVisibility();
  try {
    localStorage.setItem("trainingDisplay", $("#trainingDisplay").value);
  } catch {}
};
try {
  $("#trainingDisplay").value =
    localStorage.getItem("trainingDisplay") === "falling"
      ? "falling"
      : "standard";
} catch {}
$("#fallingPreview").onchange = () => {
  fallingView.preview = Number($("#fallingPreview").value);
};
$("#fallingSplit").onchange = () => {
  fallingView.split = Number($("#fallingSplit").value);
};
function setFallingFocus(enabled) {
  document.body.classList.toggle("falling-focus", enabled);
  $("#fallingFocus").setAttribute("aria-expanded", String(enabled));
  I18n.text($("#fallingFocus"), () =>
    I18n.t(enabled ? "Ansicht verkleinern" : "Ansicht vergrößern"),
  );
}
$("#fallingFocus").onclick = () =>
  setFallingFocus(!document.body.classList.contains("falling-focus"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setFallingFocus(false);
});
document.addEventListener("visibilitychange", refreshFallingVisibility);
window.addEventListener("pagehide", () => fallingView.destroy());
refreshFallingVisibility();

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
  return I18n.language === "de"
    ? noteName(note).replace(/^B/, "H")
    : noteName(note);
}
function renderScore() {
  const enabled = $("#showScore").checked;
  $("#scorePanel").hidden = !enabled;
  if (!enabled) return;
  const playback = ["playing", "paused", "completed"].includes(
    playbackView?.state,
  );
  const t = playback
    ? { ...playbackView, total: playbackView.scoreTotal, source: "playback" }
    : trainingView;
  const steps =
    t && !["idle", "completed"].includes(t.state)
      ? (t.upcoming || []).slice(0, 6)
      : [];
  const labels = $("#scoreLabels").checked;
  const cacheKey = JSON.stringify([
    t?.source,
    t?.state,
    t?.total,
    steps,
    labels,
  ]);
  if (cacheKey === lastScoreKey) return;
  lastScoreKey = cacheKey;
  const viewport = $("#scoreViewport");
  viewport.replaceChildren();
  if (!steps.length) {
    I18n.text($("#scoreSummary"), () =>
      t?.state === "completed"
        ? playback
          ? I18n.t("MIDI-Wiedergabe abgeschlossen.")
          : I18n.t("Übung abgeschlossen.")
        : I18n.t(
            "Starte eine Übung oder MIDI-Wiedergabe, um die Noten zu sehen.",
          ),
    );
    return;
  }
  const ns = "http://www.w3.org/2000/svg";
  function element(tag, attrs = {}, text) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "aria-label") I18n.attr(node, key, () => I18n.t(value));
      else node.setAttribute(key, value);
    });
    if (text !== undefined) I18n.text(node, () => I18n.t(text));
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
        I18n.t("Einsatz ") +
          (step.index + 1) +
          ": " +
          (step.notes.length
            ? step.notes.map(scoreName).join(" + ")
            : I18n.t("score.rest")),
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
          I18n.t("score.rest"),
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
        step.ticks === 0
          ? "Ende"
          : (step.ticks / 480).toLocaleString(I18n.locale, {
              maximumFractionDigits: 3,
            }) + I18n.t(" ♩ Abstand"),
      ),
    );
    svg.append(group);
  });
  viewport.append(svg);
  I18n.text(
    $("#scoreSummary"),
    () =>
      (playback ? I18n.t("MIDI-Player · Einsatz ") : I18n.t("Einsatz ")) +
      (I18n.t(steps[0].index) + I18n.t(1)) +
      I18n.t(" von ") +
      I18n.t(t.total) +
      I18n.t(": ") +
      (steps[0].notes.length
        ? labels
          ? I18n.t(steps[0].notes.map(scoreName).join(" + "))
          : I18n.t(steps[0].notes.length) + I18n.t(" Töne")
        : I18n.t("score.rest")) +
      (t.state === "paused" ? I18n.t(" · pausiert") : I18n.t("")),
  );
}

// Browser-local favorites keep complete MIDI files, without using C3 flash or RAM.
function favoriteKey(file, source) {
  return JSON.stringify([
    source,
    source === "nextcloud" ? librarySettings?.folder : "",
    file.path || file.id || file.name,
  ]);
}
async function libraryFile(file, source) {
  if (file.size > 2097152) throw Error("MIDI-Datei ist größer als 2 MiB.");
  const cached = await favorites
    .get(favoriteKey(file, source))
    .catch(() => null);
  if (cached) return new Uint8Array(cached.bytes);
  return libraryDownload(
    source === "nextcloud"
      ? { source, action: "file", name: file.name }
      : {
          source,
          action: "file",
          id: file.id,
          ...(source === "midicollection" ? { path: file.path } : {}),
        },
  );
}
async function saveFavorite(id, name, bytes) {
  window.MidiFile.parse(bytes, { performanceOnly: true });
  await favorites.save(id, name, bytes);
  await refreshFavorites();
  I18n.text(
    $("#favoritesStatus"),
    () => I18n.t("Favorit gespeichert: ") + name,
  );
}
function selectFavorite(record) {
  midiPlayer.stop("Andere MIDI ausgewählt");
  remoteMidi = {
    name: record.name,
    size: record.bytes.byteLength,
    favoriteId: record.id,
    arrayBuffer: async () => record.bytes.slice(0),
  };
  $("#midiFile").value = "";
  $("#importStart").value = "1";
}
async function refreshFavorites() {
  try {
    const entries = await favorites.list(),
      list = $("#favoriteFiles");
    list.replaceChildren();
    if (!entries.length) {
      const row = document.createElement("li");
      I18n.text(row, () => I18n.t("Noch keine Favoriten gespeichert."));
      list.append(row);
    }
    for (const file of entries) {
      const row = document.createElement("li"),
        title = document.createElement("strong"),
        actions = document.createElement("div");
      title.textContent = file.name;
      actions.className = "library-file-actions";
      const button = (text, handler) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "secondary";
        I18n.text(element, () => I18n.t(text));
        element.onclick = handler;
        actions.append(element);
      };
      const load = async () => {
        const record = await favorites.get(file.id);
        if (!record)
          throw Error("Favorit nicht mehr vorhanden. Liste neu laden.");
        selectFavorite(record);
      };
      button("Übernehmen", () =>
        run(async () => {
          await load();
          await importSelectedMidi();
        }),
      );
      button("Anhören", () => {
        try {
          const unlocked = midiPlayer.unlock();
          run(async () => {
            await unlocked;
            await load();
            await playSelectedMidi();
          });
        } catch (error) {
          toast(error.message, true);
        }
      });
      button("Entfernen", () =>
        run(async () => {
          if (
            !confirm(
              I18n.t("Favorit aus diesem Browser entfernen?") + " " + file.name,
            )
          )
            return;
          await favorites.remove(file.id);
          await refreshFavorites();
        }),
      );
      row.append(title, actions);
      list.append(row);
    }
    I18n.text(
      $("#favoritesStatus"),
      () => I18n.t("Gespeicherte Favoriten: ") + entries.length,
    );
  } catch (error) {
    I18n.text($("#favoritesStatus"), () => I18n.t(error.message));
  }
}
$("#saveFavorite").onclick = () =>
  run(async () => {
    const file = remoteMidi || $("#midiFile").files[0];
    if (!file) throw Error("Bitte zuerst eine MIDI-Datei auswählen.");
    if (file.size > 2097152) throw Error("MIDI-Datei ist größer als 2 MiB.");
    const id =
      file.favoriteId ||
      JSON.stringify(["local", file.name, file.size, file.lastModified || 0]);
    await saveFavorite(id, file.name, await file.arrayBuffer());
  });
$("#saveNextcloud").onclick = () =>
  run(async () => {
    if (libraryBusy) throw Error("Bitte den laufenden Download abwarten.");
    if (!librarySettings?.folder)
      throw Error(
        "Zuerst das Nextcloud-Verzeichnis in den Import-Einstellungen hinterlegen.",
      );
    const file = remoteMidi || $("#midiFile").files[0];
    if (!file) throw Error("Bitte zuerst eine MIDI-Datei auswählen.");
    if (file.size > 2097152) throw Error("MIDI-Datei ist größer als 2 MiB.");
    const proposed = file.name.replace(/[\\/\x00-\x1f]/g, "_");
    const name = prompt(
      I18n.t("Dateiname in Nextcloud (vorhandene Dateien bleiben erhalten):"),
      /\.midi?$/i.test(proposed) ? proposed : proposed + ".mid",
    );
    if (name === null) return;
    if (!name.trim() || !/\.midi?$/i.test(name) || /[\\/\x00-\x1f]/.test(name))
      throw Error("Ungültiger MIDI-Dateiname.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    window.MidiFile.parse(bytes, { performanceOnly: true });
    midiPlayer.stop("MIDI-Bibliothek wird geladen");
    setLibraryBusy(true);
    try {
      await commandQueue;
      await cloudUploader.run(name, bytes, (percent) =>
        I18n.text(
          $("#libraryStatus"),
          () => I18n.t("Speichere in Nextcloud: ") + percent + " %",
        ),
      );
    } catch (error) {
      I18n.text($("#libraryStatus"), () => I18n.t(error.message));
      throw error;
    } finally {
      setLibraryBusy(false);
    }
    cloudListLoaded = false;
    try {
      await refreshCloud();
      cloudListLoaded = true;
    } catch {
      toast("Datei gespeichert. Nextcloud-Liste erneut aktualisieren.", true);
    }
    I18n.text(
      $("#libraryStatus"),
      () => I18n.t("In Nextcloud gespeichert: ") + name,
    );
  });

// Shared library UI: all sources feed the same local MIDI parser above.
function setLibraryBusy(busy) {
  libraryBusy = busy;
  document
    .querySelectorAll(
      "#cloudRefresh, #saveNextcloud, #midiSearchForm button, .midi-library-list button, #cloudSettingsForm button, #searchPager button",
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
    I18n.text($("#cloudPasswordHint"), () =>
      librarySettings.hasPassword
        ? I18n.t("Passwort gespeichert. Leer lassen zum Beibehalten.")
        : I18n.t("Noch kein Passwort gespeichert."),
    );
    I18n.text($("#cloudCaHint"), () =>
      librarySettings.hasCa
        ? I18n.t("Eigenes CA-Zertifikat gespeichert.")
        : I18n.t("Mitgelieferter Zertifikatsspeicher aktiv."),
    );
    if (!librarySettings.folder)
      I18n.text($("#libraryStatus"), () =>
        I18n.t(
          "Nextcloud-Verzeichnis in den Import-Einstellungen hinterlegen oder MIDIsss durchsuchen.",
        ),
      );
  } catch (error) {
    I18n.text($("#libraryStatus"), () => I18n.t(error.message));
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
      I18n.text(
        $("#libraryStatus"),
        () =>
          I18n.t("Lade ") +
          I18n.t(Math.round(received / 1024)) +
          I18n.t(" KiB") +
          (total > 0
            ? I18n.t(" von ") +
              I18n.t(Math.round(total / 1024)) +
              I18n.t(" KiB")
            : I18n.t(" …")),
      );
    });
  } catch (error) {
    I18n.text($("#libraryStatus"), () => I18n.t(error.message));
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
    I18n.text(title, () => file.name);
    I18n.text(detail, () =>
      source === "nextcloud"
        ? file.size !== null
          ? I18n.t(Math.round(file.size / 1024)) + I18n.t(" KiB")
          : I18n.t("MIDI-Datei")
        : (file.notes || "") +
          (file.rating !== null
            ? I18n.t(" · Bewertung: ") + I18n.t(file.rating)
            : I18n.t("")),
    );
    text.append(title, detail);
    button.type = "button";
    I18n.text(button, () => I18n.t("Übernehmen"));
    button.className = "secondary";
    button.onclick = () =>
      run(async () => {
        if (file.size > 2097152)
          throw Error("MIDI-Datei ist größer als 2 MiB.");
        const bytes = await libraryFile(file, source);
        remoteMidi = {
          favoriteId: favoriteKey(file, source),
          name: file.name,
          size: bytes.length,
          arrayBuffer: async () => bytes.buffer,
        };
        $("#midiFile").value = "";
        $("#importStart").value = "1";
        try {
          await importSelectedMidi();
        } catch (error) {
          I18n.text($("#importResult"), () => I18n.t(error.message));
          I18n.text($("#libraryStatus"), () => I18n.t(error.message));
          throw error;
        }
        I18n.text(
          $("#libraryStatus"),
          () =>
            I18n.t("Geladen: ") +
            file.name +
            I18n.t(
              ". Kanal, Transposition und Abschnitt unten einstellen; erneut übernehmen, um die Auswahl anzuwenden.",
            ),
        );
      });
    const listen = document.createElement("button");
    listen.type = "button";
    listen.className = "secondary";
    I18n.text(listen, () => I18n.t("Anhören"));
    listen.onclick = () => {
      let unlock;
      try {
        I18n.text($("#midiPlaybackStatus"), () =>
          I18n.t("Klavier wird geladen …"),
        );
        unlock = midiPlayer.unlock();
      } catch (error) {
        toast(error.message, true);
        return;
      }
      run(async () => {
        await unlock;
        midiPlayer.stop("Andere MIDI ausgewählt");
        const bytes = await libraryFile(file, source);
        remoteMidi = {
          favoriteId: favoriteKey(file, source),
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
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "secondary";
    I18n.text(favorite, () => I18n.t("Als Favorit speichern"));
    favorite.onclick = () =>
      run(async () => {
        const bytes = await libraryFile(file, source);
        await saveFavorite(
          favoriteKey(file, source),
          file.name,
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        );
      });
    actions.append(button, listen, favorite);
    row.append(text, actions);
    list.append(row);
  });
  if (!result.files.length) {
    const row = document.createElement("li");
    I18n.text(row, () => I18n.t("Keine MIDI-Dateien gefunden."));
    list.append(row);
  }
  if (result.truncated) {
    const row = document.createElement("li");
    I18n.text(row, () =>
      I18n.t(
        "Liste begrenzt. Suche eingrenzen bzw. kleineren Nextcloud-Ordner verwenden.",
      ),
    );
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
    I18n.text(
      $("#libraryStatus"),
      () =>
        I18n.t(result.files.length) +
        I18n.t(" Nextcloud-MIDIs im hinterlegten Verzeichnis."),
    );
  } catch (error) {
    I18n.text($("#libraryStatus"), () => I18n.t(error.message));
    throw error;
  }
}
$("#cloudRefresh").onclick = () => run(refreshCloud);
$("#libraryCancel").onclick = () =>
  run(async () => {
    const uploading = Boolean(cloudUploader.current);
    await cloudUploader.cancel();
    await libraryClient.cancel();
    I18n.text($("#libraryStatus"), () =>
      I18n.t(
        uploading
          ? "Nextcloud-Upload wird abgebrochen …"
          : "Download wird abgebrochen …",
      ),
    );
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
    I18n.text(
      $("#onlineLibraryTitle"),
      () => I18n.t(name) + I18n.t("-Suchergebnisse"),
    );
    I18n.text(
      $("#libraryStatus"),
      () =>
        I18n.t(result.files.length) +
        I18n.t(" ") +
        I18n.t(name) +
        I18n.t("-Treffer auf dieser Seite."),
    );
    $("#searchPager").hidden = onlineSearch.pages <= 1;
    I18n.text(
      $("#searchPageInfo"),
      () =>
        I18n.t("Seite ") +
        I18n.t(onlineSearch.page) +
        I18n.t(" / ") +
        I18n.t(onlineSearch.pages),
    );
    $("#searchPrevious").disabled = onlineSearch.page <= 1;
    $("#searchNext").disabled = onlineSearch.page >= onlineSearch.pages;
  } catch (error) {
    I18n.text($("#libraryStatus"), () => I18n.t(error.message));
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
  I18n.text(
    $("#onlineLibraryTitle"),
    () =>
      I18n.t($("#onlineSource").selectedOptions[0].textContent) +
      I18n.t("-Suchergebnisse"),
  );
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
      I18n.text($("#cloudSettingsResult"), () =>
        I18n.t(
          "Gespeichert. Die MIDI-Liste wird beim Öffnen des Trainings geladen.",
        ),
      );
    } catch (error) {
      I18n.text($("#cloudSettingsResult"), () => I18n.t(error.message));
      throw error;
    }
  });
};

function renderPlayback(view) {
  playbackView = view;
  updateFallingPause();
  playbackLeds(view);
  const format = (seconds) =>
    Math.floor(seconds / 60) +
    ":" +
    String(Math.floor(seconds % 60)).padStart(2, "0");
  $("#pauseMidi").disabled = !["playing", "paused"].includes(view.state);
  I18n.text($("#pauseMidi"), () =>
    view.state === "paused" ? I18n.t("Fortsetzen") : I18n.t("Pause"),
  );
  $("#stopMidi").disabled = !["playing", "paused"].includes(view.state);
  $("#pauseMidi").hidden = $("#pauseMidi").disabled;
  $("#stopMidi").hidden = $("#stopMidi").disabled;
  const label = {
    playing: "Spielt",
    paused: "Pausiert",
    completed: "Fertig",
    stopped: "Gestoppt",
  }[view.state];
  I18n.text(
    $("#midiPlaybackStatus"),
    () =>
      I18n.t(label) +
      (playbackName ? ": " + playbackName : "") +
      I18n.t(" · ") +
      I18n.t(format(view.position)) +
      I18n.t(" / ") +
      I18n.t(format(view.duration)) +
      (view.reason ? I18n.t(" · ") + I18n.t(view.reason) : I18n.t("")) +
      (view.sound ? I18n.t(" · ") + I18n.t(view.sound) : I18n.t("")),
  );
  renderScore();
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
  $("#showScore").checked = true;
  midiPlayer.play(performance);
}
$("#listenMidi").onclick = () => {
  let unlock;
  try {
    I18n.text($("#midiPlaybackStatus"), () => I18n.t("Klavier wird geladen …"));
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
  else {
    try {
      const unlocked = midiPlayer.unlock();
      run(async () => {
        await unlocked;
        midiPlayer.resume();
      });
    } catch (error) {
      toast(error.message, true);
    }
  }
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
  if (!sessionOwned) return;
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

function renderPresetCatalog(presets) {
  if (!Array.isArray(presets) || !presets.length) return;
  const field = $("#trainingPreset"),
    selected = field.value;
  const custom = field.querySelector('option[value="custom"]');
  const options = presets
    .filter(
      (p) =>
        typeof p.id === "string" &&
        p.id !== "custom" &&
        typeof p.title === "string",
    )
    .map((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      I18n.text(option, () => I18n.t(p.title));
      return option;
    });
  if (!options.length) return;
  field.replaceChildren(...options, custom);
  field.value = [...field.options].some((o) => o.value === selected)
    ? selected
    : options[0].value;
}
function renderLessonInfo() {
  const lesson = lessons.find((item) => item.id === $("#lessonSelect").value);
  if (!lesson) return;
  I18n.text(
    $("#lessonGoal"),
    () =>
      I18n.t("Lernziel: ") +
      I18n.t(lesson.goal) +
      I18n.t(" · ") +
      I18n.t(lesson.bpm) +
      I18n.t(" BPM"),
  );
  I18n.text($("#lessonInstruction"), () => I18n.t(lesson.instruction));
  I18n.text($("#lessonStatus"), () =>
    lesson.runs
      ? I18n.t("★".repeat(lesson.stars)) +
        I18n.t(" · Bestwert ") +
        I18n.t(lesson.best) +
        I18n.t(" % · ") +
        I18n.t(lesson.runs) +
        I18n.t(" abgeschlossene Durchläufe") +
        (lesson.passed ? I18n.t(" · Bestanden") : I18n.t(" · Noch üben"))
      : I18n.t("Noch nicht abgeschlossen. Schritt für Schritt anfangen."),
  );
  if (
    trainingView?.lesson === lesson.id &&
    trainingView.lessonRecorded &&
    !trainingView.lessonSaved
  )
    I18n.text($("#lessonStatus"), () =>
      I18n.t(
        "Ergebnis konnte nicht dauerhaft gespeichert werden. Bitte die Lektion später wiederholen.",
      ),
    );
}
function renderLessons() {
  const field = $("#lessonSelect");
  const selected = field.value;
  const recommended = lessons.find((item) => !item.passed);
  field.replaceChildren();
  const groups = new Map();
  for (const lesson of lessons) {
    if (!groups.has(lesson.chapter)) {
      const group = document.createElement("optgroup");
      I18n.attr(group, "label", () => I18n.t(lesson.chapter));
      groups.set(lesson.chapter, group);
      field.append(group);
    }
    const option = document.createElement("option");
    option.value = lesson.id;
    I18n.text(
      option,
      () =>
        I18n.t(lesson.title) +
        (lesson.runs
          ? I18n.t(" · ") +
            I18n.t("★".repeat(lesson.stars)) +
            I18n.t(" ") +
            I18n.t(lesson.best) +
            I18n.t(" %")
          : I18n.t("")),
    );
    groups.get(lesson.chapter).append(option);
  }
  field.value = lessons.some((item) => item.id === selected)
    ? selected
    : lessons.some((item) => item.id === trainingView?.lesson)
      ? trainingView.lesson
      : (recommended || lessons[0]).id;
  const passed = lessons.filter((item) => item.passed).length;
  const stars = lessons.reduce((sum, item) => sum + item.stars, 0);
  $("#lessonProgress").max = lessons.length;
  $("#lessonProgress").value = passed;
  I18n.text(
    $("#lessonProgressText"),
    () =>
      I18n.t(passed) +
      I18n.t("/") +
      I18n.t(lessons.length) +
      I18n.t(" bestanden · ") +
      I18n.t(stars) +
      I18n.t("/") +
      I18n.t(lessons.length * 3) +
      I18n.t(" Sterne"),
  );
  field.disabled = false;
  $("#startLesson").disabled = false;
  $("#nextLesson").disabled = !recommended;
  I18n.text($("#nextLesson"), () =>
    recommended
      ? I18n.t("Empfehlung wählen")
      : I18n.t("Alle Lektionen bestanden"),
  );
  renderLessonInfo();
}
function loadLessons(force = false) {
  if (lessonLoad)
    return force ? lessonLoad.then(() => loadLessons(true)) : lessonLoad;
  if (lessonsLoaded && !force) return Promise.resolve(true);
  lessonLoad = api("lessons")
    .then((reply) => {
      if (
        !Array.isArray(reply.lessons) ||
        !reply.lessons.length ||
        reply.lessons.length > 64
      )
        throw Error("Keine gültigen Lektionen vom Trainer erhalten.");
      lessons = reply.lessons;
      lessonsLoaded = true;
      renderLessons();
      return true;
    })
    .catch((error) => {
      I18n.text($("#lessonStatus"), () => I18n.t(error.message));
      return false;
    })
    .finally(() => {
      lessonLoad = null;
    });
  return lessonLoad;
}
$("#lessonSelect").onchange = renderLessonInfo;
$("#nextLesson").onclick = () => {
  const next = lessons.find((item) => !item.passed);
  if (next) {
    $("#lessonSelect").value = next.id;
    renderLessonInfo();
  }
};
$("#startLesson").onclick = () =>
  run(async () => {
    const lesson = lessons.find((item) => item.id === $("#lessonSelect").value);
    if (!lesson) throw Error("Bitte zuerst eine Lektion wählen.");
    $("#showScore").checked = true;
    await trainingCommand({ command: "lesson", lesson: lesson.id });
    $("#trainingMode").value = lesson.mode;
    $("#trainingPreset").value = lesson.preset;
    $("#trainingBpm").value = lesson.bpm;
    if (Number.isInteger(lesson.root)) $("#trainingRoot").value = lesson.root;
    $("#songTimed").value = lesson.mode === "song" ? "true" : "false";
    $("#trainingMode").onchange();
    I18n.text(
      $("#lessonStatus"),
      () =>
        I18n.t(lesson.title) + I18n.t(" läuft. ") + I18n.t(lesson.instruction),
    );
  });
$("#resetLessonProgress").onclick = () => {
  if (
    !confirm(
      I18n.t(
        "Lernfortschritt für alle Nutzer dieses Trainers zurücksetzen? WLAN und LED-Einstellungen bleiben erhalten.",
      ),
    )
  )
    return;
  run(async () => {
    const reply = await api("lessons/reset", { confirm: "LERNFORTSCHRITT" });
    lastLessonCompletion = "";
    if (reply.training) renderTraining(reply.training);
    await loadLessons(true);
    I18n.text($("#lessonStatus"), () =>
      I18n.t("Lernfortschritt zurückgesetzt."),
    );
    toast("Lernfortschritt zurückgesetzt.");
  });
};

let maintenanceBusy = false;
const maintenanceMessage = (source) =>
  I18n.text($("#maintenanceStatus"), source);
function maintenanceControls(busy) {
  maintenanceBusy = busy;
  document
    .querySelectorAll(
      "#updateForm button, #restoreForm button, #downloadBackup, #updateFile, #backupFile, #downloadBrowserBackup, #browserRestoreForm button, #browserBackupFile",
    )
    .forEach((node) => (node.disabled = busy));
}
async function quietForMaintenance() {
  midiPlayer.stop("Wartung gestartet");
  silence();
  await release();
  await commandQueue;
  await api("training", { command: "free" });
}
window.addEventListener("beforeunload", (event) => {
  if (maintenanceBusy) {
    event.preventDefault();
    event.returnValue = "";
  }
});
$("#downloadBrowserBackup").onclick = () =>
  run(async () => {
    if (maintenanceBusy) return;
    maintenanceControls(true);
    try {
      const preferences = {};
      for (const key of [
        "language",
        "navigationCollapsed",
        "showScore",
        "scoreLabels",
        "trainingDisplay",
      ]) {
        const value = localStorage.getItem(key);
        if (value !== null) preferences[key] = value;
      }
      const url = URL.createObjectURL(
        await favorites.exportArchive(preferences),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "piano-trainer-browser.ptbrowser";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      maintenanceMessage(() => I18n.t("Backup heruntergeladen."));
    } finally {
      maintenanceControls(false);
    }
  });
$("#browserRestoreForm").onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    if (maintenanceBusy) return;
    const file = $("#browserBackupFile").files[0];
    if (!file || file.size > 33554432 + 262156)
      throw Error("Ungültiges Browser-Backup.");
    if (
      !confirm(
        I18n.t(
          "Browser-Favoriten importieren und Ansicht übernehmen? Gleiche Favoriten werden ersetzt.",
        ),
      )
    )
      return;
    maintenanceControls(true);
    try {
      const preferences = await favorites.importArchive(
        await file.arrayBuffer(),
      );
      let preferencesSaved = true;
      try {
        for (const [key, value] of Object.entries(preferences))
          localStorage.setItem(key, value);
      } catch {
        preferencesSaved = false;
      }
      maintenanceMessage(() =>
        I18n.t(
          preferencesSaved
            ? "Browser-Backup importiert. Seite neu laden, um die Ansicht zu übernehmen."
            : "Favoriten importiert. Ansicht konnte nicht gespeichert werden; Browser-Speicher prüfen.",
        ),
      );
      await refreshFavorites();
      $("#maintenanceReload").hidden = false;
    } finally {
      maintenanceControls(false);
    }
  });
};
$("#downloadBackup").onclick = () =>
  run(async () => {
    if (maintenanceBusy) return;
    const backup = await api("backup");
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "piano-trainer-backup.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    maintenanceMessage(() => I18n.t("Backup heruntergeladen."));
  });
$("#restoreForm").onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    if (maintenanceBusy) return;
    const file = $("#backupFile").files[0];
    if (!file || file.size > 16384)
      throw Error("Backup-Datei fehlt oder ist größer als 16 KiB.");
    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      throw Error("Ungültiges JSON.");
    }
    if (backup?.format !== "piano-trainer-backup" || backup.schema !== 1)
      throw Error("Unbekanntes oder unvollständiges Backup.");
    if (backup.led && !status.pins.includes(backup.led.pin)) {
      const value = prompt(
        I18n.t(
          "Der LED-Pin im Backup ist auf diesem Board gesperrt. Bitte einen passenden GPIO wählen:",
        ) +
          " " +
          status.pins.join(", "),
      );
      if (value === null) return;
      const pin = Number(value);
      if (!/^\d+$/.test(value) || !status.pins.includes(pin))
        throw Error("Ungültiger LED-Pin.");
      backup.led.pin = pin;
    }
    // Validate the complete profile before stopping playback or touching NVS.
    if (status?.update) await api("restore/preview", backup);
    if (
      !confirm(
        I18n.t(
          "Einstellungen und Lernfortschritt durch dieses Backup ersetzen? Der Trainer startet neu.",
        ),
      )
    )
      return;
    maintenanceControls(true);
    try {
      await quietForMaintenance();
      await api("restore", { ...backup, confirm: "RESTORE" });
      maintenanceMessage(() =>
        I18n.t("Backup wiederhergestellt. Neustart … Danach Seite neu laden."),
      );
      $("#maintenanceReload").hidden = false;
    } catch (error) {
      maintenanceMessage(() => I18n.t(error.message));
      throw error;
    } finally {
      maintenanceControls(false);
    }
  });
};
$("#updateForm").onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    if (maintenanceBusy) return;
    const file = $("#updateFile").files[0];
    if (!file) throw Error("Update-Datei fehlt oder ist unvollständig.");
    const metadata = window.TrainerMaintenance.parsePackage(
      new Uint8Array(await file.slice(0, 256).arrayBuffer()),
      file.size,
      status?.update,
    );
    const kind =
      metadata.kind === "web"
        ? "Klaviersamples (optional)"
        : "Firmware, Oberfläche und Sprachen";
    if (
      !confirm(
        I18n.t("Update übertragen und Gerät neu starten?") +
          " " +
          I18n.t(kind) +
          " " +
          (metadata.version || ""),
      )
    )
      return;
    maintenanceControls(true);
    $("#maintenanceProgress").hidden = false;
    $("#maintenanceProgress").value = 0;
    try {
      await quietForMaintenance();
      maintenanceMessage(() => I18n.t("Update wird übertragen …"));
      await window.TrainerMaintenance.upload(file, (value) => {
        $("#maintenanceProgress").value = value;
        maintenanceMessage(
          () => I18n.t("Update wird übertragen …") + " " + value + " %",
        );
      });
      $("#maintenanceProgress").value = 100;
      maintenanceMessage(() =>
        I18n.t(
          "Update geprüft und gespeichert. Neustart … Danach Seite neu laden.",
        ),
      );
      $("#maintenanceReload").hidden = false;
    } catch (error) {
      maintenanceMessage(() => I18n.t(error.message));
      throw error;
    } finally {
      maintenanceControls(false);
    }
  });
};
$("#maintenanceReload").onclick = () => location.reload();
