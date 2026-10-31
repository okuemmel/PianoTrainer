const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Bank, unpack, sampleVoice } = require("../data/piano-audio.js");
const bytes = () =>
  Uint8Array.from(fs.readFileSync("data/piano-samples.bin")).buffer;

test("local piano pack validates ranges, decodes once per audio context and retries failed loads", async () => {
  const data = bytes();
  const encoded = unpack(data);
  assert.equal(encoded.size, 16);
  assert.ok(encoded.has(21) && encoded.has(60) && encoded.has(108));
  assert.throws(() => unpack(data.slice(0, 50)), /Klangpaket/);
  const corrupt = data.slice(0);
  new DataView(corrupt).setUint32(4, 0xffffffff, true);
  assert.throws(() => unpack(corrupt), /Index/);
  let fetched = 0,
    decoded = 0;
  const bank = new Bank(async (path) => {
    assert.equal(path, "/piano-samples.bin");
    fetched++;
    return { ok: true, arrayBuffer: async () => bytes() };
  });
  const context = {
    async decodeAudioData(audio) {
      decoded++;
      assert.ok(audio.byteLength > 1000);
      return { duration: 3 };
    },
  };
  const [a, b] = await Promise.all([
    bank.prepare(context),
    bank.prepare(context),
  ]);
  assert.equal(a, b);
  assert.equal(decoded, 16);
  assert.equal(fetched, 1);
  await bank.prepare({ decodeAudioData: context.decodeAudioData });
  assert.equal(decoded, 32);
  assert.equal(fetched, 1);
  let attempts = 0;
  const retry = new Bank(async () => {
    if (++attempts === 1) throw Error("offline");
    return { ok: true, arrayBuffer: async () => bytes() };
  });
  await assert.rejects(retry.prepare(context), /offline/);
  assert.equal((await retry.prepare(context)).size, 16);
});

test("sample voices transpose from the nearest piano note and use velocity-dependent tone and gentle release", () => {
  const sources = [],
    filters = [],
    envelopes = [];
  const context = {
    createBufferSource() {
      const node = {
        playbackRate: {},
        connect() {},
        disconnect() {},
        start(t) {
          this.startAt = t;
        },
        stop(t) {
          this.stopAt = t;
        },
      };
      sources.push(node);
      return node;
    },
    createBiquadFilter() {
      const node = { frequency: {}, Q: {}, connect() {}, disconnect() {} };
      filters.push(node);
      return node;
    },
    createGain() {
      const values = [];
      envelopes.push(values);
      return {
        gain: {
          setValueAtTime(v, t) {
            values.push([v, t]);
          },
          linearRampToValueAtTime(v, t) {
            values.push([v, t]);
          },
        },
        connect() {},
        disconnect() {},
      };
    },
  };
  let ended = 0;
  const samples = new Map([
    [60, { duration: 3 }],
    [72, { duration: 3 }],
  ]);
  const soft = sampleVoice(context, {}, samples, 62, 40, 1, 2, () => ended++);
  assert.equal(soft.note, 62);
  assert.ok(
    Math.abs(sources[0].playbackRate.value - Math.pow(2, 2 / 12)) < 1e-9,
  );
  assert.equal(sources[0].startAt, 1);
  assert.equal(sources[0].stopAt, 2.12);
  sampleVoice(context, {}, samples, 72, 120, 1, 2);
  assert.ok(filters[1].frequency.value > filters[0].frequency.value);
  assert.ok(envelopes[1][1][0] > envelopes[0][1][0]);
  sources[0].onended();
  assert.equal(ended, 1);
  assert.equal(sampleVoice(context, {}, samples, 0, 100, 1, 2), null);
});
