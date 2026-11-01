/* Browser-local MIDI storage, with file bytes separate from list metadata. */
(function (root) {
  "use strict";
  const unavailable = () =>
    Error("Favoritenspeicher nicht verfügbar. Browser-Speicher erlauben.");
  const invalidArchive = () => Error("Ungültiges Browser-Backup.");
  const preferenceValues = {
    language: /^[a-z]{2}(?:-[A-Z]{2})?$/,
    navigationCollapsed: /^(true|false)$/,
    showScore: /^(true|false)$/,
    scoreLabels: /^(true|false)$/,
    trainingDisplay: /^(falling|standard)$/,
  };
  function checkedPreferences(preferences) {
    if (
      !preferences ||
      typeof preferences !== "object" ||
      Array.isArray(preferences)
    )
      throw invalidArchive();
    for (const [key, value] of Object.entries(preferences))
      if (
        !Object.hasOwn(preferenceValues, key) ||
        typeof value !== "string" ||
        !preferenceValues[key].test(value)
      )
        throw invalidArchive();
    return preferences;
  }
  function checksum(bytes) {
    let crc = 0xffffffff;
    for (const byte of new Uint8Array(bytes)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function validRecord(id, name, bytes) {
    return (
      typeof id === "string" &&
      id.length > 0 &&
      id.length <= 2048 &&
      typeof name === "string" &&
      name.length > 0 &&
      name.length <= 255 &&
      Object.prototype.toString.call(bytes) === "[object ArrayBuffer]" &&
      bytes.byteLength >= 14 &&
      bytes.byteLength <= 2097152 &&
      new DataView(bytes).getUint32(0) === 0x4d546864
    );
  }
  class Store {
    constructor(indexedDB = root.indexedDB, name = "piano-trainer-favorites") {
      this.indexedDB = indexedDB;
      this.name = name;
      this.opening = null;
    }
    open() {
      if (!this.indexedDB) return Promise.reject(unavailable());
      if (!this.opening)
        this.opening = new Promise((resolve, reject) => {
          let request,
            settled = false;
          try {
            request = this.indexedDB.open(this.name, 1);
          } catch {
            reject(unavailable());
            return;
          }
          request.onupgradeneeded = () => {
            request.result.createObjectStore("meta", { keyPath: "id" });
            request.result.createObjectStore("midi", { keyPath: "id" });
          };
          request.onerror = request.onblocked = () => {
            settled = true;
            reject(unavailable());
          };
          request.onsuccess = () => {
            if (settled) {
              request.result.close();
              return;
            }
            const db = request.result;
            db.onversionchange = () => {
              db.close();
              this.opening = null;
            };
            resolve(db);
          };
        }).catch((error) => {
          this.opening = null;
          throw error;
        });
      return this.opening;
    }
    async list() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("meta", "readonly"),
          request = tx.objectStore("meta").getAll();
        tx.oncomplete = () =>
          resolve(request.result.sort((a, b) => b.savedAt - a.savedAt));
        tx.onabort = tx.onerror = () => reject(unavailable());
      });
    }
    async get(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("midi", "readonly"),
          request = tx.objectStore("midi").get(id);
        tx.oncomplete = () => resolve(request.result || null);
        tx.onabort = tx.onerror = () => reject(unavailable());
      });
    }
    async save(id, name, bytes) {
      if (!validRecord(id, name, bytes))
        throw Error("Ungültige MIDI-Datei für Favoriten.");
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["meta", "midi"], "readwrite"),
          meta = tx.objectStore("meta");
        const request = meta.getAll();
        let problem;
        request.onsuccess = () => {
          const others = request.result.filter((item) => item.id !== id);
          if (
            others.length >= 32 ||
            others.reduce((n, item) => n + item.size, 0) + bytes.byteLength >
              33554432
          ) {
            problem = Error(
              "Favoritenspeicher voll. Entferne zuerst einen Favoriten.",
            );
            tx.abort();
            return;
          }
          meta.put({ id, name, size: bytes.byteLength, savedAt: Date.now() });
          tx.objectStore("midi").put({ id, name, bytes });
        };
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () =>
          reject(
            problem ||
              (tx.error?.name === "QuotaExceededError"
                ? Error(
                    "Favoritenspeicher voll. Entferne zuerst einen Favoriten.",
                  )
                : unavailable()),
          );
      });
    }
    async remove(id) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["meta", "midi"], "readwrite");
        tx.objectStore("meta").delete(id);
        tx.objectStore("midi").delete(id);
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(unavailable());
      });
    }
    async exportArchive(preferences = {}) {
      checkedPreferences(preferences);
      const db = await this.open();
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(["meta", "midi"], "readonly"),
          meta = tx.objectStore("meta").getAll(),
          midi = tx.objectStore("midi").getAll();
        tx.oncomplete = () =>
          resolve(
            meta.result.map((item) => {
              const record = midi.result.find(
                (record) => record.id === item.id,
              );
              if (!record || !validRecord(record.id, record.name, record.bytes))
                return null;
              return { ...record, savedAt: item.savedAt };
            }),
          );
        tx.onerror = tx.onabort = () => reject(unavailable());
      });
      if (records.some((record) => !record)) throw invalidArchive();
      const manifest = new TextEncoder().encode(
        JSON.stringify({
          format: "piano-trainer-browser",
          schema: 1,
          preferences,
          files: records.map(({ id, name, bytes, savedAt }) => ({
            id,
            name,
            size: bytes.byteLength,
            savedAt,
            crc32: checksum(bytes),
          })),
        }),
      );
      const header = new Uint8Array(12);
      header.set(new TextEncoder().encode("PTBRW001"));
      new DataView(header.buffer).setUint32(8, manifest.byteLength, true);
      return new Blob(
        [header, manifest, ...records.map((record) => record.bytes)],
        { type: "application/octet-stream" },
      );
    }
    async importArchive(bytes) {
      if (
        Object.prototype.toString.call(bytes) !== "[object ArrayBuffer]" ||
        bytes.byteLength < 12 ||
        bytes.byteLength > 33554432 + 262156
      )
        throw invalidArchive();
      if (new TextDecoder().decode(bytes.slice(0, 8)) !== "PTBRW001")
        throw invalidArchive();
      const length = new DataView(bytes).getUint32(8, true);
      if (!length || length > 262144 || length + 12 > bytes.byteLength)
        throw invalidArchive();
      let manifest;
      try {
        manifest = JSON.parse(
          new TextDecoder().decode(bytes.slice(12, 12 + length)),
        );
      } catch {
        throw invalidArchive();
      }
      if (
        manifest?.format !== "piano-trainer-browser" ||
        manifest.schema !== 1 ||
        !Array.isArray(manifest.files) ||
        manifest.files.length > 32
      )
        throw invalidArchive();
      const preferences = checkedPreferences(manifest.preferences),
        ids = new Set(),
        records = [];
      let offset = 12 + length,
        total = 0;
      for (const file of manifest.files) {
        if (
          !Number.isInteger(file.size) ||
          file.size < 14 ||
          file.size > 2097152 ||
          offset + file.size > bytes.byteLength ||
          ids.has(file.id) ||
          !Number.isSafeInteger(file.savedAt) ||
          file.savedAt < 0 ||
          !Number.isInteger(file.crc32)
        )
          throw invalidArchive();
        const data = bytes.slice(offset, offset + file.size);
        if (
          !validRecord(file.id, file.name, data) ||
          checksum(data) !== file.crc32
        )
          throw invalidArchive();
        ids.add(file.id);
        offset += file.size;
        total += file.size;
        records.push({
          id: file.id,
          name: file.name,
          bytes: data,
          savedAt: file.savedAt,
        });
      }
      if (offset !== bytes.byteLength || total > 33554432)
        throw invalidArchive();
      const db = await this.open();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(["meta", "midi"], "readwrite"),
          meta = tx.objectStore("meta"),
          request = meta.getAll();
        let problem;
        request.onsuccess = () => {
          const others = request.result.filter((item) => !ids.has(item.id));
          if (
            others.length + records.length > 32 ||
            others.reduce((n, item) => n + item.size, total) > 33554432
          ) {
            problem = Error(
              "Favoritenspeicher voll. Entferne zuerst einen Favoriten.",
            );
            tx.abort();
            return;
          }
          for (const record of records) {
            const { id, name, savedAt, bytes } = record;
            meta.put({ id, name, savedAt, size: bytes.byteLength });
            tx.objectStore("midi").put({ id, name, bytes });
          }
        };
        tx.oncomplete = resolve;
        tx.onabort = tx.onerror = () => reject(problem || unavailable());
      });
      return preferences;
    }
  }
  root.MidiFavorites = { Store };
  if (typeof module !== "undefined" && module.exports)
    module.exports = { Store };
})(typeof window !== "undefined" ? window : globalThis);
