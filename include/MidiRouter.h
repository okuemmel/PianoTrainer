#pragma once
#include <array>
#include <cstddef>

#include "MidiTypes.h"

// One owner (Arduino loop). Hardware callbacks must enqueue, never call this directly.
class MidiRouter {
 public:
  uint32_t received = 0, filtered = 0, rejected = 0, resets = 0;
  MidiEvent last;
  bool hasLast = false;
  std::size_t heldNotes() const {
    std::size_t count = 0;
    for (int note = 0; note < 128; ++note)
      if (velocity(note)) ++count;
    return count;
  }
  template <typename Emit>
  void receive(const MidiEvent& e, int channelFilter, Emit emit) {
    const auto source = static_cast<std::size_t>(e.source);
    if (source >= held.size() ||
        static_cast<unsigned>(e.type) > static_cast<unsigned>(MidiEventType::SourceReset) ||
        e.note > 127 || e.velocity > 127 ||
        (e.type != MidiEventType::SourceReset && e.type != MidiEventType::ActiveSensing &&
         (e.channel < 1 || e.channel > 16))) {
      ++rejected;
      return;
    }
    ++received;
    last = e;
    hasLast = true;
    if (e.type == MidiEventType::SourceReset) {
      release(e.source, e.receivedUs, emit);
      return;
    }
    if (e.type == MidiEventType::ActiveSensing) return;
    if (e.type == MidiEventType::ControlChange) {
      if (e.note == 120 || e.note == 123) releaseChannel(e.source, e.channel, e.receivedUs, emit);
      return;
    }
    auto& own = held[source][e.channel - 1][e.note];
    // Note-Off always cleans up a previously accepted note, even after a filter change.
    if (e.type == MidiEventType::NoteOn && e.on && e.velocity && channelFilter &&
        e.channel != channelFilter) {
      ++filtered;
      return;
    }
    const auto before = velocity(e.note);
    own = e.type == MidiEventType::NoteOn && e.on ? e.velocity : 0;
    const auto after = velocity(e.note);
    if (!before && after)
      emit(MidiEvent(e.note, after, e.channel, true, e.source, e.receivedUs));
    else if (before && !after)
      emit(MidiEvent(e.note, 0, e.channel, false, e.source, e.receivedUs));
  }
  template <typename Emit>
  void release(MidiSource source, uint64_t nowUs, Emit emit) {
    if (static_cast<std::size_t>(source) >= held.size()) return;
    ++resets;
    for (int channel = 1; channel <= 16; ++channel) releaseChannel(source, channel, nowUs, emit);
  }
  void clear() {
    for (auto& source : held)
      for (auto& channel : source) channel.fill(0);
  }

 private:
  std::array<std::array<std::array<uint8_t, 128>, 16>, 3> held{};
  uint8_t velocity(int note) const {
    uint8_t result = 0;
    for (const auto& source : held)
      for (const auto& channel : source)
        if (channel[note] > result) result = channel[note];
    return result;
  }
  template <typename Emit>
  void releaseChannel(MidiSource source, int channel, uint64_t nowUs, Emit emit) {
    auto& notes = held[static_cast<std::size_t>(source)][channel - 1];
    for (int note = 0; note < 128; ++note) {
      if (!notes[note]) continue;
      notes[note] = 0;
      if (!velocity(note)) emit(MidiEvent(note, 0, channel, false, source, nowUs));
    }
  }
};
