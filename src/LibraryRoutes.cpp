#include <utility>

#include "TrainerWebServer.h"

void TrainerWebServer::libraryRoutes() {
  server.on("/api/library/config", HTTP_GET, [this] {
    if (!auth()) return;
    DynamicJsonDocument doc(1024);
    doc["folder"] = config.cloudFolder;
    doc["user"] = config.cloudUser;
    doc["hasPassword"] = config.cloudPassword.length() > 0;
    doc["hasCa"] = config.cloudCa.length() > 0;
    json(200, doc);
  });
  server.on("/api/library/config", HTTP_POST, [this] {
    if (!auth(true)) return;
    if (library.busy()) {
      error(409, "Bitte den Download zuerst abbrechen oder abwarten.");
      return;
    }
    DynamicJsonDocument doc(8192);
    if (!body(doc, 6500)) return;
    if (!doc["folder"].is<const char*>() || !doc["user"].is<const char*>()) {
      error(400, "Nextcloud-Verzeichnis und Benutzer fehlen.");
      return;
    }
    String folder = doc["folder"].as<String>(), user = doc["user"].as<String>();
    folder.trim();
    user.trim();
    if (folder.length() && !folder.endsWith("/")) folder += '/';
    if ((folder.length() && !validLibraryUrl(std::string_view(folder.c_str(), folder.length()))) ||
        user.length() > 128) {
      error(400,
            "Gültige HTTP(S)-WebDAV-Verzeichnisadresse ohne Zugangsdaten, Suchparameter oder "
            "Fragment erforderlich (max. 512 Bytes).");
      return;
    }
    const bool sameAccount =
        libraryOrigin(folder.c_str()) == libraryOrigin(config.cloudFolder.c_str()) &&
        user == config.cloudUser;
    String password = sameAccount ? config.cloudPassword : "",
           ca = sameAccount ? config.cloudCa : "";
    if (doc.containsKey("password")) {
      if (!doc["password"].is<const char*>()) {
        error(400, "Ungültiges Nextcloud-Passwort.");
        return;
      }
      password = doc["password"].as<String>();
    }
    if (doc.containsKey("ca")) {
      if (!doc["ca"].is<const char*>()) {
        error(400, "Ungültiges CA-Zertifikat.");
        return;
      }
      ca = doc["ca"].as<String>();
    }
    if (password.length() > 256 || ca.length() > 4096 ||
        (ca.length() &&
         (ca.indexOf("-----BEGIN CERTIFICATE-----") < 0 || ca.indexOf("PRIVATE KEY") >= 0))) {
      error(400, "Passwort maximal 256 Bytes; CA-Zertifikat im PEM-Format maximal 4096 Bytes.");
      return;
    }
    if (!folder.length()) {
      user = "";
      password = "";
      ca = "";
    }
    if (!config.saveCloud(folder, user, password, ca)) {
      error(500, "Nextcloud-Einstellungen konnten nicht gespeichert werden.");
      return;
    }
    server.send(200, "application/json", "{\"ok\":true}");
  });
  server.on("/api/library/job", HTTP_POST, [this] {
    if (!auth(true)) return;
    if (library.busy()) {
      error(409, "Ein Download läuft bereits. Bitte abwarten oder abbrechen.");
      return;
    }
    if (WiFi.status() != WL_CONNECTED) {
      error(409, "Für Online-Import mit dem Router-WLAN verbinden.");
      return;
    }
    StaticJsonDocument<1024> doc;
    if (!body(doc, 1024)) return;
    const String source = doc["source"] | "", action = doc["action"] | "";
    RemoteLibrary::Request request;
    if (source == "nextcloud") {
      if (!config.cloudFolder.length()) {
        error(400, "Zuerst das Nextcloud-Verzeichnis in den Import-Einstellungen hinterlegen.");
        return;
      }
      request.url = config.cloudFolder;
      request.user = config.cloudUser;
      request.password = config.cloudPassword;
      request.ca = config.cloudCa;
      if (action == "list")
        request.dav = request.listing = true;
      else if (action == "file" && doc["name"].is<const char*>()) {
        const auto name = doc["name"].as<JsonString>();
        if (!validMidiFilename(std::string_view(name.c_str(), name.size()))) {
          error(400, "Ungültiger MIDI-Dateiname.");
          return;
        }
        request.url += libraryUrlEncode(std::string_view(name.c_str(), name.size())).c_str();
      } else {
        error(400, "Ungültige Nextcloud-Aktion.");
        return;
      }
    } else if (source == "midisss") {
      request.url = "https://midisss.com/api.php?action=";
      if (action == "search" && doc["query"].is<const char*>()) {
        const auto query = doc["query"].as<JsonString>();
        if (!query.size() || query.size() > 160) {
          error(400, "Suchbegriff: 1–160 Bytes.");
          return;
        }
        request.listing = true;
        request.url += "search&q=";
        request.url += libraryUrlEncode(std::string_view(query.c_str(), query.size())).c_str();
      } else if (action == "file" && doc["id"].is<uint32_t>() && doc["id"].as<uint32_t>() > 0) {
        request.url += "get_midi&id=" + String(doc["id"].as<uint32_t>());
      } else {
        error(400, "Ungültige MIDIsss-Anfrage.");
        return;
      }
    } else if (source == "midicollection") {
      if (action == "search" && doc["query"].is<const char*>()) {
        const auto query = doc["query"].as<JsonString>();
        const int page = doc["page"] | 1;
        if (!query.size() || query.size() > 160 || page < 1 || page > 10000) {
          error(400, "Ungültiger Suchbegriff oder Seite.");
          return;
        }
        request.url = "https://midicollection.com/search";
        request.listing = true;
        request.postBody = "page=" + String(page) + "&search=";
        request.postBody += libraryUrlEncode(std::string_view(query.c_str(), query.size())).c_str();
      } else if (action == "file" && doc["path"].is<const char*>()) {
        const auto path = doc["path"].as<JsonString>();
        if (!validCollectionPath(std::string_view(path.c_str(), path.size()))) {
          error(400, "Ungültiger MIDICollection-Dateipfad.");
          return;
        }
        request.url = "https://midicollection.com";
        request.url += path.c_str();
      } else {
        error(400, "Ungültige MIDICollection-Anfrage.");
        return;
      }
    } else {
      error(400, "Unbekannte MIDI-Quelle.");
      return;
    }
    midi.release();
    if (training.engine.running()) training.pause();
    if (!library.start(std::move(request))) {
      error(503, "Download konnte nicht gestartet werden (Speicher belegt).");
      return;
    }
    StaticJsonDocument<128> reply;
    reply["id"] = library.id();
    json(202, reply);
  });
  server.on("/api/library/job", HTTP_GET, [this] {
    if (!auth()) return;
    if (server.arg("id") != String(library.id())) {
      error(409, "Dieser Download ist nicht mehr aktuell.");
      return;
    }
    StaticJsonDocument<512> doc;
    library.status(doc.to<JsonObject>());
    json(200, doc);
  });
  server.on("/api/library/cancel", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<128> doc;
    if (!body(doc, 128)) return;
    if (!doc["id"].is<uint32_t>() || doc["id"].as<uint32_t>() != library.id()) {
      error(409, "Download ist nicht mehr aktuell.");
      return;
    }
    library.cancel();
    server.send(200, "application/json", "{\"ok\":true}");
  });
  server.on("/api/library/data", HTTP_GET, [this] {
    if (!auth(true)) return;
    if (server.arg("id") != String(library.id())) {
      error(409, "Download ist nicht mehr aktuell.");
      return;
    }
    const String raw = server.arg("offset");
    const long offset = raw.toInt();
    if (offset < 0 || offset > 2097152 || String(offset) != raw) {
      error(400, "Ungültiger Download-Offset.");
      return;
    }
    const uint8_t* data;
    const int length = library.chunk(offset, data);
    if (length < 0) {
      error(409, "Download-Offset stimmt nicht überein.");
      return;
    }
    server.setContentLength(length);
    server.send(length ? 200 : 204, "application/octet-stream", "");
    if (length) server.sendContent(reinterpret_cast<const char*>(data), length);
  });
}
