#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>

#include "NetworkSettings.h"
#include "TrainerLogic.h"
class ConfigManager {
 public:
  LedConfig led;
  String ssid, wifiPassword, accessPassword;
  String hostname = "midi-trainer";
  bool begin();
  bool saveLed(const LedConfig& next);
  bool saveWifi(const String& name, const String& password);
  bool saveHostname(const String& name);
  bool saveAccessPassword(const String& password);
  bool reset();
  static void encode(JsonObject obj, const LedConfig& c);
  static bool decode(JsonObjectConst obj, LedConfig& c, String& error);

 private:
  Preferences prefs;
};
