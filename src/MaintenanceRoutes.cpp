#include <LittleFS.h>
#include <Update.h>
#include <esp_ota_ops.h>

#include "AppInfo.h"
#include "TrainerWebServer.h"

void TrainerWebServer::abortUpdate() {
  if (updateStarted) Update.abort();
  updateStarted = false;
  if (updateFilesystem) fsReady = LittleFS.begin(false, "/littlefs", 10, "littlefs");
  updateFilesystem = false;
}
void TrainerWebServer::updateUpload() {
  auto& upload = server.upload();
  if (upload.status == UPLOAD_FILE_START) {
    if (updateSeen) {
      updateError = "Nur eine Update-Datei pro Anfrage erlaubt.";
      abortUpdate();
      return;
    }
    updateSeen = true;
    updateComplete = false;
    updateHeaderSize = updateExpected = updateReceived = 0;
    updateError = "";
    updateAuthorized =
        (!config.authEnabled || server.authenticate("admin", config.accessPassword.c_str())) &&
        server.header("X-Trainer") == "1";
    if (!updateAuthorized) return;
    if (library.busy() || wifi.connecting || rebootAt) {
      updateError = "Gerät ist beschäftigt. Bitte später erneut versuchen.";
      return;
    }
  } else if (upload.status == UPLOAD_FILE_ABORTED) {
    abortUpdate();
    updateSeen = updateAuthorized = updateComplete = false;
    updateError = "Update abgebrochen.";
    return;
  } else if (upload.status == UPLOAD_FILE_WRITE && updateAuthorized && !updateError.length()) {
    size_t offset = 0;
    if (updateHeaderSize < sizeof(updateHeader)) {
      const size_t take = std::min(upload.currentSize, sizeof(updateHeader) - updateHeaderSize);
      memcpy(updateHeader + updateHeaderSize, upload.buf, take);
      updateHeaderSize += take;
      offset += take;
      if (updateHeaderSize < sizeof(updateHeader)) return;
      StaticJsonDocument<1024> metadata;
      if (deserializeJson(metadata, updateHeader, sizeof(updateHeader)) ||
          metadata["format"] != "piano-trainer-update" || metadata["schema"] != 1 ||
          metadata["target"] != "esp32c3" || !metadata["size"].is<uint32_t>() ||
          !metadata["md5"].is<const char*>()) {
        updateError = "Ungültiges Updatepaket für ESP32-C3.";
        return;
      }
      const String kind = metadata["kind"] | "";
      const String checksum = metadata["md5"];
      bool validHash = checksum.length() == 32;
      for (const char c : checksum)
        if (!isxdigit(static_cast<unsigned char>(c))) validHash = false;
      const auto* slot = esp_ota_get_next_update_partition(nullptr);
      const auto* fs = esp_partition_find_first(ESP_PARTITION_TYPE_DATA,
                                                ESP_PARTITION_SUBTYPE_DATA_SPIFFS, "littlefs");
      updateExpected = metadata["size"];
      if (!validHash || (kind != "firmware" && kind != "web") ||
          (kind == "firmware" && (!slot || updateExpected < 256 || updateExpected > slot->size)) ||
          (kind == "web" && (!fs || updateExpected != fs->size))) {
        updateError = "Updatepaket passt nicht zum Flash-Layout.";
        return;
      }
      midi.release();
      training.stop();
      leds.off();
      updateFilesystem = kind == "web";
      if (updateFilesystem) {
        LittleFS.end();
        fsReady = false;
      }
      if (!Update.begin(updateExpected, updateFilesystem ? U_SPIFFS : U_FLASH, -1, LOW,
                        updateFilesystem ? "littlefs" : nullptr)) {
        updateError = "Update konnte nicht gestartet werden.";
        abortUpdate();
        return;
      }
      updateStarted = true;
      Update.setMD5(checksum.c_str());
    }
    const size_t length = upload.currentSize - offset;
    if (length) {
      if (!updateReceived && !updateFilesystem &&
          (length < 24 || upload.buf[offset] != 0xe9 || upload.buf[offset + 12] != 5 ||
           upload.buf[offset + 13] != 0)) {
        updateError = "Firmware ist kein ESP32-C3-Anwendungsimage.";
        abortUpdate();
        return;
      }
      if (length > updateExpected - updateReceived ||
          Update.write(upload.buf + offset, length) != length) {
        updateError = "Update konnte nicht vollständig geschrieben werden.";
        abortUpdate();
        return;
      }
      updateReceived += length;
    }
  } else if (upload.status == UPLOAD_FILE_END) {
    updateComplete = updateStarted && updateReceived == updateExpected && !updateError.length();
    if (!updateComplete && !updateError.length()) updateError = "Update-Datei ist unvollständig.";
  }
}
void TrainerWebServer::maintenanceRoutes() {
  server.on("/api/backup", HTTP_GET, [this] {
    if (!auth()) return;
    recordCompletedLesson();
    DynamicJsonDocument doc(24576);
    config.backup(doc.to<JsonObject>());
    doc["firmware"] = AppInfo::Version;
    if (doc.overflowed()) {
      error(500, "Backup ist zu groß.");
      return;
    }
    server.sendHeader("Content-Disposition", "attachment; filename=piano-trainer-backup.json");
    json(200, doc);
  });
  server.on("/api/restore", HTTP_POST, [this] {
    if (!auth(true)) return;
    if (library.busy() || wifi.connecting || rebootAt) {
      error(409, "Gerät ist beschäftigt. Bitte später erneut versuchen.");
      return;
    }
    DynamicJsonDocument doc(24576);
    if (!body(doc, 16384)) return;
    if (doc["confirm"] != "RESTORE") {
      error(400, "Bestätigung fehlt.");
      return;
    }
    String message;
    if (!config.restore(doc, message)) {
      error(400, message);
      return;
    }
    midi.release();
    training.stop();
    leds.off();
    activeLesson = -1;
    server.send(200, "application/json", "{\"ok\":true,\"restart\":true}");
    rebootAt = millis() + 1500;
  });
  server.on(
      "/api/update", HTTP_POST,
      [this] {
        if (!auth(true)) {
          abortUpdate();
          updateSeen = false;
          return;
        }
        if (!updateSeen || !updateAuthorized || !updateComplete || updateError.length()) {
          const String message =
              updateError.length() ? updateError : "Update-Datei fehlt oder ist unvollständig.";
          abortUpdate();
          updateSeen = false;
          error(400, message);
          return;
        }
        if (!Update.end()) {
          updateError = "Update-Prüfung fehlgeschlagen. Datei erneut übertragen.";
          abortUpdate();
          updateSeen = false;
          error(400, updateError);
          return;
        }
        updateStarted = false;
        const bool filesystemUpdate = updateFilesystem;
        if (filesystemUpdate) fsReady = LittleFS.begin(false, "/littlefs", 10, "littlefs");
        updateFilesystem = false;
        updateSeen = false;
        if (filesystemUpdate && !fsReady) {
          error(500,
                "Webdateisystem konnte nicht geöffnet werden. Webpaket erneut übertragen oder USB "
                "verwenden.");
          return;
        }
        server.send(200, "application/json", "{\"ok\":true,\"restart\":true}");
        rebootAt = millis() + 1500;
      },
      [this] { updateUpload(); });
}

void TrainerWebServer::recoveryPage() {
  if (!auth()) return;
  // Emergency UI lives in firmware; it remains available without a mounted filesystem.
  static const char page[] PROGMEM =
      R"html(<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Piano Trainer Recovery</title><body style="font:16px system-ui;max-width:640px;margin:32px auto;padding:16px"><h1>Piano Trainer · Recovery</h1><p>Firmware &amp; Oberfläche aktualisieren / Update firmware &amp; interface</p><p>firmware.ptupdate auswählen und Stromversorgung verbunden lassen.<br>Select firmware.ptupdate and keep power connected.</p><form id="restore"><input id="file" type="file" name="package" accept=".ptupdate,application/octet-stream" required><button id="send">Update übertragen / Upload update</button></form><progress id="progress" max="100" value="0"></progress><p id="status" role="status"></p><a href="/">Nach Neustart öffnen / Open after restart</a><script>
let busy=false;window.onbeforeunload=e=>{if(busy){e.preventDefault();e.returnValue='';}};
document.querySelector('#restore').onsubmit=async e=>{e.preventDefault();if(busy)return;
const status=document.querySelector('#status'),button=document.querySelector('#send'),bar=document.querySelector('#progress');
try{const file=document.querySelector('#file').files[0],header=JSON.parse(await file.slice(0,256).text());if(header.kind!=='firmware')throw Error('firmware.ptupdate erforderlich / Firmware package required');
busy=true;button.disabled=true;bar.value=0;status.textContent='Übertragung / Upload …';
const request=new XMLHttpRequest();request.open('POST','/api/update');request.setRequestHeader('X-Trainer','1');request.timeout=180000;
request.upload.onprogress=e=>{if(e.lengthComputable)bar.value=Math.min(99,Math.round(e.loaded/e.total*100));};
const finish=()=>{busy=false;button.disabled=false;};
request.onload=()=>{finish();let reply;try{reply=JSON.parse(request.responseText);}catch{}if(request.status===200&&reply?.ok){bar.value=100;status.textContent='Erfolgreich. Neustart abwarten, dann Link öffnen. / Success. Wait for restart, then open the link.';}else status.textContent=reply?.error||'Fehlgeschlagen / Failed';};
request.onerror=request.ontimeout=request.onabort=()=>{finish();status.textContent='Verbindung unterbrochen. Erneut versuchen. / Connection lost. Try again.';};
request.send(new FormData(e.target));
}catch(error){busy=false;button.disabled=false;status.textContent=error.message;}};
</script></body></html>)html";
  server.send_P(200, "text/html; charset=utf-8", page);
}
