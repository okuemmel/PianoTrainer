#pragma once
#include "MidiTypes.h"

// MIDI 1.0 byte stream; bounded state, no SysEx allocation or per-note timers.
class MidiByteParser {
 public:
  explicit MidiByteParser(MidiSource source) : source(source) {}
  uint32_t messages = 0, malformed = 0, ignored = 0;
  void reset() {
    status = used = needed = 0;
    sysex = pending = false;
  }
  template <typename Emit>
  void feed(uint8_t byte, uint64_t nowUs, Emit emit) {
    if (byte >= 0xf8) {
      if (byte == 0xfe || byte == 0xff) {
        MidiEvent e(0, 0, 0, false, source, nowUs);
        e.type = byte == 0xfe ? MidiEventType::ActiveSensing : MidiEventType::SourceReset;
        emit(e);
        if (byte == 0xff) reset();
      } else
        ++ignored;
      return;  // Realtime never consumes or cancels running status.
    }
    if (byte & 0x80) {
      if (pending || (sysex && byte != 0xf7)) ++malformed;
      used = needed = 0;
      pending = false;
      sysex = false;
      status = byte;
      if (byte < 0xf0) {
        needed = (byte & 0xe0) == 0xc0 ? 1 : 2;
        pending = true;
      } else if (byte == 0xf0)
        sysex = true;
      else if (byte == 0xf1 || byte == 0xf3) {
        needed = 1;
        pending = true;
      } else if (byte == 0xf2) {
        needed = 2;
        pending = true;
      } else {
        status = 0;
        if (byte == 0xf4 || byte == 0xf5)
          ++malformed;
        else
          ++ignored;
      }
      return;
    }
    if (sysex) {
      ++ignored;
      return;
    }
    if (!needed) {
      ++malformed;
      return;
    }
    pending = true;
    data[used++] = byte;
    if (used != needed) return;
    ++messages;
    const uint8_t command = status & 0xf0;
    if (command == 0x80 || command == 0x90 || command == 0xb0) {
      MidiEvent e(data[0], data[1], (status & 15) + 1, command == 0x90, source, nowUs);
      if (command == 0xb0) e.type = MidiEventType::ControlChange;
      emit(e);
    } else
      ++ignored;
    used = 0;
    pending = false;
    if (status >= 0xf0) status = needed = 0;
  }

 private:
  MidiSource source;
  uint8_t status = 0, used = 0, needed = 0, data[2]{};
  bool sysex = false, pending = false;
};
