/* Local gettext-style catalogs. Message keys are the original German text. */
(function (root) {
  "use strict";
  const bindings = new WeakMap();
  const catalogs = new Map();
  let language = "de",
    request = 0;
  let languages = [
    { code: "de", name: "Deutsch" },
    { code: "en", name: "English" },
  ];
  const normalize = (value) => value.replace(/\s+/g, " ").trim();
  const owns = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key);
  function t(value) {
    if (typeof value !== "string") return value;
    const catalog = catalogs.get(language);
    if (!catalog) return value;
    const key = normalize(value);
    let result = owns(catalog.messages, key)
      ? catalog.messages[key]
      : undefined;
    if (result === undefined && owns(catalogs.get("de")?.messages || {}, key))
      result = catalogs.get("de").messages[key];
    if (result === undefined) {
      for (const prefix of catalog.prefixes || []) {
        if (value.startsWith(prefix.source)) {
          result = prefix.target + value.slice(prefix.source.length);
          return result;
        }
      }
      return value;
    }
    return (
      (value.match(/^\s*/)?.[0] || "") +
      result +
      (value.match(/\s*$/)?.[0] || "")
    );
  }
  function bind(node, key, source) {
    let values = bindings.get(node);
    if (!values) bindings.set(node, (values = new Map()));
    const update = () => {
      const raw = typeof source === "function" ? source() : source;
      // Dynamic expressions translate their own UI fragments, keeping filenames and SSIDs intact.
      const value = String((typeof source === "function" ? raw : t(raw)) ?? "");
      if (key === "text") node.textContent = value;
      else if (key === "node") node.nodeValue = value;
      else node.setAttribute(key, value);
    };
    values.set(key, update);
    update();
  }
  function text(node, source) {
    // Own only this text node: labels may also contain live form controls.
    const content = node.ownerDocument.createTextNode("");
    node.replaceChildren(content);
    bind(content, "node", source);
  }
  function attr(node, key, source) {
    bind(node, key, source);
  }
  function bindDocument() {
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_TEXT,
    );
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest("script,style")) continue;
      if (normalize(node.nodeValue)) bind(node, "node", node.nodeValue);
    }
    for (const el of document.querySelectorAll("*"))
      for (const key of ["title", "aria-label", "placeholder"])
        if (el.hasAttribute(key)) attr(el, key, el.getAttribute(key));
  }
  function refresh() {
    document.documentElement.lang = language;
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_ALL,
    );
    const nodes = [document.documentElement];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes)
      if (node.isConnected) bindings.get(node)?.forEach((update) => update());
    const select = document.getElementById("languageSelect");
    if (select) select.value = language;
    root.dispatchEvent(
      new CustomEvent("languagechange", { detail: { language } }),
    );
  }
  async function json(path) {
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-cache",
    });
    if (!response.ok)
      throw Error("Language file unavailable / Sprachdatei nicht verfügbar.");
    return response.json();
  }
  async function setLanguage(code) {
    const attempt = ++request;
    if (!languages.some((entry) => entry.code === code))
      throw Error("Unknown language / Unbekannte Sprache.");
    if (!catalogs.has(code)) {
      const catalog = await json("/i18n/" + code + ".json");
      if (
        catalog.language !== code ||
        !catalog.messages ||
        typeof catalog.messages !== "object" ||
        Array.isArray(catalog.messages) ||
        Object.values(catalog.messages).some(
          (value) => typeof value !== "string",
        ) ||
        (catalog.prefixes !== undefined &&
          (!Array.isArray(catalog.prefixes) ||
            catalog.prefixes.length > 100 ||
            catalog.prefixes.some(
              (prefix) =>
                !prefix ||
                typeof prefix.source !== "string" ||
                typeof prefix.target !== "string",
            )))
      )
        throw Error("Invalid language file / Ungültige Sprachdatei.");
      if (attempt !== request) return;
      catalogs.set(code, catalog);
    }
    if (attempt !== request) return;
    language = code;
    try {
      localStorage.setItem("language", code);
    } catch {}
    refresh();
  }
  bindDocument();
  const ready = (async () => {
    try {
      const manifest = await json("/i18n/languages.json");
      if (
        !Array.isArray(manifest) ||
        !manifest.length ||
        manifest.length > 32 ||
        manifest.some(
          (entry) =>
            !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(entry.code) ||
            typeof entry.name !== "string",
        )
      )
        throw Error("Invalid language list");
      languages = manifest;
      const select = document.getElementById("languageSelect");
      if (select) {
        select.replaceChildren(
          ...languages.map((entry) => {
            const option = document.createElement("option");
            option.value = entry.code;
            option.textContent = entry.name;
            return option;
          }),
        );
      }
      let preferred = "de";
      try {
        preferred = localStorage.getItem("language") || "de";
      } catch {}
      await setLanguage("de");
      await setLanguage(
        languages.some((entry) => entry.code === preferred) ? preferred : "de",
      );
    } catch (error) {
      const status = document.getElementById("languageStatus");
      if (status) status.textContent = error.message;
    }
  })();
  root.I18n = {
    t,
    text,
    attr,
    ready,
    setLanguage,
    get language() {
      return language;
    },
    get locale() {
      return language === "de" ? "de-DE" : language;
    },
  };
})(window);
