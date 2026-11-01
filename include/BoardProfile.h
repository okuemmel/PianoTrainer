#pragma once
#include <array>
namespace BoardProfile {
// Module-level candidates; verify the particular carrier board before wiring.
#if defined(TRAINER_BOARD_S3_N16R8)
inline constexpr std::array<int, 18> ledPins{1,  2,  4,  5,  6,  7,  8,  9,  10,
                                             11, 12, 13, 14, 15, 16, 17, 18, 21};
inline constexpr const char* name = "ESP32-S3 DevC-1 N16R8";
inline constexpr const char* target = "esp32s3";
inline constexpr const char* layout = "s3-n16r8-v1";
inline constexpr unsigned imageChipId = 9;
inline constexpr int bootPin = 0;
#elif defined(CONFIG_IDF_TARGET_ESP32S3)
#error "ESP32-S3 requires the explicit TRAINER_BOARD_S3_N16R8 profile"
#else
// C3 v1 regression profile, excluding strapping, USB and flash.
inline constexpr std::array<int, 10> ledPins{0, 1, 3, 4, 5, 6, 7, 10, 20, 21};
inline constexpr const char* name = "ESP32-C3 SuperMini";
inline constexpr const char* target = "esp32c3";
inline constexpr const char* layout = "c3-v1";
inline constexpr unsigned imageChipId = 5;
inline constexpr int bootPin = 9;
#endif
inline bool validLedPin(int pin) {
  for (auto allowed : ledPins)
    if (pin == allowed) return true;
  return false;
}
}  // namespace BoardProfile
