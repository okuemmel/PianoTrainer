const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const read = (name) =>
  JSON.parse(fs.readFileSync("data/i18n/" + name + ".json", "utf8"));
const normalize = (value) => value.replace(/\s+/g, " ").trim();
async function setup(t, manifest = read("languages")) {
  const dom = new JSDOM(
    '<html lang="de"><body><select id="languageSelect"></select><p id="languageStatus"></p><h1>Übersicht</h1><input value="Mein WLAN" placeholder="Titel, Künstler oder Stichwort"><span id="dynamic"></span></body></html>',
    { url: "http://trainer.local", runScripts: "outside-only" },
  );
  t.after(() => dom.window.close());
  const calls = [];
  dom.window.fetch = async (path) => {
    calls.push(path);
    return {
      ok: true,
      json: async () =>
        path.endsWith("languages.json")
          ? manifest
          : read(path.split("/").pop().replace(".json", "")),
    };
  };
  dom.window.eval(fs.readFileSync("data/i18n.js", "utf8"));
  await dom.window.I18n.ready;
  return { w: dom.window, d: dom.window.document, calls };
}
test("German and English catalogs cover static UI, lesson text and preset titles with identical keys", () => {
  const de = read("de").messages,
    en = read("en").messages;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
  for (const [key, value] of Object.entries(en))
    assert.ok(typeof value === "string" && value.length, key);
  const dom = new JSDOM(fs.readFileSync("data/index.html", "utf8")),
    d = dom.window.document;
  const w = d.createTreeWalker(d.documentElement, 4);
  while (w.nextNode()) {
    const value = normalize(w.currentNode.nodeValue);
    if (
      /[a-zA-ZäöüÄÖÜß]/.test(value) &&
      !w.currentNode.parentElement.closest("script,style")
    )
      assert.ok(Object.hasOwn(de, value), "Missing static text: " + value);
  }
  for (const el of d.querySelectorAll("*"))
    for (const name of ["title", "aria-label", "placeholder"])
      if (el.hasAttribute(name))
        assert.ok(
          Object.hasOwn(en, normalize(el.getAttribute(name))),
          el.getAttribute(name),
        );
  for (const file of ["include/LessonCatalog.h", "include/TrainingCatalog.h"]) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(
      /"(?:[^"\\]|\\.)*"(?:\s*"(?:[^"\\]|\\.)*")*/g,
    )) {
      const value = normalize(
        [...match[0].matchAll(/"(?:[^"\\]|\\.)*"/g)]
          .map((s) => JSON.parse(s[0]))
          .join(""),
      );
      if (
        (/[äöüÄÖÜß ]/.test(value) || /^[A-Z][a-z]/.test(value)) &&
        !value.endsWith(".h")
      )
        assert.ok(Object.hasOwn(en, value), "Missing course message: " + value);
    }
  }
  for (const file of [
    "app.js",
    "midi-file.js",
    "midi-player.js",
    "falling-notes.js",
    "piano-audio.js",
    "library.js",
    "midi-favorites.js",
    "nextcloud-upload.js",
    "maintenance.js",
  ]) {
    const source = fs.readFileSync("data/" + file, "utf8");
    for (const match of source.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
      const value = normalize(JSON.parse(match[0]));
      if (/[äöüÄÖÜß]/.test(value))
        assert.ok(
          Object.hasOwn(en, value),
          "Missing dynamic message: " + value,
        );
    }
  }
  dom.window.close();
});
test("failed or invalid language loads preserve current language and render text without HTML interpretation", async (t) => {
  const s = await setup(t);
  await s.w.I18n.setLanguage("en");
  assert.equal(s.d.querySelector("h1").textContent, "Overview");
  assert.equal(
    s.d.querySelector("input").placeholder,
    "Title, artist or keyword",
  );
  s.w.I18n.text(
    s.d.querySelector("#dynamic"),
    () => "<img src=x onerror=alert(1)>",
  );
  assert.equal(s.d.querySelector("#dynamic img"), null);
  s.w.fetch = async () => ({ ok: false });
  // Force a newly advertised language; de/en already loaded remain switchable offline.
  await s.w.I18n.setLanguage("de");
  await s.w.I18n.setLanguage("en");
  await assert.rejects(s.w.I18n.setLanguage("../secret"), /Unknown language/);
  assert.equal(s.d.documentElement.lang, "en");
  assert.equal(s.d.querySelector("input").value, "Mein WLAN");
  assert.equal(s.w.I18n.t("toString"), "toString");
});
test("a language advertised in the manifest uses the same loader and falls back to German for missing keys", async (t) => {
  const s = await setup(t, [
    ...read("languages"),
    { code: "fr", name: "Français" },
  ]);
  s.w.fetch = async () => ({
    ok: true,
    json: async () => ({
      language: "fr",
      messages: { Übersicht: "Vue d’ensemble" },
    }),
  });
  await s.w.I18n.setLanguage("fr");
  assert.equal(s.d.documentElement.lang, "fr");
  assert.equal(s.d.querySelector("h1").textContent, "Vue d’ensemble");
  assert.equal(s.w.I18n.t("score.rest"), "Pause");
  assert.equal(s.w.I18n.t("Noch nicht übersetzt"), "Noch nicht übersetzt");
  assert.equal(s.d.querySelector("input").value, "Mein WLAN");
});
test("the latest language choice wins and a broken catalog can be retried", async (t) => {
  const s = await setup(t);
  let resolve;
  s.w.fetch = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = s.w.I18n.setLanguage("en");
  await s.w.I18n.setLanguage("de");
  resolve({ ok: true, json: async () => read("en") });
  await pending;
  assert.equal(s.d.documentElement.lang, "de");
  s.w.fetch = async () => ({ ok: false });
  await assert.rejects(s.w.I18n.setLanguage("en"), /Language file unavailable/);
  assert.equal(s.d.documentElement.lang, "de");
  s.w.fetch = async () => ({
    ok: true,
    json: async () => ({ language: "en", messages: { Übersicht: 12 } }),
  });
  await assert.rejects(s.w.I18n.setLanguage("en"), /Invalid language file/);
  s.w.fetch = async () => ({ ok: true, json: async () => read("en") });
  await s.w.I18n.setLanguage("en");
  assert.equal(s.d.querySelector("h1").textContent, "Overview");
});
