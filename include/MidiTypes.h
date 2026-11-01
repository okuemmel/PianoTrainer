#pragma once
#include <cstdint>

enum class MidiSource : uint8_t { Web, Din, Usb, Count };
enum class MidiEventType : uint8_t { NoteOff, NoteOn, ControlChange, ActiveSensing, SourceReset };
inline constexpr const char* midiSourceName(MidiSource source) {
  return source == MidiSource::Web ? "web" : source == MidiSource::Din ? "din" : "usb";
}

struct MidiEvent {
  uint8_t note, velocity, channel;
  bool on;
  MidiSource source;
  uint64_t receivedUs;
  MidiEventType type;
  constexpr MidiEvent(uint8_t note = 0, uint8_t velocity = 0, uint8_t channel = 1, bool on = false,
                      MidiSource source = MidiSource::Web, uint64_t receivedUs = 0)
      : note(note),
        velocity(velocity),
        channel(channel),
        on(on && velocity > 0),
        source(source),
        receivedUs(receivedUs),
        type(on && velocity > 0 ? MidiEventType::NoteOn : MidiEventType::NoteOff) {}
};
