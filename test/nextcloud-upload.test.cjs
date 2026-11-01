const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("../data/nextcloud-upload.js");
const bytes = () => Uint8Array.from({ length: 9000 }, (_, i) => i % 251);

test("Nextcloud upload replays a lost acknowledgement, respects backpressure and waits for the remote commit", async () => {
  const payload = bytes(),
    accepted = [],
    seen = [],
    progress = [];
  let lost = true,
    full = true,
    committed = false,
    polls = 0;
  const client = new Client(
    async (path, body) => {
      if (path === "library/job") {
        assert.deepEqual(body, {
          source: "nextcloud",
          action: "save",
          name: "song.mid",
          size: 9000,
        });
        return { id: 4 };
      }
      if (path === "library/upload") {
        seen.push(body.offset);
        const chunk = Buffer.from(body.data, "base64");
        assert.deepEqual(
          chunk,
          Buffer.from(
            payload.subarray(body.offset, body.offset + chunk.length),
          ),
        );
        if (body.offset === 0 && full) {
          full = false;
          return { accepted: false };
        }
        if (!accepted.includes(body.offset)) accepted.push(body.offset);
        if (body.offset === 4096 && lost) {
          lost = false;
          throw Error("response lost");
        }
        return { accepted: true };
      }
      if (path.startsWith("library/job?")) {
        const done = accepted.includes(8192);
        if (done && ++polls >= 2) committed = true;
        return {
          id: 4,
          upload: true,
          running: !committed,
          received: done ? 9000 : 8192,
          accepted: done ? 9000 : 8192,
        };
      }
      throw Error("unexpected call " + path);
    },
    async () => {},
  );
  await client.run("song.mid", payload, (n) => {
    if (n === 100) assert.equal(committed, true);
    progress.push(n);
  });
  assert.deepEqual(accepted, [0, 4096, 8192]);
  assert.deepEqual(seen, [0, 0, 4096, 4096, 8192]);
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.slice(0, -1).every((n) => n < 100));
  assert.equal(client.current, null);
});

test("Nextcloud upload propagates remote failure and cancellation and requests worker cleanup", async () => {
  const calls = [];
  const client = new Client(
    async (path, body) => {
      calls.push(path);
      if (path === "library/job") return { id: 7 };
      if (path === "library/upload") return { accepted: true };
      if (path.startsWith("library/job?"))
        return {
          upload: true,
          running: false,
          received: 9000,
          accepted: 9000,
          error: "destination exists",
        };
      if (path === "library/cancel") return { ok: true };
    },
    async () => {},
  );
  await assert.rejects(client.run("song.mid", bytes()), /destination exists/);
  assert.ok(calls.includes("library/cancel"));
  const cancelled = new Client(
    async (path) => {
      if (path === "library/job") {
        await cancelled.cancel();
        return { id: 8 };
      }
      assert.equal(path, "library/cancel");
      return { ok: true };
    },
    async () => {},
  );
  await assert.rejects(cancelled.run("song.mid", bytes()), /abgebrochen/);
  assert.equal(cancelled.current, null);
});
