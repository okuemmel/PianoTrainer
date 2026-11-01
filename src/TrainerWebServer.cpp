#include "TrainerWebServer.h"

#include <LittleFS.h>
#include <esp_ota_ops.h>

#include "AppInfo.h"
#include "EmbeddedWebAssets.h"
bool TrainerWebServer::auth(bool mutation) {
  server.sendHeader("Cache-Control", "no-store");
  server.sendHeader("X-Content-Type-Options", "nosniff");
  if (config.authEnabled && !server.authenticate("admin", config.accessPassword.c_str())) {
    Serial.printf("[HTTP] %s -> 401, Webanmeldung %s.\n", server.uri().c_str(),
                  server.hasHeader("Authorization") ? "fehlgeschlagen" : "erforderlich");
    server.requestAuthentication(BASIC_AUTH, "MIDI Trainer");
    return false;
  }
  // Custom header cannot be sent by cross-origin HTML forms. No CORS is enabled.
  if (mutation && server.header("X-Trainer") != "1") {
    error(403, "Anfrage nicht erlaubt.");
    return false;
  }
  if (server.uri().startsWith("/api/") && server.uri() != "/api/session" &&
      (mutation || server.hasHeader("X-Session")) && !requireSession())
    return false;
  return true;
}
bool TrainerWebServer::requireSession() {
  const String token = server.header("X-Session");
  if (session.renew(std::string_view(token.c_str(), token.length()), millis())) return true;
  server.send(
      409, "application/json",
      "{\"error\":\"Sitzung in einem anderen Browser aktiv.\",\"code\":\"session_conflict\"}");
  return false;
}
void TrainerWebServer::sessionRoutes() {
  server.on("/api/session", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<128> doc;
    if (!body(doc, 128)) return;
    const String token = server.header("X-Session");
    const auto key = std::string_view(token.c_str(), token.length());
    if (!ControlSession::valid(key) || !doc["takeover"].is<bool>()) {
      error(400, "Ungültige Sitzung.");
      return;
    }
    if (updateStarted || rebootAt) {
      error(409, "Gerät ist beschäftigt. Bitte später erneut versuchen.");
      return;
    }
    const bool sameOwner = session.renew(key, millis());
    if (!session.claim(key, millis(), doc["takeover"].as<bool>())) {
      server.send(
          409, "application/json",
          "{\"error\":\"Sitzung in einem anderen Browser aktiv.\",\"code\":\"session_conflict\"}");
      return;
    }
    if (!sameOwner) {
      training.pause();
      training.stopPreview();
      midi.release();
      leds.off();
      library.cancel();
    }
    server.send(200, "application/json", "{\"ok\":true}");
  });
}
void TrainerWebServer::error(int code, const String& msg) {
  Serial.printf("[HTTP] %s -> %d: %s\n", server.uri().c_str(), code, msg.c_str());
  StaticJsonDocument<256> d;
  d["error"] = msg;
  json(code, d);
}
void TrainerWebServer::json(int code, JsonDocument& d) {
  String out;
  serializeJson(d, out);
  server.send(code, "application/json", out);
}
bool TrainerWebServer::body(JsonDocument& d, size_t maxBytes) {
  if (server.arg("plain").length() > maxBytes) {
    error(413, "Anfrage zu groß.");
    return false;
  }
  if (deserializeJson(d, server.arg("plain")) || !d.is<JsonObject>()) {
    error(400, "Ungültiges JSON.");
    return false;
  }
  return true;
}
void TrainerWebServer::status() {
  DynamicJsonDocument d(8192);
  trainingSnapshot(d.createNestedObject("training"));
  ledStatus(d.createNestedObject("leds"));
  d["board"] = BoardProfile::name;
  d["wifiState"] = wifi.state;
  d["connected"] = WiFi.status() == WL_CONNECTED;
  d["ssid"] = WiFi.status() == WL_CONNECTED ? WiFi.SSID() : config.ssid;
  d["ip"] = WiFi.localIP().toString();
  d["ap"] = wifi.ap;
  d["apIp"] = WiFi.softAPIP().toString();
  d["subnet"] = WiFi.subnetMask().toString();
  d["gateway"] = WiFi.gatewayIP().toString();
  d["dns1"] = WiFi.dnsIP(0).toString();
  d["dns2"] = WiFi.dnsIP(1).toString();
  d["mac"] = WiFi.macAddress();
  d["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;
  d["apMask"] = WiFi.softAPSubnetMask().toString();
  d["apMac"] = WiFi.softAPmacAddress();
  d["hostname"] = WiFi.getHostname();
  d["mdns"] = wifi.mdnsActive && WiFi.status() == WL_CONNECTED;
  d["uptime"] = millis() / 1000;
  d["heap"] = ESP.getFreeHeap();
  d["flash"] = ESP.getFlashChipSize();
  d["psram"] = ESP.getPsramSize();
  d["freePsram"] = ESP.getFreePsram();
  auto update = d.createNestedObject("update");
  update["target"] = BoardProfile::target;
  update["layout"] = BoardProfile::layout;
  const auto* slot = esp_ota_get_next_update_partition(nullptr);
  const auto* fs = esp_partition_find_first(ESP_PARTITION_TYPE_DATA,
                                            ESP_PARTITION_SUBTYPE_DATA_SPIFFS, "littlefs");
  update["firmwareMax"] = slot ? slot->size : 0;
  update["filesystemSize"] = fs ? fs->size : 0;
  d["mode"] = leds.mode;
  d["filesystem"] = fsReady;
  d["firmware"] = AppInfo::Version;
  d["authEnabled"] = config.authEnabled;
  d["author"] = AppInfo::Author;
  d["repository"] = AppInfo::Repository;
  d["keys"] = config.led.keys;
  d["baseNote"] = config.led.baseNote;
  d["channel"] = config.led.channel;
  auto pins = d.createNestedArray("pins");
  for (auto pin : BoardProfile::ledPins) pins.add(pin);
  json(200, d);
}
void TrainerWebServer::ledStatus(JsonObject object) const {
  object["count"] = leds.count();
  object["pin"] = config.led.pin;
  object["brightness"] = leds.outputBrightnessPercent();
  object["frame"] = leds.rgbFrame();
}
void TrainerWebServer::ledReply() {
  DynamicJsonDocument reply(8192);
  reply["ok"] = true;
  trainingSnapshot(reply.createNestedObject("training"));
  ledStatus(reply.createNestedObject("leds"));
  json(200, reply);
}
void TrainerWebServer::file(const char* path, const char* mime) {
  if (!auth()) return;
  if (const auto* asset = EmbeddedWeb::find(path)) {
    server.sendHeader("Vary", "Accept-Encoding");
    String accepted = server.header("Accept-Encoding");
    accepted.toLowerCase();
    accepted.replace(" ", "");
    bool gzip = false;
    int start = 0;
    while (start < accepted.length()) {
      int end = accepted.indexOf(',', start);
      if (end < 0) end = accepted.length();
      const String token = accepted.substring(start, end);
      if (token == "gzip" || token.startsWith("gzip;")) {
        const int quality = token.indexOf("q=");
        gzip = quality < 0 || token.substring(quality + 2).toFloat() > 0;
      }
      start = end + 1;
    }
    if (!gzip) {
      server.send(406, "text/plain", "Gzip support required. Use a current web browser.");
      return;
    }
    server.sendHeader("Content-Encoding", "gzip");
    server.send_P(200, mime, reinterpret_cast<const char*>(asset->data), asset->size);
    return;
  }
  // Only the optional sample bank is served from LittleFS. Never fall back to stale UI files.
  if (strcmp(path, "/piano-samples.bin") != 0 || !fsReady || !LittleFS.exists(path)) {
    server.send(404, "text/plain; charset=utf-8", "Datei nicht gefunden.");
    return;
  }
  String resource(path);
  auto f = LittleFS.open(resource, "r");
  if (!f) {
    Serial.printf("[HTTP] %s -> 503, Webdatei kann nicht geöffnet werden.\n", path);
    server.send(503, "text/plain; charset=utf-8", "Webdatei kann nicht geöffnet werden.");
    return;
  }
  const size_t expected = f.size();
  const size_t sent = server.streamFile(f, mime);
  Serial.printf("[HTTP] %s -> 200, %u/%u Bytes gesendet.\n", path, static_cast<unsigned>(sent),
                static_cast<unsigned>(expected));
  f.close();
}
void TrainerWebServer::begin(bool filesystemReady) {
  fsReady = filesystemReady;
  libraryRoutes();
  lessonRoutes();
  maintenanceRoutes();
  sessionRoutes();
  Serial.printf(
      "[HTTP] Oberfläche %s aus Firmware bereit; Samples: %s.\n", AppInfo::Version,
      fsReady && LittleFS.exists("/piano-samples.bin") ? "bereit" : "Synthesizer-Fallback");
  const char* headers[] = {"X-Trainer", "Accept-Encoding", "X-Session"};
  server.collectHeaders(headers, 3);
  server.on("/", HTTP_GET, [this] { file("/index.html", "text/html; charset=utf-8"); });
  server.on("/recovery", HTTP_GET, [this] { recoveryPage(); });
  server.on("/style.css", HTTP_GET, [this] { file("/style.css", "text/css"); });
  server.on("/logo.svg", HTTP_GET, [this] { file("/logo.svg", "image/svg+xml"); });
  server.on("/favicon.ico", HTTP_GET, [this] { file("/favicon.ico", "image/x-icon"); });
  server.on("/apple-touch-icon.png", HTTP_GET,
            [this] { file("/apple-touch-icon.png", "image/png"); });
  server.on("/midi-file.js", HTTP_GET, [this] { file("/midi-file.js", "application/javascript"); });
  server.on("/library.js", HTTP_GET, [this] { file("/library.js", "application/javascript"); });
  server.on("/midi-favorites.js", HTTP_GET,
            [this] { file("/midi-favorites.js", "application/javascript"); });
  server.on("/nextcloud-upload.js", HTTP_GET,
            [this] { file("/nextcloud-upload.js", "application/javascript"); });
  server.on("/midi-player.js", HTTP_GET,
            [this] { file("/midi-player.js", "application/javascript"); });
  server.on("/falling-notes.js", HTTP_GET,
            [this] { file("/falling-notes.js", "application/javascript"); });
  server.on("/piano-audio.js", HTTP_GET,
            [this] { file("/piano-audio.js", "application/javascript"); });
  server.on("/piano-samples.bin", HTTP_GET,
            [this] { file("/piano-samples.bin", "application/octet-stream"); });
  server.on("/piano-credits.txt", HTTP_GET,
            [this] { file("/piano-credits.txt", "text/plain; charset=utf-8"); });
  server.on("/app.js", HTTP_GET, [this] { file("/app.js", "application/javascript"); });
  server.on("/maintenance.js", HTTP_GET,
            [this] { file("/maintenance.js", "application/javascript"); });
  server.on("/i18n.js", HTTP_GET, [this] { file("/i18n.js", "application/javascript"); });
  server.on("/api/training", HTTP_GET, [this] {
    if (auth()) trainingStatus();
  });
  server.on("/api/training", HTTP_POST, [this] {
    if (auth(true)) trainingCommand();
  });
  server.on("/api/playback", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<4096> doc;
    if (!body(doc, 2048)) return;
    if (!doc["active"].is<bool>()) {
      error(400, "Wiedergabestatus fehlt.");
      return;
    }
    if (!doc["active"].as<bool>()) {
      training.stopPreview();
      ledReply();
      return;
    }
    const auto notes = doc["notes"].as<JsonArrayConst>();
    if (!doc["notes"].is<JsonArrayConst>() || notes.size() > 32) {
      error(400, "Maximal 32 Wiedergabenoten erlaubt.");
      return;
    }
    std::array<uint8_t, 128> held{};
    for (const auto item : notes) {
      if (!item["note"].is<int>() || !item["velocity"].is<int>()) {
        error(400, "Ungültige Wiedergabenote.");
        return;
      }
      const int note = item["note"], velocity = item["velocity"];
      if (note < 0 || note > 127 || velocity < 1 || velocity > 127) {
        error(400, "Ungültige Wiedergabenote.");
        return;
      }
      held[note] = std::max<int>(held[note], velocity);
    }
    if (!training.previewActive()) midi.release();
    training.preview(held);
    ledReply();
  });
  server.on("/api/status", HTTP_GET, [this] {
    if (auth()) status();
  });
  server.on("/api/config", HTTP_GET, [this] {
    if (!auth()) return;
    DynamicJsonDocument d(8192);
    ConfigManager::encode(d.to<JsonObject>(), config.led);
    json(200, d);
  });
  server.on("/api/config", HTTP_POST, [this] {
    if (!auth(true)) return;
    DynamicJsonDocument d(8192);
    if (!body(d)) return;
    LedConfig next;
    String e;
    if (!ConfigManager::decode(d.as<JsonObjectConst>(), next, e)) {
      error(400, e);
      return;
    }
    auto old = config.led;
    midi.release();
    training.stop();
    if (!leds.configure(next)) {
      leds.configure(old);
      error(503, "LED-Speicher konnte nicht reserviert werden.");
      return;
    }
    if (!config.saveLed(next)) {
      leds.configure(old);
      error(500, "NVS konnte nicht gespeichert werden.");
      return;
    }
    ledReply();
  });
  server.on("/api/led", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<512> d;
    if (!body(d)) return;
    String cmd = d["command"] | "";
    uint32_t color = 0;
    if (cmd != "off" && cmd != "diagnostic") {
      if (!d["color"].is<uint32_t>() || d["color"].as<uint32_t>() > 0xffffff) {
        error(400, "Ungültige Farbe.");
        return;
      }
      color = d["color"];
    }
    if (cmd == "single") {
      if (!d["index"].is<int>() || d["index"].as<int>() < 0 ||
          d["index"].as<int>() >= config.led.count) {
        error(400, "Ungültiger LED-Index.");
        return;
      }
      training.stop();
      leds.single(d["index"], color);
    } else if (cmd == "diagnostic" || cmd == "off" || cmd == "color" || cmd == "sequence" ||
               cmd == "chase" || cmd == "colors" || cmd == "brightness") {
      training.stop();
      if (cmd == "diagnostic")
        leds.diagnostic();
      else if (cmd == "off")
        leds.off();
      else if (cmd == "color")
        leds.fill(color);
      else
        leds.start(cmd, color);
    } else {
      error(400, "Unbekannter LED-Befehl.");
      return;
    }
    Serial.printf("[HTTP] LED-Befehl %s angenommen, Modus %s.\n", cmd.c_str(), leds.mode.c_str());
    ledReply();
  });
  server.on("/api/midi", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<256> d;
    if (!body(d)) return;
    if (d["release"] == true)
      midi.release();
    else if (d["heartbeat"] == true)
      midi.keepAlive();
    else {
      if (!d["note"].is<int>() || !d["velocity"].is<int>() || !d["channel"].is<int>() ||
          !d["on"].is<bool>()) {
        error(400, "MIDI-Felder fehlen.");
        return;
      }
      int n = d["note"], v = d["velocity"], c = d["channel"];
      if (n < 0 || n > 127 || v < 0 || v > 127 || c < 1 || c > 16) {
        error(400, "Ungültiger MIDI-Wert.");
        return;
      }
      midi.receive({(uint8_t)n, (uint8_t)v, (uint8_t)c, d["on"].as<bool>()});
    }
    ledReply();
  });
  server.on("/api/wifi/scan", HTTP_GET, [this] {
    if (!auth()) return;
    if (wifi.connecting) {
      error(409, "Verbindungstest läuft.");
      return;
    }
    int count = WiFi.scanComplete();
    DynamicJsonDocument d(4096);
    auto a = d.createNestedArray("networks");
    if (count == WIFI_SCAN_FAILED) {
      WiFi.scanNetworks(true);
      d["scanning"] = true;
    } else if (count == WIFI_SCAN_RUNNING)
      d["scanning"] = true;
    else {
      for (int i = 0; i < count && i < 20; ++i) {
        auto o = a.createNestedObject();
        o["ssid"] = WiFi.SSID(i);
        o["rssi"] = WiFi.RSSI(i);
        o["open"] = WiFi.encryptionType(i) == WIFI_AUTH_OPEN;
      }
      WiFi.scanDelete();
      d["scanning"] = false;
    }
    json(200, d);
  });
  server.on("/api/wifi", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<512> d;
    if (!body(d)) return;
    if (!d["ssid"].is<const char*>() || !d["password"].is<const char*>()) {
      error(400, "SSID und Passwort fehlen.");
      return;
    }
    String s = d["ssid"], p = d["password"];
    if (s.length() < 1 || s.length() > 32 ||
        (p.length() != 0 && (p.length() < 8 || p.length() > 63))) {
      error(400, "SSID: 1–32 Bytes; Passwort: leer oder 8–63 Zeichen.");
      return;
    }
    if (!wifi.connect(s, p)) {
      error(409, "Verbindungsversuch oder Scan läuft bereits.");
      return;
    }
    server.send(202, "application/json", "{\"ok\":true}");
  });
  server.on("/api/network", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<256> d;
    if (!body(d, 256)) return;
    if (!d["hostname"].is<const char*>()) {
      error(400, "Hostname fehlt.");
      return;
    }
    const auto raw = d["hostname"].as<JsonString>();
    if (raw.size() != strlen(raw.c_str())) {
      error(400, "Ungültiger Hostname.");
      return;
    }
    String name = d["hostname"].as<String>();
    name.trim();
    name.toLowerCase();
    if (!validHostname(std::string_view(name.c_str(), name.length()))) {
      error(400,
            "Hostname: 1–31 Zeichen (a–z, 0–9, Bindestrich); Anfang und Ende ohne Bindestrich. "
            "Ohne .local.");
      return;
    }
    if (!config.saveHostname(name)) {
      error(500, "Hostname konnte nicht gespeichert werden.");
      return;
    }
    midi.release();
    training.stop();
    StaticJsonDocument<256> reply;
    reply["ok"] = true;
    reply["hostname"] = name;
    reply["restart"] = true;
    json(200, reply);
    rebootAt = millis() + 1500;
  });
  server.on("/api/setup", HTTP_POST, [this] {
    if (!auth(true)) return;
    wifi.setupAP();
    server.send(200, "application/json", "{\"ok\":true}");
  });
  server.on("/api/access", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<128> d;
    if (!body(d, 128)) return;
    if (!d["enabled"].is<bool>()) {
      error(400, "Boolesche Werte fehlen.");
      return;
    }
    if (!config.saveAuthEnabled(d["enabled"].as<bool>())) {
      error(500, "NVS-Speicherfehler.");
      return;
    }
    server.send(200, "application/json", "{\"ok\":true}");
  });
  server.on("/api/password", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<256> d;
    if (!body(d)) return;
    String p = d["password"] | "";
    if (p.length() < 12 || p.length() > 63) {
      error(400, "Passwort muss 12–63 ASCII-Zeichen enthalten.");
      return;
    }
    for (char c : p)
      if (c < 33 || c > 126) {
        error(400, "Nur druckbare ASCII-Zeichen ohne Leerzeichen erlaubt.");
        return;
      }
    if (!config.saveAccessPassword(p)) {
      error(500, "NVS-Speicherfehler.");
      return;
    }
    server.send(200, "application/json", "{\"ok\":true}");
    rebootAt = millis() + 1000;
  });
  server.on("/api/reset", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<128> d;
    if (!body(d)) return;
    if (d["confirm"] != "WERKSRESET") {
      error(400, "Bestätigung fehlt.");
      return;
    }
    if (!config.reset()) {
      error(500, "NVS-Speicherfehler.");
      return;
    }
    training.stop();
    leds.off();
    server.send(200, "application/json", "{\"ok\":true}");
    rebootAt = millis() + 1000;
  });
  server.onNotFound([this] {
    // Serve local catalogs, including future languages, without allowing path traversal.
    const String path = server.uri();
    if (path.startsWith("/i18n/") && path.endsWith(".json") && path.length() <= 48) {
      const String name = path.substring(6, path.length() - 5);
      bool valid = name.length() > 0;
      for (const char c : name)
        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
              c == '-' || c == '_'))
          valid = false;
      if (valid && server.method() == HTTP_GET) {
        file(path.c_str(), "application/json; charset=utf-8");
        return;
      }
    }
    if (server.uri().startsWith("/api/")) {
      error(404, "Endpunkt nicht gefunden.");
      return;
    }
    if (wifi.ap) {
      Serial.printf("[HTTP] %s -> 302, Weiterleitung zur Startseite.\n", server.uri().c_str());
      server.sendHeader("Location", "http://192.168.4.1/");
      server.send(302, "text/plain", "");
    } else {
      Serial.printf("[HTTP] %s -> 404.\n", server.uri().c_str());
      server.send(404, "text/plain", "Nicht gefunden");
    }
  });
  server.begin();
  Serial.println(
      "[HTTP] Webserver auf Port 80 gestartet. Adresse: http://192.168.4.1/ im Setup-WLAN.");
}
void TrainerWebServer::loop() {
  recordCompletedLesson();
  server.handleClient();
  recordCompletedLesson();
  if (rebootAt && (int32_t)(millis() - rebootAt) >= 0) ESP.restart();
}

void TrainerWebServer::trainingStatus() {
  DynamicJsonDocument d(8192);
  trainingSnapshot(d.createNestedObject("training"));
  ledStatus(d.createNestedObject("leds"));
  auto catalog = d.createNestedArray("presets");
  for (const auto& preset : TrainingPresets) {
    auto p = catalog.createNestedObject();
    p["id"] = preset.id;
    p["title"] = preset.title;
  }
  json(200, d);
}
void TrainerWebServer::trainingCommand() {
  if (library.busy()) {
    error(409, "Bitte den MIDI-Download abwarten oder abbrechen.");
    return;
  }
  DynamicJsonDocument d(24576);
  if (!body(d, 12288)) return;
  const String command = d["command"] | "";
  if (command == "free" || command == "stop") {
    midi.release();
    training.stop();
  } else if (command == "pause") {
    if (!training.engine.running()) {
      error(409, "Keine laufende Übung.");
      return;
    }
    training.pause();
    midi.release();
  } else if (command == "resume") {
    if (training.engine.state != TrainingState::Paused) {
      error(409, "Übung ist nicht pausiert.");
      return;
    }
    training.resume();
    midi.keepAlive();
  } else if (command == "start" || command == "lesson") {
    int lesson = -1;
    if (command == "lesson") {
      if (!d["lesson"].is<const char*>() || (lesson = lessonIndex(d["lesson"])) < 0) {
        error(400, "Unbekannte Lektion.");
        return;
      }
      const auto& item = Lessons[lesson];
      d["mode"] = item.mode;
      d["preset"] = item.preset;
      d["bpm"] = item.bpm;
      d["tolerance"] = 250;
      d["timed"] = strcmp(item.mode, "song") == 0;
      d["root"] = lessonRoot(config.led.baseNote, config.led.keys) + item.rootOffset;
    }
    const String mode = d["mode"] | "";
    LearningMode selected;
    if (mode == "guided")
      selected = LearningMode::GuidedLearning;
    else if (mode == "rhythm")
      selected = LearningMode::RhythmTraining;
    else if (mode == "song")
      selected = LearningMode::SongMode;
    else {
      error(400, "Unbekannter Trainingsmodus.");
      return;
    }
    if (!d["bpm"].is<int>() || !d["tolerance"].is<int>() || !d["timed"].is<bool>()) {
      error(400, "Tempo, Zeitfenster und Zeitmodus fehlen.");
      return;
    }
    TrainingSequence sequence;
    const String preset = d["preset"] | "";
    String title;
    if (preset == "custom") {
      const auto steps = d["steps"].as<JsonArrayConst>();
      if (steps.size() < 1 || steps.size() > MaxTrainingSteps) {
        error(400, "MIDI-Import muss 1–128 Schritte enthalten.");
        return;
      }
      for (auto value : steps) {
        if (!value.is<JsonObjectConst>() || !value["ticks"].is<int>() ||
            !value["notes"].is<JsonArrayConst>()) {
          error(400, "Ungültiger Trainingsschritt.");
          return;
        }
        auto notes = value["notes"].as<JsonArrayConst>();
        int ticks = value["ticks"];
        if (notes.size() > MaxChordNotes || ticks < 60 || ticks > 7680) {
          error(400, "Akkord oder Notendauer außerhalb des Bereichs.");
          return;
        }
        auto& step = sequence.steps[sequence.count++];
        step.ticks = ticks;
        for (auto note : notes) {
          if (!note.is<int>() || note.as<int>() < 0 || note.as<int>() > 127) {
            error(400, "Ungültige MIDI-Note.");
            return;
          }
          step.notes[step.count++] = note.as<int>();
        }
      }
      title = "MIDI-Import";
    } else {
      const int defaultRoot = config.led.baseNote + (config.led.keys >= 27 ? 12 : 0);
      if (d.containsKey("root") && !d["root"].is<int>()) {
        error(400, "Grundnote muss ganzzahlig sein.");
        return;
      }
      int root = d["root"] | defaultRoot;
      if (root < 0 || root > 127 || !buildTrainingPreset(preset.c_str(), root, sequence)) {
        error(400, "Unbekannte Übung oder unzulässige Grundnote.");
        return;
      }
      for (const auto& item : TrainingPresets)
        if (preset == item.id) title = item.title;
    }
    String message;
    if (!training.start(selected, sequence, d["bpm"], d["tolerance"], d["timed"], message)) {
      error(400, message);
      return;
    }
    training.exercise = title;
    activeLesson = lesson;
    lessonRecorded = lessonSaved = false;
    if (lesson >= 0) {
      if (++lessonRun == 0) ++lessonRun;
      training.exercise = Lessons[lesson].title;
    }
    midi.keepAlive();
    Serial.printf("[Training] %s gestartet, %d Schritte, %d BPM.\n", mode.c_str(), sequence.count,
                  training.engine.bpm);
  } else {
    error(400, "Unbekannter Trainingsbefehl.");
    return;
  }
  trainingStatus();
}
