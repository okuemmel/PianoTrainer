#pragma once
#include <string_view>

// Arduino-ESP32 2.0.17 caches hostnames in a 32-byte buffer including NUL.
inline bool validHostname(std::string_view name) {
  if (name.empty() || name.size() > 31) return false;
  const auto alphanumeric = [](char c) { return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'); };
  if (!alphanumeric(name.front()) || !alphanumeric(name.back())) return false;
  for (char c : name)
    if (!alphanumeric(c) && c != '-') return false;
  return true;
}
