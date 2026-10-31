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
  const auto storedHostname = prefs.getString("hostname", "midi-trainer");
  if (validHostname(std::string_view(storedHostname.c_str(), storedHostname.length())))
    hostname = storedHostname;
  accessPassword = prefs.getString("access", "admin");
  DynamicJsonDocument network(512);
  if (!deserializeJson(network, prefs.getString("network", "{}"))) {
    ssid = network["ssid"] | "";
    wifiPassword = network["password"] | "";
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
bool ConfigManager::saveLed(const LedConfig& next) {
  if (validate(next)) return false;
  DynamicJsonDocument doc(8192);
  encode(doc.to<JsonObject>(), next);
  String json;
  serializeJson(doc, json);
  if (!prefs.putString("led", json)) return false;
  led = next;
  return true;
}
bool ConfigManager::saveWifi(const String& name, const String& password) {
  // One NVS record avoids torn credential pairs after power loss.
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
bool ConfigManager::saveHostname(const String& name) {
  if (!validHostname(std::string_view(name.c_str(), name.length())) ||
      !prefs.putString("hostname", name))
    return false;
  hostname = name;
  return true;
}
bool ConfigManager::saveAccessPassword(const String& password) {
  if (!prefs.putString("access", password)) return false;
  accessPassword = password;
  return true;
}
bool ConfigManager::reset() {
  return prefs.clear();
}
