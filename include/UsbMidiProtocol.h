#pragma once
#include <array>
#include <cstddef>

#include "MidiByteParser.h"

// USB-MIDI 1.0, full-speed bulk input, cable 0 only. MIDI 2.0/UMP is not supported.
class UsbMidiPackets {
 public:
  MidiByteParser bytes{MidiSource::Usb};
  uint32_t malformed = 0, unsupportedCable = 0;
  void reset() {
    bytes.reset();
    sysex = false;
  }
  template <typename Emit>
  void receive(const uint8_t* data, std::size_t size, uint64_t nowUs, Emit emit) {
    if (!data || size % 4) {
      ++malformed;
      reset();
      return;
    }
    for (std::size_t offset = 0; offset < size; offset += 4) {
      const auto* p = data + offset;
      if (!(p[0] | p[1] | p[2] | p[3])) continue;  // Empty transfer padding.
      if (p[0] >> 4) {
        ++unsupportedCable;
        continue;
      }
      const uint8_t cin = p[0] & 15;
      int length = 0;
      bool valid = false;
      if (cin >= 8 && cin <= 14) {
        length = cin == 12 || cin == 13 ? 2 : 3;
        valid = (p[1] >> 4) == cin;
        for (int i = 2; i <= length; ++i) valid &= p[i] < 128;
      } else if (cin == 2) {
        length = 2;
        valid = (p[1] == 0xf1 || p[1] == 0xf3) && p[2] < 128;
      } else if (cin == 3) {
        length = 3;
        valid = p[1] == 0xf2 && p[2] < 128 && p[3] < 128;
      } else if (cin == 4) {
        length = 3;
        valid = (p[1] == 0xf0 || (sysex && p[1] < 128)) && p[2] < 128 && p[3] < 128;
      } else if (cin == 5) {
        length = 1;
        valid = p[1] == 0xf6 || (sysex && p[1] == 0xf7);
      } else if (cin == 6) {
        length = 2;
        valid = (p[1] == 0xf0 || (sysex && p[1] < 128)) && p[2] == 0xf7;
      } else if (cin == 7) {
        length = 3;
        valid = (p[1] == 0xf0 || (sysex && p[1] < 128)) && p[2] < 128 && p[3] == 0xf7;
      } else if (cin == 15) {
        length = 1;
        valid = p[1] >= 0xf8;
      }
      if (!valid) {
        ++malformed;
        reset();
        continue;
      }
      // Running status must not cross USB event packets; channel messages are complete.
      for (int i = 1; i <= length; ++i) bytes.feed(p[i], nowUs, emit);
      if (cin != 15)
        sysex = cin == 4;
      else if (p[1] == 0xff)
        sysex = false;
    }
  }

 private:
  bool sysex = false;
};

struct UsbMidiEndpoint {
  uint8_t interfaceNumber = 0, address = 0;
  uint16_t packetSize = 0;
};
enum class UsbMidiDescriptorResult { Ready, NotMidi, Unsupported, Malformed };
inline UsbMidiDescriptorResult usbMidiEndpoint(const uint8_t* data, std::size_t size,
                                               UsbMidiEndpoint& out) {
  out = {};
  if (!data || size < 9 || size > 4096 || data[0] != 9 || data[1] != 2 ||
      (std::size_t(data[2]) | (std::size_t(data[3]) << 8)) != size)
    return UsbMidiDescriptorResult::Malformed;
  bool midi = false, header = false, endpoint = false, associated = false, foundMidi = false;
  UsbMidiEndpoint candidate;
  std::array<bool, 256> jackIds{}, embeddedOutputs{};
  uint8_t associatedJack = 0;
  int interfaces = 0, selectedEndpoints = 0;
  for (std::size_t offset = 9; offset < size;) {
    if (offset + 2 > size || data[offset] < 2 || offset + data[offset] > size)
      return UsbMidiDescriptorResult::Malformed;
    const auto* d = data + offset;
    if (d[1] == 4) {
      if (d[0] < 9) return UsbMidiDescriptorResult::Malformed;
      if (midi && (!header || selectedEndpoints != 1 || !associated))
        return UsbMidiDescriptorResult::Unsupported;
      midi = d[5] == 1 && d[6] == 3;
      if (midi) {
        foundMidi = true;
        if (d[3] != 0 || d[7] != 0 || ++interfaces != 1)
          return UsbMidiDescriptorResult::Unsupported;
        candidate.interfaceNumber = d[2];
      }
    } else if (midi && d[1] == 0x24 && d[0] >= 3 && d[2] == 1) {
      if (d[0] < 7) return UsbMidiDescriptorResult::Malformed;
      if (d[3] != 0 || d[4] != 1) return UsbMidiDescriptorResult::Unsupported;
      header = true;
    } else if (midi && d[1] == 0x24 && d[0] >= 3 && (d[2] == 2 || d[2] == 3)) {
      if (d[0] < 6 || !d[4] || jackIds[d[4]] || (d[3] != 1 && d[3] != 2))
        return UsbMidiDescriptorResult::Malformed;
      if (d[2] == 3 && (d[0] < 7 || d[0] < 7 + 2 * d[5])) return UsbMidiDescriptorResult::Malformed;
      jackIds[d[4]] = true;
      if (d[2] == 3 && d[3] == 1) embeddedOutputs[d[4]] = true;
    } else if (midi && d[1] == 5) {
      if (d[0] < 7) return UsbMidiDescriptorResult::Malformed;
      if (d[2] & 0x80) {
        const unsigned packet = unsigned(d[4]) | (unsigned(d[5]) << 8);
        if ((d[3] & 3) != 2 || !(d[2] & 15) || (d[2] & 0x70) || packet < 4 || packet > 64 ||
            packet % 4 || ++selectedEndpoints != 1)
          return UsbMidiDescriptorResult::Unsupported;
        candidate.address = d[2];
        candidate.packetSize = packet;
        endpoint = true;
      } else
        endpoint = false;
    } else if (midi && endpoint && d[1] == 0x25) {
      if (d[0] < 4 || d[2] != 1 || d[0] < 4 + d[3]) return UsbMidiDescriptorResult::Malformed;
      if (d[3] != 1) return UsbMidiDescriptorResult::Unsupported;
      associated = true;
      associatedJack = d[4];
    }
    offset += d[0];
  }
  if (!foundMidi) return UsbMidiDescriptorResult::NotMidi;
  if (!header || !associated || selectedEndpoints != 1 || !embeddedOutputs[associatedJack])
    return UsbMidiDescriptorResult::Unsupported;
  out = candidate;
  return UsbMidiDescriptorResult::Ready;
}
