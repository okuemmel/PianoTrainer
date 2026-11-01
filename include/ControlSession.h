#pragma once
#include <cstdint>
#include <string>
#include <string_view>

class ControlSession {
 public:
  static constexpr uint32_t Timeout = 30000;
  static bool valid(std::string_view key) {
    if (key.size() != 32) return false;
    for (const char c : key)
      if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
    return true;
  }
  bool active(uint32_t now) const {
    return !owner.empty() && uint32_t(now - touched) < Timeout;
  }
  bool claim(std::string_view key, uint32_t now, bool takeover) {
    if (!valid(key) || (active(now) && owner != key && !takeover)) return false;
    owner = std::string(key);
    touched = now;
    return true;
  }
  bool renew(std::string_view key, uint32_t now) {
    if (!valid(key) || owner != key) return false;
    touched = now;
    return true;
  }

 private:
  std::string owner;
  uint32_t touched = 0;
};
