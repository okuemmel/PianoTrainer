/* Remote MIDI library parsing and bounded same-origin download transport. */
(function (root) {
  "use strict";
  const midiName = (name) =>
    typeof name === "string" &&
    name.length <= 255 &&
    !/[\\/\x00-\x1f]/.test(name) &&
    /.+\.midi?$/i.test(name);
  function parseDav(xml, folder, Parser = root.DOMParser) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw Error("Nicht unterstützte XML-Deklaration.");
    const doc = new Parser().parseFromString(xml, "application/xml");
    if (
      doc.getElementsByTagName("parsererror").length ||
      !doc.getElementsByTagNameNS("DAV:", "multistatus").length
    )
      throw Error("Nextcloud liefert keine gültige WebDAV-Verzeichnisliste.");
    const base = new URL(folder.endsWith("/") ? folder : folder + "/");
    const files = new Map();
    for (const response of doc.getElementsByTagNameNS("DAV:", "response")) {
      const href = response.getElementsByTagNameNS("DAV:", "href")[0]
        ?.textContent;
      if (!href) continue;
      const props = [
        ...response.getElementsByTagNameNS("DAV:", "propstat"),
      ].filter((p) =>
        /\s200(?:\s|$)/.test(
          p.getElementsByTagNameNS("DAV:", "status")[0]?.textContent || "",
        ),
      );
      if (
        !props.length ||
        props.some((p) => p.getElementsByTagNameNS("DAV:", "collection").length)
      )
        continue;
      try {
        const url = new URL(href, base);
        if (
          url.origin !== base.origin ||
          url.search ||
          url.hash ||
          !url.pathname.startsWith(base.pathname)
        )
          continue;
        const relative = url.pathname.slice(base.pathname.length);
        if (!relative || relative.includes("/")) continue;
        const name = decodeURIComponent(relative);
        if (!midiName(name)) continue;
        const raw = props.flatMap((p) => [
          ...p.getElementsByTagNameNS("DAV:", "getcontentlength"),
        ])[0]?.textContent;
        const size = raw && /^\d+$/.test(raw.trim()) ? Number(raw) : null;
        files.set(name, { name, size });
      } catch {
        /* Ignore entries outside the configured directory or invalid encodings. */
      }
    }
    const sorted = [...files.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return { files: sorted.slice(0, 1000), truncated: sorted.length > 1000 };
  }
  function parseSearch(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw Error("MIDIsss liefert kein gültiges JSON.");
    }
    if (!Array.isArray(data))
      throw Error(
        typeof data.error === "string"
          ? data.error
          : "Ungültige MIDIsss-Suchergebnisse.",
      );
    const files = [],
      ids = new Set();
    for (const item of data) {
      const id = Number(item?.id);
      if (
        !Number.isInteger(id) ||
        id < 1 ||
        id > 4294967295 ||
        typeof item.name !== "string" ||
        ids.has(id)
      )
        continue;
      ids.add(id);
      files.push({
        id,
        name: item.name.slice(0, 500),
        notes: typeof item.notes === "string" ? item.notes.slice(0, 1000) : "",
        rating: Number.isFinite(Number(item.average_rating))
          ? Number(item.average_rating)
          : null,
      });
    }
    return { files: files.slice(0, 200), truncated: files.length > 200 };
  }
  function parseCollection(text, Parser = root.DOMParser) {
    const doc = new Parser().parseFromString(text, "text/html"),
      wrap = doc.querySelector(".results-wrap");
    if (!wrap) {
      if (/result:\s*0|no (results|matches|midis)/i.test(doc.body.textContent))
        return { files: [], page: 1, pages: 1 };
      throw Error("MIDICollection liefert kein bekanntes Suchformat.");
    }
    const files = [],
      seen = new Set();
    for (const row of wrap.querySelectorAll("tr[data-midi-id]")) {
      const id = Number(row.getAttribute("data-midi-id")),
        button = row.querySelector(".midi-play-btn[data-url]");
      if (
        !Number.isInteger(id) ||
        id < 1 ||
        id > 4294967295 ||
        !button ||
        seen.has(id)
      )
        continue;
      try {
        const url = new URL(
          button.getAttribute("data-url"),
          "https://midicollection.com/",
        );
        const path = url.pathname;
        if (
          url.origin !== "https://midicollection.com" ||
          url.search ||
          url.hash ||
          !path.startsWith("/midi/") ||
          !/\.midi?$/i.test(path) ||
          /\.\.|%2e|%2f|%5c|%25|%00/i.test(path)
        )
          continue;
        seen.add(id);
        const artist =
          row.getAttribute("data-artist") ||
          row.querySelector(".artist-cell")?.textContent ||
          "";
        const name =
          row.getAttribute("data-title") ||
          row.querySelector(".title-cell")?.textContent ||
          "MIDI #" + id;
        files.push({
          id,
          path,
          name: name.slice(0, 500),
          notes: artist.slice(0, 500) + " · #" + id,
          rating: null,
          size: null,
        });
      } catch {}
    }
    const page = Number(wrap.getAttribute("data-page")),
      pages = Number(wrap.getAttribute("data-total-pages"));
    if (!files.length && page === 1 && pages === 0)
      return { files: [], page: 1, pages: 1 };
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pages) ||
      pages < page ||
      pages > 10000
    )
      throw Error("Ungültige MIDICollection-Seitennummer.");
    return {
      files: files.slice(0, 200),
      page,
      pages,
      truncated: files.length > 200,
    };
  }
  class Client {
    constructor(
      api,
      fetcher = (...args) => root.fetch(...args),
      wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ) {
      this.api = api;
      this.fetch = fetcher;
      this.wait = wait;
      this.current = null;
    }
    async cancel() {
      const job = this.current;
      if (!job) return;
      job.cancelled = true;
      if (job.id) await this.api("library/cancel", { id: job.id });
    }
    async run(request, onProgress = () => {}) {
      if (this.current) throw Error("Bitte den laufenden Download abwarten.");
      const job = { id: 0, cancelled: false };
      this.current = job;
      const chunks = [];
      let size = 0;
      const limit = request.action === "file" ? 2097152 : 262144;
      const deadline = Date.now() + 195000;
      try {
        const reply = await this.api("library/job", request);
        job.id = reply.id;
        if (!Number.isInteger(job.id) || job.id < 1)
          throw Error("Ungültige Download-ID.");
        while (true) {
          if (job.cancelled) throw Error("Download abgebrochen.");
          if (Date.now() > deadline)
            throw Error("Zeitlimit beim Download erreicht.");
          const state = await this.api("library/job?id=" + job.id);
          if (state.error) throw Error(state.error);
          if (
            !Number.isInteger(state.received) ||
            state.received < 0 ||
            state.received > limit ||
            typeof state.running !== "boolean"
          )
            throw Error("Ungültiger Download-Status.");
          if (state.received > size) {
            let bytes, problem;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const response = await this.fetch(
                  "/api/library/data?id=" + job.id + "&offset=" + size,
                  {
                    headers: { "X-Trainer": "1" },
                    cache: "no-store",
                    credentials: "same-origin",
                  },
                );
                if (!response.ok) {
                  const detail = await response.json();
                  throw Error(
                    detail.error || "Downloadfehler " + response.status,
                  );
                }
                bytes = new Uint8Array(await response.arrayBuffer());
                if (
                  !bytes.length ||
                  bytes.length > 4096 ||
                  size + bytes.length > limit
                )
                  throw Error("Ungültiger MIDI-Datenblock.");
                problem = null;
                break;
              } catch (error) {
                problem = error;
                if (job.cancelled) break;
                await this.wait(250);
              }
            }
            if (problem) throw problem;
            chunks.push(bytes);
            size += bytes.length;
            onProgress(size, state.total);
          } else if (!state.running) {
            if (size !== state.received)
              throw Error("Unvollständiger Download.");
            const result = new Uint8Array(size);
            let offset = 0;
            chunks.forEach((chunk) => {
              result.set(chunk, offset);
              offset += chunk.length;
            });
            return result;
          } else {
            onProgress(size, state.total);
            await this.wait(120);
          }
        }
      } catch (error) {
        if (job.id) {
          try {
            await this.api("library/cancel", { id: job.id });
          } catch {}
        }
        throw error;
      } finally {
        this.current = null;
      }
    }
  }
  root.MidiLibrary = {
    parseDav,
    parseSearch,
    parseCollection,
    midiName,
    Client,
  };
  if (typeof module !== "undefined" && module.exports)
    module.exports = root.MidiLibrary;
})(typeof window !== "undefined" ? window : globalThis);
