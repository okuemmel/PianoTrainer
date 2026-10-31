const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync("data/index.html", "utf8");
const script = fs.readFileSync("data/app.js", "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function setup(
  library = { folder: "", user: "", hasPassword: false, hasCa: false },
) {
  const dom = new JSDOM(html, {
    url: "http://192.168.4.1/",
    runScripts: "outside-only",
  });
  dom.window.TextDecoder = TextDecoder;
  const calls = [];
  let leds = { count: 60, pin: 4, brightness: 25, frame: "000000".repeat(60) };
  let training = {
    mode: "free",
    state: "idle",
    feedback: "Bereit",
    exercise: "Freies Spiel",
    index: 0,
    total: 0,
    correct: 0,
    wrong: 0,
    missed: 0,
    accuracy: 0,
    bpm: 80,
    tolerance: 220,
    timed: false,
    lastTimingMs: 0,
    averageTimingMs: 0,
    dueInMs: 0,
    beatMs: 750,
    durationMs: 750,
    elapsedMs: 0,
    countInMs: 0,
    lastErrorNote: -1,
    expected: [],
    held: [],
  };
  let config = {
    count: 60,
    pin: 4,
    brightness: 25,
    first: 0,
    keys: 49,
    baseNote: 48,
    reversed: false,
    rgb: false,
    channel: 0,
    mapping: Array.from({ length: 128 }, (_, n) =>
      n >= 48 && n <= 96 ? n - 48 : -1,
    ),
  };
  dom.window.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, options, body });
    let data = { ok: true };
    if (url === "/api/status")
      data = {
        training,
        leds,
        board: "ESP32-C3 SuperMini",
        connected: true,
        wifiState: "Verbunden",
        ssid: "Test",
        ip: "192.168.1.9",
        subnet: "255.255.255.0",
        gateway: "192.168.1.1",
        dns1: "192.168.1.1",
        dns2: "0.0.0.0",
        mac: "02:00:00:00:00:01",
        rssi: -51,
        hostname: "midi-trainer",
        mdns: true,
        apIp: "192.168.4.1",
        apMask: "255.255.255.0",
        apMac: "02:00:00:00:00:02",
        ap: false,
        keys: 49,
        baseNote: 48,
        channel: 0,
        heap: 120000,
        flash: 4194304,
        uptime: 90,
        mode: "off",
        filesystem: true,
        firmware: "1.0.0",
        pins: [0, 1, 3, 4, 5, 6, 7, 10, 20, 21],
      };
    if (url === "/api/training") {
      if (body?.command === "start")
        training = {
          ...training,
          mode: body.mode,
          state: body.mode === "rhythm" ? "countin" : "playing",
          expected: [body.root || 60],
          total: 9,
          index: 0,
          exercise: "Fünf-Finger-Übung",
          timed: body.mode === "rhythm" || body.timed,
        };
      if (body?.command === "pause")
        training = { ...training, state: "paused", expected: [] };
      if (body?.command === "resume")
        training = { ...training, state: "playing", expected: [60] };
      if (body?.command === "free")
        training = { ...training, state: "idle", mode: "free", expected: [] };
      data = { training, leds, presets: [] };
    }
    if (url === "/api/midi") data = { ok: true, training, leds };
    if (url === "/api/led") data = { ok: true, training, leds };
    if (url === "/api/library/config") {
      if (body) {
        library = {
          folder: body.folder,
          user: body.user,
          hasPassword:
            body.password === undefined ? library.hasPassword : !!body.password,
          hasCa: body.ca === undefined ? library.hasCa : !!body.ca,
        };
        data = { ok: true };
      } else data = { ...library };
    }
    if (url === "/api/config") {
      if (body) {
        config = body;
        data = { ok: true, training, leds };
      } else data = config;
    }
    if (url === "/api/network")
      data = { ok: true, hostname: body.hostname, restart: true };
    if (url === "/api/wifi/scan")
      data = {
        scanning: false,
        networks: [
          { ssid: "<img src=x onerror=alert(1)>", rssi: -55, open: false },
        ],
      };
    return {
      ok: true,
      status: 200,
      json: async () => data,
      arrayBuffer: async () =>
        dom.window.Uint8Array.from(fs.readFileSync("data/piano-samples.bin"))
          .buffer,
    };
  };
  dom.window.eval(fs.readFileSync("data/midi-file.js", "utf8"));
  dom.window.eval(fs.readFileSync("data/library.js", "utf8"));
  dom.window.eval(fs.readFileSync("data/piano-audio.js", "utf8"));
  dom.window.eval(fs.readFileSync("data/midi-player.js", "utf8"));
  dom.window.eval(
    script +
      "\nwindow.receiveTrainingSnapshot = renderTraining; window.receiveNetworkSnapshot = renderStatus; window.receivePlaybackSnapshot = renderPlayback; window.testMidiPlayer = midiPlayer;",
  );
  await tick();
  await tick();
  return {
    dom,
    w: dom.window,
    d: dom.window.document,
    calls,
    deliverTraining: (next) => {
      training = { ...training, ...next };
      dom.window.receiveTrainingSnapshot(training);
    },
    setLeds: (next) => {
      leds = next;
    },
  };
}
function pointer(w, node, type, id) {
  const e = new w.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "pointerId", { value: id });
  node.dispatchEvent(e);
}
test("49 keys, conservative GPIO choices and 128 mappings render", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  assert.equal(s.d.querySelectorAll(".key").length, 49);
  assert.equal(s.d.querySelectorAll("[data-note]").length, 128);
  assert.equal(s.d.querySelectorAll("#pin option").length, 10);
  assert.equal(s.d.querySelector("#wifiState").textContent, "Verbunden");
  assert.equal(
    s.d.querySelector(".key").getAttribute("aria-label"),
    "C3, MIDI 48",
  );
});
test("polyphonic pointer input sends ordered note on/off and releases on blur", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const keys = s.d.querySelectorAll(".key");
  pointer(s.w, keys[0], "pointerdown", 1);
  pointer(s.w, keys[4], "pointerdown", 2);
  await tick();
  assert.equal(s.d.querySelectorAll(".pressed").length, 2);
  pointer(s.w, keys[0], "pointerup", 1);
  await tick();
  assert.equal(s.d.querySelectorAll(".pressed").length, 1);
  s.w.dispatchEvent(new s.w.Event("blur"));
  await tick();
  assert.equal(s.d.querySelectorAll(".pressed").length, 0);
  assert.deepEqual(
    s.calls.filter((c) => c.url === "/api/midi").map((c) => c.body),
    [
      { note: 48, velocity: 100, channel: 1, on: true },
      { note: 52, velocity: 100, channel: 1, on: true },
      { note: 48, velocity: 0, channel: 1, on: false },
      { release: true },
    ],
  );
});
test("config edits post complete typed mapping and mutation header", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const form = s.d.querySelector("#ledForm");
  form.elements.brightness.value = "15";
  s.d.querySelector('[data-note="48"]').value = "8";
  form.dispatchEvent(
    new s.w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await tick();
  await tick();
  const saved = s.calls.find((c) => c.url === "/api/config" && c.body);
  assert.equal(saved.body.brightness, 15);
  assert.equal(saved.body.mapping[48], 8);
  assert.equal(saved.body.mapping.length, 128);
  assert.equal(saved.options.headers["X-Trainer"], "1");
  assert.equal(saved.body.reversed, false);
});
test("network labels use text, selection and credentials are submitted without retaining password", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  s.d.querySelector("#scan").click();
  await tick();
  const network = s.d.querySelector("#networks button");
  assert.ok(network.textContent.includes("<img"));
  assert.equal(network.querySelector("img"), null);
  network.click();
  const form = s.d.querySelector("#wifiForm");
  assert.equal(form.elements.ssid.value, "<img src=x onerror=alert(1)>");
  form.elements.password.value = "example-test-password";
  form.dispatchEvent(
    new s.w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await tick();
  await tick();
  assert.equal(
    s.calls.find((c) => c.url === "/api/wifi").body.password,
    "example-test-password",
  );
  assert.equal(form.elements.password.value, "");
});
test("all tests produce expected LED commands and route navigation releases notes", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  s.d.querySelector('[data-command="chase"]').click();
  await tick();
  assert.equal(s.calls.find((c) => c.url === "/api/led").body.command, "chase");
  pointer(s.w, s.d.querySelector(".key"), "pointerdown", 5);
  await tick();
  s.w.location.hash = "config";
  s.w.dispatchEvent(new s.w.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(s.d.querySelector("#control").hidden, false);
  assert.equal(s.d.querySelectorAll(".pressed").length, 0);
});
test("connected Wi-Fi shows a usable address and LED request feedback", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  assert.equal(s.d.querySelector("#wifiAddress").hidden, false);
  assert.equal(
    s.d.querySelector("#wifiAddressLink").href,
    "http://192.168.1.9/",
  );
  s.d.querySelector('[data-command="diagnostic"]').click();
  await tick();
  assert.equal(
    s.calls.find((c) => c.url === "/api/led").body.command,
    "diagnostic",
  );
  assert.ok(s.d.querySelector("#ledResult").textContent.includes("angenommen"));
});
test("LED errors remain visible next to controls", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const originalFetch = s.w.fetch;
  s.w.fetch = async (url, options) =>
    url === "/api/led"
      ? {
          ok: false,
          status: 400,
          json: async () => ({ error: "Ungültige Farbe." }),
        }
      : originalFetch(url, options);
  s.d.querySelector('[data-command="color"]').click();
  await tick();
  assert.ok(
    s.d.querySelector("#ledResult").textContent.includes("Ungültige Farbe."),
  );
});

test("training starts, moves the shared keyboard and supports pause/resume/free play", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  s.w.location.hash = "training";
  s.w.dispatchEvent(new s.w.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(
    s.d.querySelector("#keyboard").closest("#ledPreview").parentElement.id,
    "trainingKeyboardMount",
  );
  const form = s.d.querySelector("#trainingForm");
  form.dispatchEvent(
    new s.w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await tick();
  await tick();
  const started = s.calls.find(
    (c) => c.url === "/api/training" && c.body?.command === "start",
  );
  assert.equal(started.body.mode, "guided");
  assert.equal(started.body.root, 60);
  assert.equal(s.d.querySelectorAll(".key.target").length, 1);
  assert.equal(s.d.querySelector("#trainingPause").disabled, false);
  s.d.querySelector("#trainingPause").click();
  await tick();
  await tick();
  assert.equal(s.d.querySelector("#trainingState").textContent, "PAUSIERT");
  s.d.querySelector("#trainingResume").click();
  await tick();
  await tick();
  assert.equal(s.d.querySelector("#trainingState").textContent, "ÜBUNG LÄUFT");
  s.d.querySelector("#trainingFree").click();
  await tick();
  await tick();
  assert.equal(s.d.querySelector("#trainingState").textContent, "FREIES SPIEL");
  assert.equal(s.d.querySelectorAll(".key").length, 49);
});
test("leaving training pauses a running lesson", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  s.w.location.hash = "training";
  await tick();
  s.d
    .querySelector("#trainingForm")
    .dispatchEvent(
      new s.w.Event("submit", { bubbles: true, cancelable: true }),
    );
  await tick();
  await tick();
  s.w.location.hash = "system";
  s.w.dispatchEvent(new s.w.HashChangeEvent("hashchange"));
  await tick();
  await tick();
  assert.ok(
    s.calls.some(
      (c) => c.url === "/api/training" && c.body?.command === "pause",
    ),
  );
});

test("LED simulation renders the device frame and updates immediately after note on/off", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  assert.equal(s.d.querySelectorAll(".led-cell").length, 49);
  assert.equal(s.d.querySelectorAll(".led-cell.lit").length, 0);
  const pixels = Array(60).fill("000000");
  pixels[12] = "000925";
  pixels[13] = "3f0000";
  s.setLeds({ count: 60, pin: 4, brightness: 25, frame: pixels.join("") });
  const key = s.d.querySelector('.key[data-note-value="60"]');
  pointer(s.w, key, "pointerdown", 9);
  await tick();
  assert.equal(s.d.querySelectorAll(".led-cell.lit").length, 2);
  assert.equal(s.d.querySelector('[data-led="12"]').dataset.color, "#000925");
  assert.ok(s.d.querySelector('[data-led="12"]').title.includes("C4 (60)"));
  assert.equal(s.d.querySelector('[data-led="13"]').dataset.color, "#3f0000");
  s.setLeds({ count: 60, pin: 4, brightness: 25, frame: "000000".repeat(60) });
  pointer(s.w, key, "pointerup", 9);
  await tick();
  assert.equal(s.d.querySelectorAll(".led-cell.lit").length, 0);
  s.w.location.hash = "training";
  s.w.dispatchEvent(new s.w.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(
    s.d.querySelector("#ledPreview").parentElement.id,
    "trainingKeyboardMount",
  );
  assert.equal(s.d.querySelectorAll("#ledPreview").length, 1);
});
test("LED labels respect first offset, reversal and shared-note mapping", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const form = s.d.querySelector("#ledForm");
  form.elements.first.value = "4";
  form.elements.reversed.value = "true";
  s.d.querySelector('[data-note="61"]').value = "12";
  form.dispatchEvent(
    new s.w.Event("submit", { bubbles: true, cancelable: true }),
  );
  await tick();
  await tick();
  const label = s.d.querySelector('[data-led="43"]').title;
  assert.ok(label.includes("C4 (60)"));
  assert.ok(
    s.d
      .querySelector('.led-cell[data-note-value="61"]')
      .title.includes("C♯4 (61)"),
  );
  assert.equal(s.d.querySelectorAll('[data-led="43"]').length, 2);
  assert.equal(s.d.querySelector('[data-led="0"]'), null);
});
test("LED preview supports 300 pixels and recovers from a malformed frame", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const valid = {
    count: 300,
    pin: 4,
    brightness: 100,
    frame: "000000".repeat(299) + "00ff00",
  };
  s.setLeds(valid);
  s.d.querySelector("#freePlay").click();
  await tick();
  await tick();
  assert.equal(s.d.querySelectorAll(".led-cell").length, 49);
  assert.equal(s.d.querySelectorAll(".led-cell.lit").length, 0);
  assert.equal(s.d.querySelector('[data-led="299"]'), null);
  s.setLeds({ ...valid, frame: "broken" });
  s.d.querySelector("#freePlay").click();
  await tick();
  await tick();
  assert.equal(
    s.d.querySelector("#ledPreviewInfo").textContent,
    "LED-Zustand nicht verfügbar",
  );
  s.setLeds(valid);
  s.d.querySelector("#freePlay").click();
  await tick();
  await tick();
  assert.ok(
    s.d.querySelector("#ledPreviewInfo").textContent.includes("300 LEDs"),
  );
});

test("one LED is centered above every white and black key in the shared scroller", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const keys = [...s.d.querySelectorAll(".key")],
    cells = [...s.d.querySelectorAll(".led-cell")];
  assert.equal(keys.length, cells.length);
  keys.forEach((key, i) => {
    assert.equal(key.dataset.noteValue, cells[i].dataset.noteValue);
    const keyCenter =
      parseFloat(key.style.left) + (key.classList.contains("black") ? 12 : 20);
    assert.equal(parseFloat(cells[i].style.left), keyCenter);
    assert.equal(
      key.closest(".piano-scroll"),
      cells[i].closest(".piano-scroll"),
    );
  });
  assert.equal(cells[0].style.left, "20px");
  assert.equal(cells[1].style.left, "40px");
  assert.equal(cells[2].style.left, "60px");
});
test("optional browser audio uses the correct pitch and releases on key-up and blur", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const oscillators = [],
    gains = [];
  s.w.AudioContext = class {
    state = "suspended";
    currentTime = 10;
    destination = {};
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createGain() {
      const node = {
        gain: {
          value: 0,
          setValueAtTime() {},
          exponentialRampToValueAtTime() {},
          cancelScheduledValues() {},
          setTargetAtTime() {
            node.released = true;
          },
        },
        connect() {},
        disconnect() {},
      };
      gains.push(node);
      return node;
    }
    createOscillator() {
      const node = {
        frequency: {},
        stops: [],
        connect() {},
        disconnect() {},
        start() {},
        stop(time) {
          this.stops.push(time);
        },
        addEventListener() {},
      };
      oscillators.push(node);
      return node;
    }
  };
  const key = s.d.querySelector('.key[data-note-value="69"]');
  pointer(s.w, key, "pointerdown", 1);
  pointer(s.w, key, "pointerup", 1);
  assert.equal(oscillators.length, 0);
  s.d.querySelector("#soundEnabled").click();
  await tick();
  pointer(s.w, key, "pointerdown", 2);
  assert.equal(oscillators.length, 3);
  assert.equal(oscillators[0].frequency.value, 440);
  pointer(s.w, key, "pointerup", 2);
  assert.equal(oscillators[0].stops.at(-1), 10.15);
  pointer(s.w, key, "pointerdown", 3);
  s.w.dispatchEvent(new s.w.Event("blur"));
  assert.equal(oscillators[3].stops.at(-1), 10.15);
  assert.ok(gains.some((g) => g.released));
  await tick();
  await tick();
});
test("MIDI import transfers only the selected section with visible totals", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  let options;
  s.w.MidiFile.parse = (buffer, opts) => {
    options = opts;
    return {
      steps: [{ notes: [60], ticks: 480 }],
      startStep: 128,
      totalSteps: 2000,
      bpm: 100,
      channels: [2],
      quantized: true,
      droppedNotes: 7,
    };
  };
  Object.defineProperty(s.d.querySelector("#midiFile"), "files", {
    value: [
      {
        size: 108555,
        name: "example.mid",
        arrayBuffer: async () => new ArrayBuffer(0),
      },
    ],
  });
  s.d.querySelector("#importStart").value = "129";
  s.d.querySelector("#importMidi").click();
  await tick();
  await tick();
  assert.equal(options.startStep, 128);
  assert.equal(options.minNote, 48);
  assert.equal(options.maxNote, 96);
  assert.match(
    s.d.querySelector("#importResult").textContent,
    /129–129 von 2000/,
  );
  s.d
    .querySelector("#trainingForm")
    .dispatchEvent(
      new s.w.Event("submit", { cancelable: true, bubbles: true }),
    );
  await tick();
  await tick();
  const sent = s.calls.find(
    (c) => c.url === "/api/training" && c.body?.command === "start",
  );
  assert.deepEqual(sent.body.steps, [{ notes: [60], ticks: 480 }]);
});

test("optional score shows current and upcoming pitches on both staves with independent name labels", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const upcoming = [
    { index: 0, notes: [60, 64, 67], ticks: 480 },
    { index: 1, notes: [43, 59, 61], ticks: 240 },
    { index: 2, notes: [], ticks: 960 },
  ];
  s.deliverTraining({
    state: "playing",
    mode: "song",
    total: 3,
    index: 0,
    upcoming,
  });
  assert.equal(s.d.querySelector("#scorePanel").hidden, true);
  s.d.querySelector("#showScore").click();
  assert.equal(s.d.querySelector("#scorePanel").hidden, false);
  assert.equal(s.d.querySelectorAll(".score-step").length, 3);
  assert.equal(s.d.querySelectorAll(".staff-line").length, 10);
  assert.equal(
    s.d.querySelector('.score-note[data-note="64"]').getAttribute("cy"),
    "110",
  );
  assert.equal(
    s.d.querySelector('.score-note[data-note="60"]').getAttribute("cy"),
    "120",
  );
  assert.equal(
    s.d.querySelector('.score-note[data-note="43"]').getAttribute("cy"),
    "230",
  );
  assert.equal(
    s.d.querySelector('.score-note[data-note="59"]').getAttribute("cy"),
    "185",
  );
  assert.equal(s.d.querySelectorAll(".score-sharp").length, 1);
  assert.match(s.d.querySelector('[data-step="1"]').textContent, /H3/);
  assert.equal(s.d.querySelector(".score-rest").textContent, "Pause");
  assert.equal(s.d.querySelector(".score-step.current").dataset.step, "0");
  assert.match(
    s.d.querySelector("#scoreSummary").textContent,
    /Einsatz 1 von 3: C4 \+ E4 \+ G4/,
  );
  s.d.querySelector("#scoreLabels").click();
  assert.equal(s.d.querySelectorAll(".score-note-name").length, 0);
  assert.doesNotMatch(s.d.querySelector("#scoreSummary").textContent, /C4/);
  assert.ok(s.d.querySelectorAll(".score-note").length > 0);
  assert.equal(s.w.localStorage.getItem("showScore"), "true");
  s.d.querySelector("#showScore").click();
  assert.equal(s.d.querySelector("#scorePanel").hidden, true);
});
test("score advances with device state, keeps paused notes and clears after stop or completion", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  s.d.querySelector("#showScore").click();
  const upcoming = Array.from({ length: 7 }, (_, i) => ({
    index: i,
    notes: [60 + i],
    ticks: 480,
  }));
  s.deliverTraining({
    state: "countin",
    mode: "song",
    total: 7,
    index: 0,
    upcoming,
  });
  assert.equal(s.d.querySelectorAll(".score-step").length, 6);
  s.deliverTraining({
    state: "playing",
    index: 1,
    upcoming: upcoming.slice(1),
  });
  assert.equal(s.d.querySelector(".score-step.current").dataset.step, "1");
  assert.equal(s.d.querySelector('.score-note[data-note="60"]'), null);
  s.deliverTraining({ state: "paused" });
  assert.equal(s.d.querySelector(".score-step.current").dataset.step, "1");
  assert.match(s.d.querySelector("#scoreSummary").textContent, /pausiert/);
  s.deliverTraining({ state: "completed", index: 7, upcoming: [] });
  assert.equal(s.d.querySelector("#scoreViewport svg"), null);
  assert.match(s.d.querySelector("#scoreSummary").textContent, /abgeschlossen/);
  s.deliverTraining({ state: "idle", mode: "free", upcoming });
  assert.equal(s.d.querySelector("#scoreViewport svg"), null);
  assert.match(
    s.d.querySelector("#scoreSummary").textContent,
    /Starte eine Übung/,
  );
});
test("extreme MIDI notes use octave marks while keeping true note names and bounded geometry", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  s.d.querySelector("#showScore").click();
  s.deliverTraining({
    state: "playing",
    total: 1,
    index: 0,
    upcoming: [{ index: 0, notes: [0, 127], ticks: 60 }],
  });
  const heads = [...s.d.querySelectorAll(".score-note")];
  assert.equal(heads.length, 2);
  assert.ok(
    heads.every(
      (n) =>
        Number(n.getAttribute("cy")) >= 40 &&
        Number(n.getAttribute("cy")) <= 250,
    ),
  );
  assert.equal(s.d.querySelectorAll(".score-octave").length, 2);
  assert.match(s.d.querySelector("#scoreSummary").textContent, /C-1 \+ G9/);
});

test("Wi-Fi settings show live IP configuration and a local hostname link", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const panel = s.d.querySelector("#wifiStationInfo");
  assert.match(panel.textContent, /192.168.1.9/);
  assert.match(panel.textContent, /255.255.255.0/);
  assert.match(panel.textContent, /Gateway \/ Router192.168.1.1/);
  assert.match(panel.textContent, /DNS-Server 1192.168.1.1/);
  assert.match(panel.textContent, /DNS-Server 2—/);
  assert.match(panel.textContent, /-51 dBm/);
  assert.match(panel.textContent, /DHCP/);
  assert.equal(s.d.querySelector("#hostname").value, "midi-trainer");
  assert.equal(s.d.querySelector("#mdnsAddress").hidden, false);
  assert.equal(
    s.d.querySelector("#mdnsAddressLink").href,
    "http://midi-trainer.local/",
  );
  assert.match(s.d.querySelector("#wifiApInfo").textContent, /Ausgeschaltet/);
});
test("hostname changes send only the normalized name and show restart instructions", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const input = s.d.querySelector("#hostname");
  input.value = "Piano-2";
  input.dispatchEvent(new s.w.Event("input"));
  assert.equal(
    s.d.querySelector("#hostnamePreview").textContent,
    "http://piano-2.local/",
  );
  const live = await (await s.w.fetch("/api/status", {})).json();
  s.w.receiveNetworkSnapshot(live);
  assert.equal(input.value, "Piano-2");
  s.d
    .querySelector("#hostnameForm")
    .dispatchEvent(
      new s.w.Event("submit", { bubbles: true, cancelable: true }),
    );
  await tick();
  await tick();
  const sent = s.calls.find((c) => c.url === "/api/network");
  assert.deepEqual(sent.body, { hostname: "piano-2" });
  assert.equal(sent.options.headers["X-Trainer"], "1");
  assert.match(s.d.querySelector("#hostnameResult").textContent, /startet neu/);
  assert.match(
    s.d.querySelector("#hostnameResult").textContent,
    /piano-2.local/,
  );
});
test("offline Wi-Fi hides stale router addresses while showing the setup IP", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const live = await (await s.w.fetch("/api/status", {})).json();
  s.w.receiveNetworkSnapshot({
    ...live,
    connected: false,
    ap: true,
    mdns: false,
    wifiState: "Einrichtung verfügbar",
  });
  assert.doesNotMatch(
    s.d.querySelector("#wifiStationInfo").textContent,
    /192.168.1.9|192.168.1.1|255.255.255.0/,
  );
  assert.match(s.d.querySelector("#wifiApInfo").textContent, /192.168.4.1/);
  assert.equal(s.d.querySelector("#mdnsAddress").hidden, true);
  assert.equal(s.d.querySelector("#wifiAddress").hidden, true);
});

test("Nextcloud settings persist one fixed directory and clear entered credentials from the form", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  s.d.querySelector("#cloudFolder").value =
    "https://cloud.example/remote.php/dav/files/user/My MIDI";
  s.d.querySelector("#cloudUser").value = "user";
  s.d.querySelector("#cloudPassword").value = "test-app-password";
  s.d
    .querySelector("#cloudSettingsForm")
    .dispatchEvent(
      new s.w.Event("submit", { bubbles: true, cancelable: true }),
    );
  await tick();
  await tick();
  const sent = s.calls.find((c) => c.url === "/api/library/config" && c.body);
  assert.equal(
    sent.body.folder,
    "https://cloud.example/remote.php/dav/files/user/My%20MIDI/",
  );
  assert.equal(sent.body.password, "test-app-password");
  assert.equal(s.d.querySelector("#cloudPassword").value, "");
  assert.match(
    s.d.querySelector("#cloudPasswordHint").textContent,
    /gespeichert/,
  );
  assert.match(
    s.d.querySelector("#cloudSettingsResult").textContent,
    /Gespeichert/,
  );
});
test("configured Nextcloud files load on training entry and use the shared MIDI importer", async (t) => {
  const s = await setup({
    folder: "https://cloud.example/dav/MIDI/",
    user: "user",
    hasPassword: true,
    hasCa: false,
  });
  t.after(() => s.w.close());
  const jobs = [];
  s.w.MidiLibrary.Client.prototype.run = async function (request) {
    jobs.push(request);
    if (request.action === "list")
      return new TextEncoder().encode(
        '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/MIDI/Test%20%3Csong%3E.mid</d:href><d:propstat><d:prop><d:getcontentlength>35</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>',
      );
    return Uint8Array.from([
      77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, 0, 0,
      0, 13, 0, 144, 60, 100, 131, 96, 128, 60, 0, 0, 255, 47, 0,
    ]);
  };
  s.w.location.hash = "training";
  s.w.dispatchEvent(new s.w.HashChangeEvent("hashchange"));
  await tick();
  await tick();
  assert.equal(jobs.filter((j) => j.action === "list").length, 1);
  assert.match(s.d.querySelector("#cloudFiles").textContent, /Test <song>.mid/);
  assert.equal(s.d.querySelector("#cloudFiles song"), null);
  s.d.querySelector("#cloudFiles button").click();
  await tick();
  await tick();
  assert.equal(jobs[1].name, "Test <song>.mid");
  assert.equal(s.d.querySelector("#trainingPreset").value, "custom");
  assert.match(
    s.d.querySelector("#importResult").textContent,
    /Test <song>.mid: 1 Einsätze/,
  );
  assert.equal(s.d.querySelector("#libraryCancel").hidden, true);
});
test("MIDIsss search renders escaped metadata and downloads using the selected numeric id", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  const jobs = [];
  s.w.MidiLibrary.Client.prototype.run = async function (request) {
    jobs.push(request);
    if (request.action === "search")
      return new TextEncoder().encode(
        JSON.stringify([
          { id: 5, name: "<img src=x>", notes: "Piano", average_rating: 4.5 },
        ]),
      );
    throw Error("Test-Datei fehlt");
  };
  s.d.querySelector("#midiSearch").value = "Metallica";
  s.d
    .querySelector("#midiSearchForm")
    .dispatchEvent(
      new s.w.Event("submit", { bubbles: true, cancelable: true }),
    );
  await tick();
  await tick();
  assert.equal(jobs[0].query, "Metallica");
  assert.equal(s.d.querySelector("#searchFiles img"), null);
  assert.match(s.d.querySelector("#searchFiles").textContent, /Bewertung: 4.5/);
  s.d.querySelector("#searchFiles button").click();
  await tick();
  await tick();
  assert.equal(jobs[1].id, 5);
  assert.match(
    s.d.querySelector("#libraryStatus").textContent,
    /Test-Datei fehlt/,
  );
  assert.equal(s.d.querySelector("#midiSearchForm button").disabled, false);
});

test("listening coalesces duplicate pitches, releases LEDs on pause and never sends training attempts", async () => {
  const { w, d, calls, dom } = await setup();
  w.receivePlaybackSnapshot({
    state: "playing",
    position: 0,
    duration: 5,
    notes: [
      { note: 60, velocity: 80 },
      { note: 60, velocity: 100 },
      { note: 64, velocity: 90 },
    ],
  });
  await tick();
  await tick();
  const frames = () => calls.filter((c) => c.url === "/api/playback");
  assert.deepEqual(frames().at(-1).body, {
    active: true,
    notes: [
      { note: 60, velocity: 100 },
      { note: 64, velocity: 90 },
    ],
  });
  assert.equal(d.querySelector("#pauseMidi").hidden, false);
  const before = frames().length;
  w.receivePlaybackSnapshot({
    state: "playing",
    position: 0.1,
    duration: 5,
    notes: [
      { note: 60, velocity: 100 },
      { note: 64, velocity: 90 },
    ],
  });
  await tick();
  assert.equal(frames().length, before);
  w.receivePlaybackSnapshot({
    state: "paused",
    position: 0.1,
    duration: 5,
    notes: [],
  });
  await tick();
  await tick();
  assert.deepEqual(frames().at(-1).body, { active: false });
  assert.equal(
    calls.some((c) => c.url === "/api/midi" && c.body?.type === "on"),
    false,
  );
  dom.window.close();
});

test("file listening survives window blur and backgrounding pauses at the current position with a reason", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  s.w.location.hash = "training";
  await tick();
  await tick();
  const player = s.w.testMidiPlayer;
  player.Audio = class {};
  player.context = { state: "running", currentTime: 7 };
  player.started = 0;
  player.performance = { duration: 120, notes: [] };
  player.state = "playing";
  player.position = 7;
  s.w.receivePlaybackSnapshot({
    state: "playing",
    position: 7,
    duration: 120,
    notes: [{ note: 60, velocity: 100 }],
  });
  s.w.dispatchEvent(new s.w.Event("blur"));
  assert.equal(player.state, "playing");
  assert.equal(player.position, 7);
  Object.defineProperty(s.d, "hidden", { configurable: true, value: true });
  s.d.dispatchEvent(new s.w.Event("visibilitychange"));
  assert.equal(player.state, "paused");
  assert.equal(player.position, 7);
  assert.match(
    s.d.querySelector("#midiPlaybackStatus").textContent,
    /Pausiert.*0:07.*Hintergrund/,
  );
  await tick();
  await tick();
  assert.deepEqual(
    s.calls.filter((c) => c.url === "/api/playback").at(-1).body,
    { active: false },
  );
  Object.defineProperty(s.d, "hidden", { configurable: true, value: false });
  s.d.dispatchEvent(new s.w.Event("visibilitychange"));
  s.d.querySelector("#pauseMidi").click();
  await tick();
  await tick();
  assert.equal(player.state, "playing");
  assert.equal(player.position, 7);
  s.d.querySelector("#stopMidi").click();
  assert.equal(player.state, "stopped");
  assert.match(
    s.d.querySelector("#midiPlaybackStatus").textContent,
    /Stopp gedrückt/,
  );
});

test("virtual keys and MIDI listening use local piano samples without downloading the pack twice", async (t) => {
  const s = await setup();
  t.after(() => s.w.close());
  s.w.location.hash = "training";
  await tick();
  await tick();
  Object.defineProperty(s.d, "hidden", { configurable: true, value: false });
  const sources = [];
  s.w.AudioContext = class {
    state = "running";
    currentTime = 0;
    destination = {};
    resume() {
      return Promise.resolve();
    }
    decodeAudioData() {
      return Promise.resolve({ duration: 3 });
    }
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          cancelScheduledValues() {},
          setTargetAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
    createBiquadFilter() {
      return { frequency: {}, Q: {}, connect() {}, disconnect() {} };
    }
    createBufferSource() {
      const source = {
        playbackRate: {},
        stops: [],
        connect() {},
        disconnect() {},
        start() {},
        stop(t) {
          this.stops.push(t);
        },
      };
      sources.push(source);
      return source;
    }
  };
  s.d.querySelector("#soundEnabled").click();
  await tick();
  await tick();
  assert.equal(s.d.querySelector("#soundStatus").textContent, "Klavier bereit");
  const key = s.d.querySelector('.key[data-note-value="60"]');
  pointer(s.w, key, "pointerdown", 30);
  pointer(s.w, key, "pointerup", 30);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].playbackRate.value, 1);
  assert.equal(sources[0].stops.at(-1), 0.15);
  s.w.MidiFile.parse = () => ({
    duration: 5,
    notes: [{ note: 60, velocity: 100, time: 0, duration: 1 }],
  });
  Object.defineProperty(s.d.querySelector("#midiFile"), "files", {
    value: [{ name: "test.mid", arrayBuffer: async () => new ArrayBuffer(0) }],
  });
  s.d.querySelector("#listenMidi").click();
  await tick();
  await tick();
  assert.equal(sources.length, 2);
  assert.match(
    s.d.querySelector("#midiPlaybackStatus").textContent,
    /Spielt.*Klavier-Samples/,
  );
  assert.equal(s.calls.filter((c) => c.url === "/piano-samples.bin").length, 1);
  s.d.querySelector("#stopMidi").click();
});
