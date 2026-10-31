#pragma once
#include <DNSServer.h>
#include <WiFi.h>

#include "ConfigManager.h"
class WiFiManager {
 public:
  explicit WiFiManager(ConfigManager& config) : config(config) {}
  void begin();
  void loop();
  void setupAP();
  bool connect(const String& ssid, const String& password);
  String state = "Start";
  bool ap = false, connecting = false, mdnsActive = false;

 private:
  ConfigManager& config;
  DNSServer dns;
  String pendingSsid, pendingPassword;
  bool candidate = false, wasConnected = false;
  uint32_t started = 0, connectedAt = 0, mdnsAttemptAt = 0;
  bool mdnsAttempted = false;
};
