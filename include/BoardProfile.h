#pragma once
#include <array>
namespace BoardProfile {
// Conservative allowlist: exposed pins, excluding strapping, USB and flash.
inline constexpr std::array<int, 10> ledPins{0, 1, 3, 4, 5, 6, 7, 10, 20, 21};
inline constexpr const char* name = "ESP32-C3 SuperMini";
inline bool validLedPin(int pin) {
  for (auto allowed : ledPins)
    if (pin == allowed) return true;
  return false;
}
}  // namespace BoardProfile
