#pragma once
#include <cstdint>

struct MidiEvent {
  uint8_t note, velocity, channel;
  bool on;
};
