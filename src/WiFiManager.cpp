#include "WiFiManager.h"

#include <esp_wifi.h>

namespace {
constexpr char setupPassword[] = "piano123";

void logWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_AP_START:
      Serial.printf("[WLAN %lu] Setup-AP gestartet.\n", millis());
      break;
    case ARDUINO_EVENT_WIFI_AP_STOP:
      Serial.printf("[WLAN %lu] Setup-AP gestoppt.\n", millis());
      break;
    case ARDUINO_EVENT_WIFI_AP_STACONNECTED:
      Serial.printf("[WLAN %lu] Gerät am Setup-AP angemeldet (AID %u).\n", millis(),
                    info.wifi_ap_staconnected.aid);
      break;
    case ARDUINO_EVENT_WIFI_AP_STADISCONNECTED:
      // IDF 4.4 has no reason field for AP client disconnections.
      Serial.printf("[WLAN %lu] Gerät vom Setup-AP getrennt (AID %u).\n", millis(),
                    info.wifi_ap_stadisconnected.aid);
      break;
    case ARDUINO_EVENT_WIFI_AP_STAIPASSIGNED:
      Serial.printf("[WLAN %lu] DHCP-Adresse vergeben: %s\n", millis(),
                    IPAddress(info.wifi_ap_staipassigned.ip.addr).toString().c_str());
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      Serial.printf("[WLAN %lu] Verbindung zum Router getrennt, Grundcode %u.\n", millis(),
                    info.wifi_sta_disconnected.reason);
      break;
    default:
      break;
  }
}

void configureRadio() {
  if (WiFi.getSleep() != WIFI_PS_NONE && !WiFi.setSleep(false))
    Serial.println("[WLAN] Energiesparen konnte nicht deaktiviert werden.");
  // Diagnostic trial for the SuperMini: limit RF output, independently of LED brightness.
  if (!WiFi.setTxPower(WIFI_POWER_8_5dBm))
    Serial.println("[WLAN] Sendeleistungsbegrenzung fehlgeschlagen.");
}
}  // namespace

void WiFiManager::setupAP() {
  if (ap) return;
  if (!WiFi.mode(WIFI_AP_STA)) {
    Serial.println("[WLAN] AP/STA-Modus konnte nicht gestartet werden.");
    return;
  }
  configureRadio();
  ap = WiFi.softAP("MIDI-Trainer-Setup", setupPassword, 1, 0, 4);
  if (ap) {
    connectedAt = millis();
    dns.start(53, "*", WiFi.softAPIP());
    Serial.println("Setup-AP: MIDI-Trainer-Setup / http://192.168.4.1");
    wifi_config_t actual{};
    if (esp_wifi_get_config(WIFI_IF_AP, &actual) == ESP_OK) {
      const bool passwordMatches = strncmp(reinterpret_cast<const char*>(actual.ap.password),
                                           setupPassword, sizeof(actual.ap.password)) == 0;
      Serial.printf("[WLAN] AP-Kanal %u, Authmodus %u (WPA2=%u), Passwortprüfung %s.\n",
                    actual.ap.channel, actual.ap.authmode, WIFI_AUTH_WPA2_PSK,
                    passwordMatches ? "OK" : "FEHLER");
    }
    Serial.printf("[WLAN] AP-IP %s, Sendeleistung %.2f dBm.\n", WiFi.softAPIP().toString().c_str(),
                  static_cast<int>(WiFi.getTxPower()) / 4.0);
  } else
    Serial.println("FEHLER: Setup-AP konnte nicht gestartet werden.");
}
void WiFiManager::begin() {
  WiFi.onEvent(logWifiEvent);
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  configureRadio();
  WiFi.setHostname("midi-trainer");
  WiFi.setAutoReconnect(true);
  if (config.ssid.isEmpty()) {
    state = "Einrichtung erforderlich";
    setupAP();
  } else {
    WiFi.begin(config.ssid.c_str(), config.wifiPassword.c_str());
    connecting = true;
    started = millis();
    state = "Verbinde …";
  }
}
bool WiFiManager::connect(const String& ssid, const String& password) {
  if (connecting || WiFi.scanComplete() == WIFI_SCAN_RUNNING) return false;
  setupAP();
  WiFi.disconnect(false, false);
  pendingSsid = ssid;
  pendingPassword = password;
  candidate = true;
  connecting = true;
  wasConnected = false;
  started = millis();
  connectedAt = 0;
  state = "WLAN wird getestet …";
  WiFi.begin(ssid.c_str(), password.c_str());
  return true;
}
void WiFiManager::loop() {
  if (ap) dns.processNextRequest();
  bool online = WiFi.status() == WL_CONNECTED;
  if (online) {
    if (!wasConnected) {
      Serial.print("WLAN verbunden, IP: ");
      Serial.println(WiFi.localIP());
      connectedAt = millis();
    }
    wasConnected = true;
    if (connecting) {
      if (candidate && !config.saveWifi(pendingSsid, pendingPassword)) {
        state = "Verbunden, aber NVS-Speicherfehler";
        candidate = false;
        connecting = false;
        pendingPassword = "";
        setupAP();
        return;
      }
      candidate = false;
      connecting = false;
      pendingPassword = "";
      state = "Verbunden";
    }
    if (ap && state == "Verbunden" && millis() - connectedAt > 30000) {
      dns.stop();
      WiFi.softAPdisconnect(true);
      WiFi.mode(WIFI_STA);
      ap = false;
    }
  } else {
    if (wasConnected) {
      wasConnected = false;
      connecting = true;
      started = millis();
      state = "WLAN unterbrochen …";
    }
    if (connecting && millis() - started >= 15000) {
      WiFi.disconnect(false, false);
      connecting = false;
      candidate = false;
      pendingPassword = "";
      state = "Verbindung fehlgeschlagen – Einrichtung verfügbar";
      setupAP();
      Serial.println(state);
    }
  }
}
