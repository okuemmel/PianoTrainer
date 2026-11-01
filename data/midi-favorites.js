/* Browser-local MIDI storage, with file bytes separate from list metadata. */
(function (root) {
  "use strict";
  const unavailable = () =>
    Error("Favoritenspeicher nicht verfügbar. Browser-Speicher erlauben.");
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
      if (
        typeof id !== "string" ||
        !id.length ||
        id.length > 2048 ||
        typeof name !== "string" ||
        !name.length ||
        name.length > 255 ||
        Object.prototype.toString.call(bytes) !== "[object ArrayBuffer]" ||
        bytes.byteLength < 14 ||
        bytes.byteLength > 2097152 ||
        new DataView(bytes).getUint32(0) !== 0x4d546864
      )
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
  }
  root.MidiFavorites = { Store };
  if (typeof module !== "undefined" && module.exports)
    module.exports = { Store };
})(typeof window !== "undefined" ? window : globalThis);
