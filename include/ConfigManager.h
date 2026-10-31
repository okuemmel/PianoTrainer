#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>

#include "LessonCatalog.h"
#include "LessonProgress.h"
#include "LibrarySettings.h"
#include "NetworkSettings.h"
#include "TrainerLogic.h"
class ConfigManager {
 public:
  LedConfig led;
  String cloudFolder, cloudUser, cloudPassword, cloudCa;
  String ssid, wifiPassword, accessPassword;
  String hostname = "midi-trainer";
  std::array<LessonResult, LessonCount> lessonResults{};
  bool saveLessonResult(size_t index, int accuracy);
  bool resetLessonProgress();
  bool begin();
  bool saveLed(const LedConfig& next);
  bool saveWifi(const String& name, const String& password);
  bool saveCloud(const String& folder, const String& user, const String& password,
                 const String& ca);
  bool saveHostname(const String& name);
  bool saveAccessPassword(const String& password);
  bool reset();
  static void encode(JsonObject obj, const LedConfig& c);
  static bool decode(JsonObjectConst obj, LedConfig& c, String& error);
  void backup(JsonObject object, bool internal = false) const;
  bool restore(JsonDocument& document, String& error);

 private:
  Preferences prefs;
  bool applyProfile(JsonDocument& document, bool persist, bool internal, String& error);
};
