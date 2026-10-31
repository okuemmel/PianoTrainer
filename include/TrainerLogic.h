#pragma once
#include <array>
#include <cstdint>

#include "BoardProfile.h"

struct LedConfig {
  int count = 60, pin = 4, brightness = 25, first = 0, keys = 49, baseNote = 48;
  bool reversed = false, rgb = false;
  int channel = 0;  // 0 = all, otherwise 1..16
  // Logical offsets from first; -1 disables the note. Reversal is applied last.
  std::array<int, 128> mapping;
  LedConfig() {
    mapping.fill(-1);
    for (int i = 0; i < keys; ++i) mapping[baseNote + i] = i;
  }
};
inline const char* validate(const LedConfig& c) {
  if (c.count < 1 || c.count > 300) return "LED-Anzahl muss 1–300 sein.";
  if (!BoardProfile::validLedPin(c.pin)) return "GPIO ist für dieses Board nicht freigegeben.";
  if (c.brightness < 1 || c.brightness > 100) return "Helligkeit muss 1–100 % sein.";
  if (c.first < 0 || c.first >= c.count) return "Erste LED liegt außerhalb des Streifens.";
  if (c.keys < 1 || c.keys > 88 || c.baseNote < 0 || c.baseNote + c.keys > 128)
    return "Ungültiger Tastaturbereich.";
  if (c.channel < 0 || c.channel > 16) return "MIDI-Kanal muss 0–16 sein.";
  for (int index : c.mapping)
    if (index < -1 || (index >= 0 && c.first + index >= c.count))
      return "Notenzuordnung liegt außerhalb des Streifens.";
  return nullptr;
}
inline int ledForNote(const LedConfig& c, int note) {
  if (note < 0 || note > 127 || c.mapping[note] < 0) return -1;
  int index = c.first + c.mapping[note];
  if (index >= c.count) return -1;
  return c.reversed ? c.count - 1 - index : index;
}
inline bool acceptsChannel(const LedConfig& c, int channel) {
  return channel >= 1 && channel <= 16 && (c.channel == 0 || c.channel == channel);
}
enum class LearningMode { FreePlay, GuidedLearning, RhythmTraining, SongMode };
