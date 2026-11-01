#include "RemoteLibrary.h"

#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>

#include <utility>

#include "AppInfo.h"

extern const uint8_t trustBundle[] asm("_binary_x509_crt_bundle_start");

class RemoteLibrary::Source : public Stream {
 public:
  Source(RemoteLibrary& owner, WiFiClient& client)
      : owner(owner), client(client), progressAt(millis()) {}
  int available() override {
    if (owner.cancelled.load() || millis() - progressAt > 30000 ||
        int32_t(millis() - owner.deadline) >= 0) {
      client.stop();
      return 0;
    }
    return xStreamBufferBytesAvailable(owner.buffer);
  }
  size_t readBytes(uint8_t* bytes, size_t length) override {
    const size_t read = xStreamBufferReceive(owner.buffer, bytes, length, 0);
    if (read) {
      owner.received.fetch_add(read);
      progressAt = millis();
    }
    return read;
  }
  int read() override {
    uint8_t byte;
    return readBytes(&byte, 1) == 1 ? byte : -1;
  }
  int peek() override {
    return -1;
  }
  size_t write(uint8_t) override {
    return 0;
  }
  void flush() override {}

 private:
  RemoteLibrary& owner;
  WiFiClient& client;
  uint32_t progressAt;
};

int RemoteLibrary::uploadChunk(uint32_t offset, const uint8_t* bytes, size_t length) {
  const bool running = busy();
  if (!request.uploadSize || !length || length > sizeof(cached)) return -1;
  if (offset == cachedOffset && length == cachedSize && memcmp(bytes, cached, length) == 0 &&
      (running || (!failure[0] && uploaded == request.uploadSize)))
    return 1;
  if (!running) return -1;
  if (offset != uploaded || length > request.uploadSize - uploaded ||
      (!offset && (length < 14 || memcmp(bytes, "MThd", 4) != 0)))
    return -1;
  if (xStreamBufferSpacesAvailable(buffer) < length) return 0;
  if (xStreamBufferSend(buffer, bytes, length, 0) != length) {
    cancel();
    return -1;
  }
  memcpy(cached, bytes, length);
  cachedOffset = offset;
  cachedSize = length;
  uploaded += length;
  return 1;
}

void RemoteLibrary::performUpload(WiFiClient& client) {
  Serial.printf("[Nextcloud #%lu] Upload gestartet: %lu Bytes, HTTPS=%s, Heap=%u.\n",
                static_cast<unsigned long>(jobId), static_cast<unsigned long>(request.uploadSize),
                request.url.startsWith("https://") ? "ja" : "nein", ESP.getFreeHeap());
  auto send = [&](const char* method, const String& url, Stream* body = nullptr) {
    const uint32_t started = millis();
    HTTPClient http;
    http.setConnectTimeout(8000);
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    if (!http.begin(client, url)) {
      Serial.printf("[Nextcloud #%lu] %s: HTTP-Initialisierung fehlgeschlagen.\n",
                    static_cast<unsigned long>(jobId), method);
      return -1;
    }
    http.setUserAgent(String("PianoTrainer/") + AppInfo::Version);
    if (request.user.length())
      http.setAuthorization(request.user.c_str(), request.password.c_str());
    if (body) {
      http.addHeader("Content-Type", "audio/midi");
      http.addHeader("If-None-Match", "*");
    } else if (strcmp(method, "MOVE") == 0) {
      http.addHeader("Destination", request.destination);
      http.addHeader("Overwrite", "F");
    }
    const int code =
        body ? http.sendRequest(method, body, request.uploadSize) : http.sendRequest(method);
    // Never log URLs, credentials or remote response bodies.
    Serial.printf("[Nextcloud #%lu] %s: HTTP %d, %lu ms, gesendet=%lu/%lu, Heap=%u.\n",
                  static_cast<unsigned long>(jobId), method, code,
                  static_cast<unsigned long>(millis() - started),
                  static_cast<unsigned long>(received.load()),
                  static_cast<unsigned long>(request.uploadSize), ESP.getFreeHeap());
    if (code < 0)
      Serial.printf("[Nextcloud #%lu] Transport: %s.\n", static_cast<unsigned long>(jobId),
                    HTTPClient::errorToString(code).c_str());
    http.end();
    return code;
  };
  expected.store(request.uploadSize);
  Source source(*this, client);
  int code = send("PUT", request.url, &source);
  const bool complete = (code == 201 || code == 204) && received.load() == request.uploadSize;
  const bool cleanup = complete || code < 0 || code >= 500;
  if (complete && !cancelled.load()) {
    code = send("MOVE", request.url);
    if (code == 201 || code == 204) {
      Serial.printf("[Nextcloud #%lu] Erfolgreich gespeichert.\n",
                    static_cast<unsigned long>(jobId));
      return;
    }
  }
  // Delete only this job's temporary object. Never overwrite or delete the destination.
  if (cleanup) send("DELETE", request.url);
  if (cancelled.load())
    snprintf(failure, sizeof(failure), "Nextcloud-Upload abgebrochen.");
  else if ((code == 412 && complete) || code == 409)
    snprintf(failure, sizeof(failure),
             "Datei existiert bereits oder Zielordner fehlt. Anderen Dateinamen wählen.");
  else if (code == 401 || code == 403)
    snprintf(failure, sizeof(failure),
             "Nextcloud-Schreibzugriff verweigert. App-Passwort und Ordnerrechte prüfen.");
  else if (code > 0)
    snprintf(failure, sizeof(failure), "Nextcloud-Speichern fehlgeschlagen (HTTP %d).", code);
  else
    snprintf(failure, sizeof(failure),
             "Nextcloud-Upload unterbrochen. Verbindung und Zielliste prüfen.");
}

class RemoteLibrary::Sink : public Stream {
 public:
  explicit Sink(RemoteLibrary& owner) : owner(owner) {}
  size_t write(uint8_t value) override {
    return write(&value, 1);
  }
  size_t write(const uint8_t* data, size_t length) override {
    const uint32_t limit = owner.listing ? 262144 : 2097152;
    if (length > limit - owner.received.load()) {
      snprintf(owner.failure, sizeof(owner.failure),
               "Antwort zu groß (Liste: 256 KiB, MIDI: 2 MiB).");
      return 0;
    }
    size_t sent = 0;
    uint32_t progressAt = millis();
    while (sent < length) {
      if (owner.cancelled.load() || millis() - progressAt > 15000 ||
          int32_t(millis() - owner.deadline) >= 0)
        return sent;
      size_t n = xStreamBufferSend(owner.buffer, data + sent, length - sent, pdMS_TO_TICKS(100));
      if (n) {
        sent += n;
        owner.received.fetch_add(n);
        progressAt = millis();
      }
    }
    return sent;
  }
  int available() override {
    return 0;
  }
  int read() override {
    return -1;
  }
  int peek() override {
    return -1;
  }
  void flush() override {}

 private:
  RemoteLibrary& owner;
};

bool RemoteLibrary::start(Request next) {
  if (busy()) return false;
  if (!buffer) buffer = xStreamBufferCreate(16384, 1);
  if (!buffer) return false;
  xStreamBufferReset(buffer);
  request = std::move(next);
  listing = request.listing;
  delivered = cachedSize = uploaded = 0;
  cachedOffset = UINT32_MAX;
  received.store(0);
  expected.store(-1);
  failure[0] = 0;
  cancelled.store(false);
  if (++jobId == 0) ++jobId;
  deadline = millis() + (request.uploadSize ? 300000 : 180000);
  active.store(true);
  if (xTaskCreate(task, "midi-download", 8192, this, 1, nullptr) != pdPASS) {
    snprintf(failure, sizeof(failure), "Zu wenig Speicher für den Download.");
    request.password = "";
    request.ca = "";
    active.store(false);
    return false;
  }
  return true;
}
void RemoteLibrary::task(void* context) {
  auto* self = static_cast<RemoteLibrary*>(context);
  self->perform();
  if (self->request.uploadSize && self->failure[0])
    Serial.printf("[Nextcloud #%lu] Fehler: %s\n", static_cast<unsigned long>(self->jobId),
                  self->failure);
  self->request.password = "";
  self->request.ca = "";
  self->active.store(false);  // Publishes final error text after all writes.
  vTaskDelete(nullptr);
}
void RemoteLibrary::perform() {
  const bool tls = request.url.startsWith("https://");
  if (tls && time(nullptr) < 1700000000) {
    configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
    const uint32_t started = millis();
    while (time(nullptr) < 1700000000 && millis() - started < 12000 && !cancelled.load())
      vTaskDelay(pdMS_TO_TICKS(100));
    if (time(nullptr) < 1700000000) {
      snprintf(failure, sizeof(failure),
               "Uhrzeit für HTTPS fehlt. Internet-/NTP-Verbindung prüfen und erneut versuchen.");
      return;
    }
  }
  if (cancelled.load()) {
    snprintf(failure, sizeof(failure), "Download abgebrochen.");
    return;
  }
  WiFiClient plain;
  WiFiClientSecure secure;
  if (tls) {
    secure.setHandshakeTimeout(12);
    if (request.ca.length())
      secure.setCACert(request.ca.c_str());
    else
      secure.setCACertBundle(trustBundle);
  }
  if (request.uploadSize) {
    performUpload(tls ? static_cast<WiFiClient&>(secure) : plain);
    return;
  }
  HTTPClient http;
  http.setConnectTimeout(8000);
  http.setTimeout(8000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(tls ? static_cast<WiFiClient&>(secure) : plain, request.url)) {
    snprintf(failure, sizeof(failure), "Remote-Adresse konnte nicht geöffnet werden.");
    return;
  }
  http.setUserAgent(String("PianoTrainer/") + AppInfo::Version);
  if (request.user.length()) http.setAuthorization(request.user.c_str(), request.password.c_str());
  int code;
  if (request.dav) {
    http.addHeader("Depth", "1");
    http.addHeader("Content-Type", "application/xml; charset=utf-8");
    http.addHeader("X-Requested-With", "XMLHttpRequest");
    code = http.sendRequest(
        "PROPFIND",
        "<?xml version=\"1.0\"?><d:propfind "
        "xmlns:d=\"DAV:\"><d:prop><d:resourcetype/><d:getcontentlength/></d:prop></d:propfind>");
  } else if (request.postBody.length()) {
    http.addHeader("Content-Type", "application/x-www-form-urlencoded");
    code = http.POST(request.postBody);
  } else
    code = http.GET();
  const int wanted = request.dav ? 207 : 200;
  if (code != wanted) {
    if (code == 401 || code == 403)
      snprintf(failure, sizeof(failure),
               "Zugriff verweigert. Nextcloud-Benutzer, App-Passwort und Freigabe prüfen.");
    else if (code >= 300 && code < 400)
      snprintf(failure, sizeof(failure),
               "Umleitung erhalten. Bitte die endgültige WebDAV-Verzeichnisadresse einstellen.");
    else if (code > 0)
      snprintf(failure, sizeof(failure), "Remote-Server meldet HTTP %d.", code);
    else
      snprintf(failure, sizeof(failure),
               "Verbindung/HTTPS fehlgeschlagen. Adresse, Uhrzeit und Zertifikat prüfen (Code %d).",
               code);
  } else {
    const int length = http.getSize();
    expected.store(length);
    if (length > (listing ? 262144 : 2097152))
      snprintf(failure, sizeof(failure), "Remote-Datei überschreitet die Größenbegrenzung.");
    else {
      Sink sink(*this);
      const int copied = http.writeToStream(&sink);
      if (cancelled.load())
        snprintf(failure, sizeof(failure), "Download abgebrochen.");
      else if ((copied < 0 || (length >= 0 && received.load() != uint32_t(length))) && !failure[0])
        snprintf(failure, sizeof(failure),
                 "Download unvollständig oder Zeitlimit erreicht. Bitte erneut versuchen.");
    }
  }
  http.end();
}
void RemoteLibrary::status(JsonObject object) const {
  const bool running = active.load();
  object["id"] = jobId;
  object["running"] = running;
  object["received"] = received.load();
  object["total"] = expected.load();
  object["delivered"] = delivered;
  object["upload"] = request.uploadSize > 0;
  if (request.uploadSize) object["accepted"] = uploaded;
  if (!running && failure[0]) object["error"] = failure;
}
int RemoteLibrary::chunk(uint32_t offset, const uint8_t*& data) {
  if (request.uploadSize) return -1;
  data = cached;
  if (offset == cachedOffset) return cachedSize;
  if (offset != delivered) return -1;
  const size_t size = buffer ? xStreamBufferReceive(buffer, cached, sizeof(cached), 0) : 0;
  if (size) {
    cachedOffset = offset;
    cachedSize = size;
    delivered += size;
  }
  return size;
}
