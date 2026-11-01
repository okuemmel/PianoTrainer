/* Bounded browser -> C3 -> WebDAV upload with replayable 4 KiB chunks. */
(function (root) {
  "use strict";
  class Client {
    constructor(
      api,
      wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ) {
      this.api = api;
      this.wait = wait;
      this.current = null;
    }
    async cancel() {
      const job = this.current;
      if (!job) return;
      job.cancelled = true;
      if (job.id) await this.api("library/cancel", { id: job.id });
    }
    async run(name, bytes, progress = () => {}) {
      if (this.current) throw Error("Bitte den laufenden Upload abwarten.");
      if (
        !(bytes instanceof Uint8Array) ||
        bytes.length < 14 ||
        bytes.length > 2097152
      )
        throw Error("MIDI-Datei: 14 Bytes bis 2 MiB erforderlich.");
      const job = { id: null, cancelled: false },
        deadline = Date.now() + 300000;
      this.current = job;
      let finished = false;
      const check = () => {
        if (job.cancelled) throw Error("Nextcloud-Upload abgebrochen.");
        if (Date.now() >= deadline)
          throw Error(
            "Nextcloud-Upload unterbrochen. Verbindung und Zielliste prüfen.",
          );
      };
      const state = async () => {
        const status = await this.api("library/job?id=" + job.id);
        check();
        if (!status.running && status.error) throw Error(status.error);
        if (
          status.upload !== true ||
          !Number.isInteger(status.received) ||
          status.received < 0 ||
          status.received > bytes.length ||
          typeof status.running !== "boolean"
        )
          throw Error("Ungültige Upload-Antwort.");
        if (!status.running) {
          if (
            status.received !== bytes.length ||
            status.accepted !== bytes.length
          )
            throw Error("Ungültige Upload-Antwort.");
          finished = true;
        }
        return status;
      };
      try {
        const reply = await this.api("library/job", {
          source: "nextcloud",
          action: "save",
          name,
          size: bytes.length,
        });
        if (!Number.isInteger(reply.id) || reply.id <= 0)
          throw Error("Ungültige Upload-Antwort.");
        job.id = reply.id;
        check();
        for (let offset = 0; offset < bytes.length && !finished; ) {
          check();
          const chunk = bytes.subarray(
            offset,
            Math.min(offset + 4096, bytes.length),
          );
          const data = root.btoa(String.fromCharCode(...chunk));
          let accepted,
            attempts = 0;
          while (!accepted && !finished) {
            check();
            try {
              const ack = await this.api("library/upload", {
                id: job.id,
                offset,
                data,
              });
              check();
              if (typeof ack.accepted !== "boolean")
                throw Error("Ungültige Upload-Antwort.");
              accepted = ack.accepted;
            } catch (error) {
              check();
              await state();
              if (++attempts >= 3 && !finished) throw error;
            }
            if (!accepted && !finished) await this.wait(100);
          }
          offset += chunk.length;
          progress(Math.min(99, Math.round((offset / bytes.length) * 100)));
        }
        while (!finished) {
          await state();
          if (!finished) await this.wait(150);
        }
        progress(100);
      } finally {
        if (job.id && !finished) {
          try {
            await this.api("library/cancel", { id: job.id });
          } catch {}
        }
        if (this.current === job) this.current = null;
      }
    }
  }
  root.NextcloudUpload = { Client };
  if (typeof module !== "undefined" && module.exports)
    module.exports = { Client };
})(typeof window !== "undefined" ? window : globalThis);
