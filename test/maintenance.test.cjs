const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePackage, upload } = require("../data/maintenance.js");
const header = (metadata) =>
  new TextEncoder().encode(JSON.stringify(metadata).padEnd(256, " "));
const base = {
  format: "piano-trainer-update",
  schema: 1,
  target: "esp32c3",
  kind: "firmware",
  size: 1000000,
  md5: "0123456789abcdef0123456789abcdef",
  version: "1.11.0",
};
test("update package rejects wrong target, invalid sizes, hashes, schema and truncated payloads", () => {
  assert.equal(parsePackage(header(base), 1000256).kind, "firmware");
  assert.equal(
    parsePackage(header({ ...base, kind: "web", size: 983040 }), 983296).kind,
    "web",
  );
  for (const override of [
    { target: "esp32s3" },
    { schema: 2 },
    { kind: "bootloader" },
    { size: 0 },
    { size: 1572865 },
    { size: 1.5 },
    { md5: "bad" },
    { format: "other" },
  ])
    assert.throws(() =>
      parsePackage(
        header({ ...base, ...override }),
        { ...base, ...override }.size + 256,
      ),
    );
  assert.throws(() => parsePackage(header({ ...base, kind: "web" }), 1000256));
  assert.throws(() => parsePackage(header(base), 1000255));
  assert.throws(() => parsePackage(new Uint8Array(256), 1000256));
});
test("uploader sends mutation header and multipart file, reports transfer separately from verified success", async () => {
  let instance;
  class XHR {
    constructor() {
      instance = this;
      this.upload = {};
    }
    open(method, path) {
      assert.equal(method, "POST");
      assert.equal(path, "/api/update");
    }
    setRequestHeader(key, value) {
      assert.equal(key, "X-Trainer");
      assert.equal(value, "1");
    }
    send(body) {
      assert.equal(body.get("package").name, "firmware.ptupdate");
    }
  }
  const progress = [];
  const pending = upload(
    new File(["test"], "firmware.ptupdate"),
    (n) => progress.push(n),
    XHR,
  );
  instance.upload.onprogress({
    lengthComputable: true,
    loaded: 100,
    total: 100,
  });
  assert.deepEqual(progress, [99]);
  instance.status = 200;
  instance.responseText = '{"ok":true,"restart":true}';
  instance.onload();
  assert.equal((await pending).restart, true);
  const failed = upload(new File(["test"], "firmware.ptupdate"), () => {}, XHR);
  instance.status = 400;
  instance.responseText = '{"error":"checksum failed"}';
  instance.onload();
  await assert.rejects(failed, /checksum failed/);
  const dropped = upload(
    new File(["test"], "firmware.ptupdate"),
    () => {},
    XHR,
  );
  instance.onerror();
  await assert.rejects(dropped, /Verbindung beim Update unterbrochen/);
});

test("firmware recovery page rejects a firmware package and waits for web update verification", async (t) => {
  const fs = require("node:fs"),
    { JSDOM } = require("jsdom");
  const source = fs.readFileSync("src/MaintenanceRoutes.cpp", "utf8");
  const html = source.match(/R"html\(([\s\S]*?)\)html"/)[1];
  const dom = new JSDOM(html, {
    url: "http://piano.local/recovery",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const w = dom.window,
    d = w.document;
  let request,
    kind = "firmware";
  w.XMLHttpRequest = class {
    constructor() {
      request = this;
      this.upload = {};
    }
    open(method, path) {
      assert.equal(method, "POST");
      assert.equal(path, "/api/update");
    }
    setRequestHeader(key, value) {
      assert.equal(key, "X-Trainer");
      assert.equal(value, "1");
    }
    send() {}
  };
  Object.defineProperty(d.querySelector("#file"), "files", {
    value: [{ slice: () => ({ text: async () => JSON.stringify({ kind }) }) }],
  });
  w.eval(d.querySelector("script").textContent);
  const submit = async () => {
    d.querySelector("form").dispatchEvent(
      new w.Event("submit", { cancelable: true }),
    );
    await new Promise((r) => setImmediate(r));
  };
  await submit();
  assert.equal(request, undefined);
  assert.match(d.querySelector("#status").textContent, /Web package required/);
  kind = "web";
  await submit();
  assert.ok(request);
  assert.equal(d.querySelector("#send").disabled, true);
  request.upload.onprogress({
    lengthComputable: true,
    loaded: 100,
    total: 100,
  });
  assert.equal(d.querySelector("#progress").value, 99);
  request.status = 200;
  request.responseText = '{"ok":true}';
  request.onload();
  assert.equal(d.querySelector("#progress").value, 100);
  assert.equal(d.querySelector("#send").disabled, false);
  assert.match(d.querySelector("#status").textContent, /Success/);
});
