#include "ConfigManager.h"

void ConfigManager::encode(JsonObject o, const LedConfig& c) {
  o["count"] = c.count;
  o["pin"] = c.pin;
  o["brightness"] = c.brightness;
  o["first"] = c.first;
  o["keys"] = c.keys;
  o["baseNote"] = c.baseNote;
  o["reversed"] = c.reversed;
  o["rgb"] = c.rgb;
  o["channel"] = c.channel;
  auto a = o.createNestedArray("mapping");
  for (int n : c.mapping) a.add(n);
}
bool ConfigManager::decode(JsonObjectConst o, LedConfig& c, String& error) {
  const char* fields[] = {"count", "pin", "brightness", "first", "keys", "baseNote", "channel"};
  for (auto f : fields)
    if (!o[f].is<int>()) {
      error = "Ganzzahl fehlt: " + String(f);
      return false;
    }
  if (!o["reversed"].is<bool>() || !o["rgb"].is<bool>()) {
    error = "Boolesche Werte fehlen.";
    return false;
  }
  c.count = o["count"];
  c.pin = o["pin"];
  c.brightness = o["brightness"];
  c.first = o["first"];
  c.keys = o["keys"];
  c.baseNote = o["baseNote"];
  c.channel = o["channel"];
  c.reversed = o["reversed"];
  c.rgb = o["rgb"];
  auto a = o["mapping"].as<JsonArrayConst>();
  if (a.size() != 128) {
    error = "128 Notenzuordnungen erforderlich.";
    return false;
  }
  int i = 0;
  for (auto v : a) {
    if (!v.is<int>()) {
      error = "Zuordnung muss ganzzahlig sein.";
      return false;
    }
    c.mapping[i++] = v.as<int>();
  }
  if (auto e = validate(c)) {
    error = e;
    return false;
  }
  return true;
}
bool ConfigManager::begin() {
  if (!prefs.begin("trainer", false)) return false;
  // Apply the requested admin/admin default once, including on existing devices.
  // Later password changes remain persistent across ordinary restarts.
  if (!prefs.getBool("auth-v1", false)) {
    if (!prefs.putString("access", "admin")) return false;
    if (!prefs.putBool("auth-v1", true)) return false;
  }
  const auto storedHostname =
      prefs.isKey("profile") ? hostname : prefs.getString("hostname", "midi-trainer");
  if (validHostname(std::string_view(storedHostname.c_str(), storedHostname.length())))
    hostname = storedHostname;
  accessPassword = prefs.getString("access", "admin");
  authEnabled = prefs.getBool("auth-enabled", false);
  DynamicJsonDocument network(512);
  if (!deserializeJson(network, prefs.getString("network", "{}"))) {
    ssid = network["ssid"] | "";
    wifiPassword = network["password"] | "";
  }
  if (prefs.isKey("profile")) {
    DynamicJsonDocument profile(24576);
    String error;
    if (deserializeJson(profile, prefs.getString("profile", ""))) return false;
    return applyProfile(profile, false, true, error);
  }
  DynamicJsonDocument cloud(8192);
  if (!deserializeJson(cloud, prefs.getString("cloud", "{}"))) {
    const String folder = cloud["folder"] | "";
    if (validLibraryUrl(folder.c_str())) {
      cloudFolder = folder;
      cloudUser = cloud["user"] | "";
      cloudPassword = cloud["password"] | "";
      cloudCa = cloud["ca"] | "";
    }
  }
  cloud.clear();
  DynamicJsonDocument progress(4096);
  if (!deserializeJson(progress, prefs.getString("lessons", "{}"))) {
    for (size_t i = 0; i < LessonCount; ++i) {
      auto item = progress[Lessons[i].id];
      if (item["runs"].is<uint16_t>() && item["best"].is<int>() && item["best"].as<int>() >= 0 &&
          item["best"].as<int>() <= 100) {
        lessonResults[i].runs = item["runs"];
        lessonResults[i].best = lessonResults[i].runs ? item["best"].as<int>() : 0;
      }
    }
  }
  DynamicJsonDocument doc(8192);
  String error;
  auto stored = prefs.getString("led", "");
  if (stored.length() &&
      (deserializeJson(doc, stored) || !decode(doc.as<JsonObjectConst>(), led, error))) {
    led = LedConfig();
    Serial.println("Ungültige LED-Konfiguration: Standardwerte geladen.");
  }
  return true;
}
void ConfigManager::backup(JsonObject o, bool internal) const {
  o["format"] = "piano-trainer-backup";
  o["schema"] = 1;
  o["hostname"] = hostname;
  encode(o.createNestedObject("led"), led);
  auto cloud = o.createNestedObject("cloud");
  cloud["folder"] = cloudFolder;
  cloud["user"] = cloudUser;
  cloud["ca"] = cloudCa;
  if (internal) cloud["password"] = cloudPassword;
  auto results = o.createNestedObject("lessons");
  for (size_t i = 0; i < LessonCount; ++i) {
    auto item = results.createNestedObject(Lessons[i].id);
    item["runs"] = lessonResults[i].runs;
    item["best"] = lessonResults[i].best;
  }
}
bool ConfigManager::applyProfile(JsonDocument& doc, bool persist, bool internal, String& error) {
  auto o = doc.as<JsonObject>();
  LedConfig nextLed;
  std::array<LessonResult, LessonCount> nextResults{};
  if (o["format"] != "piano-trainer-backup" || !o["schema"].is<int>() || o["schema"] != 1 ||
      !o["led"].is<JsonObject>() || !o["cloud"].is<JsonObject>() ||
      !o["lessons"].is<JsonObject>() || !o["hostname"].is<const char*>()) {
    error = "Unbekanntes oder unvollständiges Backup.";
    return false;
  }
  auto name = o["hostname"].as<JsonString>();
  if (!validHostname(std::string_view(name.c_str(), name.size())) ||
      !decode(o["led"], nextLed, error)) {
    if (!error.length()) error = "Ungültiger Hostname.";
    return false;
  }
  auto cloud = o["cloud"].as<JsonObject>();
  for (const char* key : {"folder", "user", "ca"}) {
    if (!cloud[key].is<const char*>() ||
        cloud[key].as<JsonString>().size() != strlen(cloud[key].as<const char*>())) {
      error = "Ungültige Nextcloud-Einstellungen im Backup.";
      return false;
    }
  }
  const String folder = cloud["folder"], user = cloud["user"], ca = cloud["ca"];
  if ((folder.length() && !validLibraryUrl(std::string_view(folder.c_str(), folder.length()))) ||
      user.length() > 128 || ca.length() > 4096 ||
      (ca.length() &&
       (ca.indexOf("-----BEGIN CERTIFICATE-----") < 0 || ca.indexOf("PRIVATE KEY") >= 0))) {
    error = "Ungültige Nextcloud-Einstellungen im Backup.";
    return false;
  }
  for (size_t i = 0; i < LessonCount; ++i) {
    auto item = o["lessons"][Lessons[i].id];
    if (!item.is<JsonObject>() || !item["runs"].is<uint16_t>() || !item["best"].is<int>() ||
        item["best"].as<int>() < 0 || item["best"].as<int>() > 100 ||
        (!item["runs"].as<uint16_t>() && item["best"].as<int>())) {
      error = "Ungültiger Lernfortschritt im Backup.";
      return false;
    }
    nextResults[i] = {item["runs"].as<uint16_t>(), uint8_t(item["best"].as<int>())};
  }
  String password;
  if (internal) {
    if (!cloud["password"].is<const char*>() || cloud["password"].as<JsonString>().size() > 256) {
      error = "Ungültige Nextcloud-Einstellungen im Backup.";
      return false;
    }
    password = cloud["password"].as<String>();
  } else if (libraryOrigin(folder.c_str()) == libraryOrigin(cloudFolder.c_str()) &&
             user == cloudUser) {
    password = cloudPassword;
  }
  // Always overwrite any supplied password: public backups never import credentials.
  cloud["password"] = password;
  if (doc.overflowed()) {
    error = "Backup ist zu groß.";
    return false;
  }
  if (persist) {
    String blob;
    serializeJson(doc, blob);
    if (!prefs.putString("profile", blob)) {
      error = "NVS-Speicherfehler.";
      return false;
    }
    // The canonical profile is committed before legacy entries are retired.
    for (const char* key : {"led", "hostname", "cloud", "lessons"})
      if (prefs.isKey(key)) prefs.remove(key);
  }
  led = nextLed;
  hostname = name.c_str();
  lessonResults = nextResults;
  cloudFolder = folder;
  cloudUser = user;
  cloudCa = ca;
  cloudPassword = password;
  return true;
}
bool ConfigManager::restore(JsonDocument& doc, String& error) {
  return applyProfile(doc, true, false, error);
}
bool ConfigManager::saveLessonResult(size_t index, int accuracy) {
  if (index >= LessonCount) return false;
  auto next = lessonResults[index];
  if (!recordLessonResult(next, accuracy)) return false;
  DynamicJsonDocument doc(24576);
  backup(doc.to<JsonObject>(), true);
  auto item = doc["lessons"][Lessons[index].id];
  item["runs"] = next.runs;
  item["best"] = next.best;
  String error;
  return applyProfile(doc, true, true, error);
}
bool ConfigManager::resetLessonProgress() {
  DynamicJsonDocument doc(24576);
  backup(doc.to<JsonObject>(), true);
  for (const auto& lesson : Lessons) {
    doc["lessons"][lesson.id]["runs"] = 0;
    doc["lessons"][lesson.id]["best"] = 0;
  }
  String error;
  return applyProfile(doc, true, true, error);
}
bool ConfigManager::saveLed(const LedConfig& next) {
  if (validate(next)) return false;
  DynamicJsonDocument doc(24576);
  backup(doc.to<JsonObject>(), true);
  encode(doc.createNestedObject("led"), next);
  String error;
  return applyProfile(doc, true, true, error);
}
bool ConfigManager::saveWifi(const String& name, const String& password) {
  DynamicJsonDocument doc(512);
  doc["ssid"] = name;
  doc["password"] = password;
  String blob;
  serializeJson(doc, blob);
  if (!prefs.putString("network", blob)) return false;
  ssid = name;
  wifiPassword = password;
  return true;
}
bool ConfigManager::saveCloud(const String& folder, const String& user, const String& password,
                              const String& ca) {
  DynamicJsonDocument doc(24576);
  backup(doc.to<JsonObject>(), true);
  auto cloud = doc["cloud"];
  cloud["folder"] = folder;
  cloud["user"] = user;
  cloud["password"] = password;
  cloud["ca"] = ca;
  String error;
  return applyProfile(doc, true, true, error);
}
bool ConfigManager::saveHostname(const String& name) {
  DynamicJsonDocument doc(24576);
  backup(doc.to<JsonObject>(), true);
  doc["hostname"] = name;
  String error;
  return applyProfile(doc, true, true, error);
}
bool ConfigManager::saveAccessPassword(const String& password) {
  if (!prefs.putString("access", password)) return false;
  accessPassword = password;
  return true;
}
bool ConfigManager::saveAuthEnabled(bool enabled) {
  if (!prefs.putBool("auth-enabled", enabled)) return false;
  authEnabled = enabled;
  return true;
}
bool ConfigManager::reset() {
  return prefs.clear();
}
