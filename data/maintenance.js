/* Update package parsing is independent of the UI and of the ESP32 transport. */
(function (root) {
  "use strict";
  function parsePackage(header, fileSize) {
    let metadata;
    try {
      metadata = JSON.parse(new TextDecoder().decode(header));
    } catch {
      throw Error("Ungültiges Updatepaket für ESP32-C3.");
    }
    if (
      header.byteLength !== 256 ||
      metadata.format !== "piano-trainer-update" ||
      metadata.schema !== 1 ||
      metadata.target !== "esp32c3" ||
      !["firmware", "web"].includes(metadata.kind) ||
      !Number.isInteger(metadata.size) ||
      !/^[a-f0-9]{32}$/i.test(metadata.md5 || "") ||
      metadata.size + 256 !== fileSize ||
      (metadata.kind === "web"
        ? metadata.size !== 983040
        : metadata.size < 256 || metadata.size > 1572864)
    )
      throw Error("Updatepaket passt nicht zum Flash-Layout.");
    return metadata;
  }
  function upload(file, progress, XHR = root.XMLHttpRequest) {
    return new Promise((resolve, reject) => {
      const request = new XHR();
      request.open("POST", "/api/update");
      request.setRequestHeader("X-Trainer", "1");
      request.timeout = 180000;
      request.upload.onprogress = (event) => {
        if (event.lengthComputable)
          progress(
            Math.min(99, Math.round((event.loaded / event.total) * 100)),
          );
      };
      request.onload = () => {
        let reply;
        try {
          reply = JSON.parse(request.responseText);
        } catch {}
        if (request.status >= 200 && request.status < 300 && reply?.ok)
          resolve(reply);
        else
          reject(
            Error(
              reply?.error ||
                "Update-Prüfung fehlgeschlagen. Datei erneut übertragen.",
            ),
          );
      };
      request.onerror =
        request.ontimeout =
        request.onabort =
          () =>
            reject(
              Error(
                "Verbindung beim Update unterbrochen. Gerätestatus prüfen.",
              ),
            );
      const body = new root.FormData();
      body.append("package", file, file.name);
      request.send(body);
    });
  }
  const api = { parsePackage, upload };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.TrainerMaintenance = api;
})(typeof window !== "undefined" ? window : globalThis);
