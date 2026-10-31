const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const {
  parseDav,
  parseSearch,
  parseCollection,
  Client,
  midiName,
} = require("../data/library.js");
const parser = new JSDOM("").window.DOMParser;
const entry = (
  href,
  props = "<d:getcontentlength>100</d:getcontentlength>",
  status = 200,
) =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 ${status} OK</d:status></d:propstat></d:response>`;
const dav = (items) => `<d:multistatus xmlns:d="DAV:">${items}</d:multistatus>`;
test("MIDICollection extracts bounded public paths and paging without trusting external links", () => {
  const row = (id, path) =>
    `<tr data-midi-id="${id}" data-title="A &amp; B" data-artist="Piano"><td><button class="midi-play-btn" data-url="${path}"></button></td></tr>`;
  const result = parseCollection(
    `<div class="results-wrap" data-page="2" data-total-pages="7"><table>${row(12, "/midi/MIDI/song.mid")}${row(12, "/midi/duplicate.mid")}${row(13, "https://evil.example/midi/song.mid")}${row(14, "/midi/%252e%252e/secret.mid")}${row(15, "/midi/song.mid?token=1")}</table></div>`,
    parser,
  );
  assert.equal(result.page, 2);
  assert.equal(result.pages, 7);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, "A & B");
  assert.equal(result.files[0].path, "/midi/MIDI/song.mid");
  assert.throws(
    () => parseCollection("<p>Maintenance</p>", parser),
    /Suchformat/,
  );
  assert.deepEqual(
    parseCollection(
      '<div class="results-wrap" data-page="1" data-total-pages="0"></div>',
      parser,
    ),
    { files: [], page: 1, pages: 1 },
  );
});
test("WebDAV lists only direct MIDI children and decodes names without trusting remote links", () => {
  const xml = dav(
    entry("/dav/MIDI/", "<d:resourcetype><d:collection/></d:resourcetype>") +
      entry("/dav/MIDI/My%20Song.MID") +
      entry("/dav/MIDI/My%20Song.MID") +
      entry("/dav/MIDI/a.midi") +
      entry("/dav/MIDI/folder/file.mid") +
      entry("/dav/secret.mid") +
      entry("https://other.example/dav/MIDI/evil.mid") +
      entry("/dav/MIDI/no.mid", "", 404) +
      entry("/dav/MIDI/readme.txt") +
      entry("/dav/MIDI/%2fescape.mid"),
  );
  const result = parseDav(xml, "https://cloud.example/dav/MIDI/", parser);
  assert.deepEqual(
    result.files.map((f) => f.name),
    ["a.midi", "My Song.MID"],
  );
  assert.equal(result.files[1].size, 100);
  assert.throws(
    () => parseDav("<html>error</html>", "https://cloud.example/dav/", parser),
    /WebDAV/,
  );
  assert.throws(
    () => parseDav("<!DOCTYPE x>" + xml, "https://cloud.example/dav/", parser),
    /XML/,
  );
  assert.equal(midiName("../escape.mid"), false);
  assert.equal(midiName("übung.midi"), true);
});
test("MIDIsss results keep valid ids and text, reject error payloads and bound long lists", () => {
  const result = parseSearch(
    JSON.stringify([
      { id: 5, name: "<img src=x>", notes: "Piano", average_rating: "4.5" },
      { id: 5, name: "duplicate" },
      { id: 0, name: "bad" },
      { id: 4294967296, name: "bad" },
    ]),
  );
  assert.deepEqual(result.files, [
    { id: 5, name: "<img src=x>", notes: "Piano", rating: 4.5 },
  ]);
  assert.throws(() => parseSearch('{"error":"not found"}'), /not found/);
  assert.throws(() => parseSearch("not json"), /JSON/);
  assert.equal(
    parseSearch(
      JSON.stringify(
        Array.from({ length: 220 }, (_, i) => ({ id: i + 1, name: "song" })),
      ),
    ).truncated,
    true,
  );
});
test("remote transport replays the same offset after a failed chunk and assembles exact bytes", async () => {
  const requests = [],
    calls = [];
  let delivered = 0,
    failed = false;
  const bytes = Uint8Array.from({ length: 10000 }, (_, i) => i % 251);
  const api = async (path, body) => {
    calls.push({ path, body });
    if (body) return { id: 7 };
    return {
      id: 7,
      running: false,
      received: bytes.length,
      total: bytes.length,
    };
  };
  const client = new Client(
    api,
    async (url, options) => {
      requests.push(url);
      assert.equal(options.headers["X-Trainer"], "1");
      const offset = Number(
        new URL(url, "http://piano.local").searchParams.get("offset"),
      );
      if (!failed) {
        failed = true;
        throw Error("network interrupted");
      }
      assert.equal(offset, delivered);
      const chunk = bytes.slice(offset, offset + 4096);
      delivered += chunk.length;
      return { ok: true, arrayBuffer: async () => chunk.buffer };
    },
    async () => {},
  );
  assert.deepEqual(
    await client.run({ source: "midisss", action: "file", id: 5 }),
    bytes,
  );
  assert.equal(requests[0], requests[1]);
  assert.equal(client.current, null);
});
test("remote transport cancels jobs on malformed or oversized responses and serializes requests", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve)),
    calls = [];
  const client = new Client(
    async (path, body) => {
      calls.push({ path, body });
      if (body && path === "library/job") {
        await gate;
        return { id: 4 };
      }
      return { running: false, received: 2097153 };
    },
    async () => {},
    async () => {},
  );
  const running = client.run({
    source: "nextcloud",
    action: "file",
    name: "x.mid",
  });
  await assert.rejects(
    client.run({ source: "midisss", action: "search", query: "x" }),
    /laufenden/,
  );
  release();
  await assert.rejects(running, /Status/);
  assert.ok(calls.some((c) => c.path === "library/cancel" && c.body.id === 4));
  assert.equal(client.current, null);
});
test("explicit cancellation stops a stalled download and issues the cancellation command", async () => {
  let client;
  client = new Client(
    async (path, body) =>
      body ? { id: 3 } : { running: true, received: 0, total: -1 },
    async () => {},
    async () => {
      await client.cancel();
    },
  );
  await assert.rejects(
    client.run({ source: "midisss", action: "file", id: 1 }),
    /abgebrochen/,
  );
});
