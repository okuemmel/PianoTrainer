const { test } = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const { Store } = require("../data/midi-favorites.js");
const midi = (size = 26) => {
  const data = new ArrayBuffer(size);
  new Uint8Array(data).set(
    [
      77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, 0, 0,
      0, 4, 0, 255, 47, 0,
    ].slice(0, size),
  );
  return data;
};
test("favorites survive reopening, preserve exact bytes, replace without duplicates and remove atomically", async () => {
  const factory = new IDBFactory(),
    a = new Store(factory);
  await a.save("source:1", "song.mid", midi());
  const b = new Store(factory);
  const record = await b.get("source:1");
  assert.deepEqual(new Uint8Array(record.bytes), new Uint8Array(midi()));
  const list = await b.list();
  assert.equal(list.length, 1);
  assert.equal(Object.hasOwn(list[0], "bytes"), false);
  await b.save("source:1", "updated.mid", midi(27));
  assert.equal((await a.list()).length, 1);
  assert.equal((await a.get("source:1")).bytes.byteLength, 27);
  await b.remove("source:1");
  assert.equal(await a.get("source:1"), null);
  assert.deepEqual(await a.list(), []);
});
test("favorites reject invalid payloads and unavailable storage; concurrent writes respect the 32-file limit", async () => {
  const store = new Store(new IDBFactory());
  for (const bytes of [new ArrayBuffer(10), new ArrayBuffer(26), midi(2097153)])
    await assert.rejects(store.save("id", "bad.mid", bytes), /Ungültige/);
  await assert.rejects(new Store(null).list(), /nicht verfügbar/);
  await assert.rejects(
    new Store({
      open() {
        throw Error("denied");
      },
    }).list(),
    /nicht verfügbar/,
  );
  const saved = await Promise.allSettled(
    Array.from({ length: 33 }, (_, i) =>
      store.save(String(i), "song.mid", midi()),
    ),
  );
  assert.equal(saved.filter((r) => r.status === "fulfilled").length, 32);
  assert.equal((await store.list()).length, 32);
  await store.save("0", "replacement.mid", midi());
  await store.remove("1");
  await store.save("new", "new.mid", midi());
  assert.equal((await store.list()).length, 32);
});
test("favorites enforce the total byte budget without losing previously committed files", async () => {
  const store = new Store(new IDBFactory()),
    bytes = midi(2097152);
  for (let i = 0; i < 16; i++) await store.save(String(i), "large.mid", bytes);
  await assert.rejects(store.save("overflow", "small.mid", midi()), /voll/);
  assert.equal((await store.list()).length, 16);
  assert.equal((await store.get("0")).bytes.byteLength, 2097152);
});
