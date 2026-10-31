const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync("data/index.html", "utf8");
const script = fs.readFileSync("data/app.js", "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function setup() {
  const dom = new JSDOM(html, {
    url: "http://192.168.4.1/",
    runScripts: "outside-only",
  });
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
    if (url === "/api/config") {
      if (body) {
        config = body;
        data = { ok: true, training, leds };
      } else data = config;
    }
    if (url === "/api/wifi/scan")
      data = {
        scanning: false,
        networks: [
          { ssid: "<img src=x onerror=alert(1)>", rssi: -55, open: false },
        ],
      };
    return { ok: true, status: 200, json: async () => data };
  };
  dom.window.eval(fs.readFileSync("data/midi-file.js", "utf8"));
  dom.window.eval(script);
  await tick();
  await tick();
  return {
    dom,
    w: dom.window,
    d: dom.window.document,
    calls,
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
  assert.equal(s.d.querySelector("#config").hidden, false);
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
    s.d.querySelector("#keyboard").parentElement.id,
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
  assert.equal(s.d.querySelectorAll(".led-cell").length, 60);
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
  assert.ok(label.includes("C♯4 (61)"));
  assert.ok(
    s.d.querySelector('[data-led="0"]').title.includes("keine MIDI-Zuordnung"),
  );
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
  assert.equal(s.d.querySelectorAll(".led-cell").length, 300);
  assert.equal(s.d.querySelectorAll(".led-cell.lit").length, 1);
  assert.equal(s.d.querySelector('[data-led="299"]').dataset.color, "#00ff00");
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
