#include <unity.h>

#include <vector>

#include "MidiByteParser.h"
#include "MidiRouter.h"
#include "TrainingEngine.h"
#include "UsbMidiProtocol.h"
void setUp() {}
void tearDown() {}
using Events = std::vector<MidiEvent>;
void feed(MidiByteParser& parser, Events& events, std::initializer_list<uint8_t> bytes) {
  uint64_t now = 1000;
  for (auto byte : bytes)
    parser.feed(byte, now++, [&](const MidiEvent& e) { events.push_back(e); });
}
void running_status_and_realtime() {
  MidiByteParser parser(MidiSource::Din);
  Events events;
  feed(parser, events, {0x92, 60, 0xf8, 100, 61, 90, 60, 0, 0x82, 61, 64});
  TEST_ASSERT_EQUAL(4, events.size());
  TEST_ASSERT_EQUAL(3, events[0].channel);
  TEST_ASSERT_EQUAL(60, events[0].note);
  TEST_ASSERT_EQUAL(1003, events[0].receivedUs);
  TEST_ASSERT_EQUAL((int)MidiSource::Din, (int)events[0].source);
  TEST_ASSERT_EQUAL((int)MidiEventType::NoteOff, (int)events[2].type);
  TEST_ASSERT_FALSE(events[2].on);
  TEST_ASSERT_EQUAL(0, parser.malformed);
}
void channel_messages_do_not_desynchronize() {
  MidiByteParser parser(MidiSource::Din);
  Events events;
  feed(parser, events,
       {0xc0, 5, 6, 0xd0, 20, 0xe0, 0, 64, 0xa0, 60, 90, 0xb0, 64, 127, 0x9f, 70, 120});
  TEST_ASSERT_EQUAL(2, events.size());
  TEST_ASSERT_EQUAL((int)MidiEventType::ControlChange, (int)events[0].type);
  TEST_ASSERT_EQUAL(64, events[0].note);
  TEST_ASSERT_EQUAL(16, events[1].channel);
  TEST_ASSERT_EQUAL(0, parser.malformed);
}
void sysex_system_common_and_recovery() {
  MidiByteParser parser(MidiSource::Din);
  Events events;
  feed(parser, events, {1,    0x90, 60,   0x80, 60, 0, 0xf0, 1, 2,    0xf8, 3,
                        0xf7, 4,    0xf2, 1,    2,  3, 0xf1, 4, 0x90, 65,   100});
  TEST_ASSERT_EQUAL(2, events.size());
  TEST_ASSERT_EQUAL(65, events.back().note);
  TEST_ASSERT_EQUAL(4, parser.malformed);
  parser.reset();
  feed(parser, events, {65, 100});
  TEST_ASSERT_EQUAL(2, events.size());
}
void active_sensing_and_reset() {
  MidiByteParser parser(MidiSource::Din);
  Events events;
  feed(parser, events, {0x90, 60, 0xfe, 100, 0xff, 61, 100});
  TEST_ASSERT_EQUAL(3, events.size());
  TEST_ASSERT_EQUAL((int)MidiEventType::ActiveSensing, (int)events[0].type);
  TEST_ASSERT_EQUAL((int)MidiEventType::SourceReset, (int)events[2].type);
  TEST_ASSERT_EQUAL(2, parser.malformed);
}
void independent_sources_and_channels() {
  MidiRouter router;
  Events events;
  auto emit = [&](const MidiEvent& e) { events.push_back(e); };
  router.receive({60, 100, 1, true, MidiSource::Web}, 0, emit);
  router.receive({60, 90, 1, true, MidiSource::Din}, 0, emit);
  router.receive({60, 80, 2, true, MidiSource::Din}, 0, emit);
  router.receive({60, 100, 1, true, MidiSource::Web}, 0, emit);
  TEST_ASSERT_EQUAL(1, events.size());
  router.release(MidiSource::Web, 1234, emit);
  router.receive({60, 0, 1, false, MidiSource::Din}, 0, emit);
  TEST_ASSERT_EQUAL(1, events.size());
  TEST_ASSERT_EQUAL(1, router.heldNotes());
  router.release(MidiSource::Din, 2000, emit);
  TEST_ASSERT_EQUAL(2, events.size());
  TEST_ASSERT_FALSE(events.back().on);
  TEST_ASSERT_EQUAL(2000, events.back().receivedUs);
  TEST_ASSERT_EQUAL(0, router.heldNotes());
}
void filter_and_channel_panic() {
  MidiRouter router;
  Events events;
  auto emit = [&](const MidiEvent& e) { events.push_back(e); };
  router.receive({60, 100, 1, true}, 1, emit);
  router.receive({61, 100, 2, true}, 1, emit);
  router.receive({62, 100, 2, true, MidiSource::Din}, 0, emit);
  MidiEvent panic(123, 0, 1, false);
  panic.type = MidiEventType::ControlChange;
  router.receive(panic, 2, emit);
  TEST_ASSERT_EQUAL(1, router.heldNotes());
  router.receive({62, 0, 2, false, MidiSource::Din}, 1, emit);
  TEST_ASSERT_EQUAL(0, router.heldNotes());
  TEST_ASSERT_EQUAL(1, router.filtered);
}
void invalid_events_and_ten_note_chords() {
  MidiRouter router;
  Events events;
  auto emit = [&](const MidiEvent& e) { events.push_back(e); };
  router.receive({128, 100, 1, true}, 0, emit);
  router.receive({60, 128, 1, true}, 0, emit);
  router.receive({60, 100, 0, true}, 0, emit);
  router.receive({60, 100, 17, true}, 0, emit);
  router.receive({60, 100, 1, true, MidiSource::Count}, 0, emit);
  TEST_ASSERT_EQUAL(5, router.rejected);
  for (int n = 40; n < 50; ++n)
    router.receive({uint8_t(n), 100, 1, true, MidiSource::Usb}, 0, emit);
  TEST_ASSERT_EQUAL(10, router.heldNotes());
  router.release(MidiSource::Usb, 0, emit);
  TEST_ASSERT_EQUAL(20, events.size());
  TEST_ASSERT_EQUAL(0, router.heldNotes());
}
void repeated_attacks_and_burst() {
  MidiByteParser parser(MidiSource::Din);
  MidiRouter router;
  unsigned ons = 0, offs = 0;
  for (int i = 0; i < 10000; ++i) {
    for (auto byte : {0x90, 60, 100, 60, 0})
      parser.feed(byte, i, [&](const MidiEvent& e) {
        router.receive(e, 0, [&](const MidiEvent& out) {
          if (out.on)
            ++ons;
          else
            ++offs;
        });
      });
  }
  TEST_ASSERT_EQUAL(10000, ons);
  TEST_ASSERT_EQUAL(ons, offs);
  TEST_ASSERT_EQUAL(0, router.heldNotes());
  TEST_ASSERT_EQUAL(0, parser.malformed);
}
void usb_packets_validate_cin_cable_and_bytes() {
  UsbMidiPackets parser;
  Events events;
  const uint8_t data[]{9,  0x90, 60, 100, 8, 0x80, 60,   20,   9,  0x90,
                       61, 0,    0,  0,   0, 0,    0x19, 0x90, 62, 100};
  parser.receive(data, sizeof(data), 999, [&](const MidiEvent& e) { events.push_back(e); });
  TEST_ASSERT_EQUAL(3, events.size());
  TEST_ASSERT_EQUAL(999, events[0].receivedUs);
  TEST_ASSERT_EQUAL((int)MidiSource::Usb, (int)events[0].source);
  TEST_ASSERT_EQUAL(1, parser.unsupportedCable);
  const uint8_t bad[]{9, 0x80, 60, 100, 9, 0x90, 0x80, 100};
  parser.receive(bad, sizeof(bad), 0, [&](const MidiEvent& e) { events.push_back(e); });
  parser.receive(data, 5, 0, [&](const MidiEvent& e) { events.push_back(e); });
  TEST_ASSERT_EQUAL(3, parser.malformed);
  TEST_ASSERT_EQUAL(3, events.size());
}
void usb_sysex_cannot_inject_running_notes() {
  UsbMidiPackets parser;
  Events events;
  const uint8_t data[]{9,  0x90, 60, 100, 4, 61, 100, 62,   4, 0xf0, 1,  2,
                       15, 0xf8, 0,  0,   7, 3,  4,   0xf7, 9, 0x90, 61, 100};
  parser.receive(data, sizeof(data), 0, [&](const MidiEvent& e) { events.push_back(e); });
  TEST_ASSERT_EQUAL(2, events.size());
  TEST_ASSERT_EQUAL(1, parser.malformed);
  TEST_ASSERT_EQUAL(0, parser.bytes.malformed);
}
std::vector<uint8_t> descriptor() {
  std::vector<uint8_t> d{
      9,  2, 0, 0,    1,    1, 0, 0x80, 50, 9,    4,    2, 0,  2, 1, 3, 0, 0, 7,    0x24, 1, 0,  1,
      22, 0, 6, 0x24, 2,    1, 1, 0,    9,  0x24, 3,    1, 2,  1, 1, 1, 0, 9, 5,    0x81, 2, 64, 0,
      0,  0, 0, 5,    0x25, 1, 1, 2,    9,  5,    0x01, 2, 64, 0, 0, 0, 0, 5, 0x25, 1,    1, 1};
  d[2] = d.size();
  return d;
}
void usb_descriptor_selects_input_and_composite() {
  auto data = descriptor();
  UsbMidiEndpoint endpoint;
  TEST_ASSERT_EQUAL((int)UsbMidiDescriptorResult::Ready,
                    (int)usbMidiEndpoint(data.data(), data.size(), endpoint));
  TEST_ASSERT_EQUAL(2, endpoint.interfaceNumber);
  TEST_ASSERT_EQUAL(0x81, endpoint.address);
  TEST_ASSERT_EQUAL(64, endpoint.packetSize);
  data.insert(data.end(), {9, 4, 3, 0, 0, 3, 0, 0, 0});
  data[2] = data.size();
  TEST_ASSERT_EQUAL((int)UsbMidiDescriptorResult::Ready,
                    (int)usbMidiEndpoint(data.data(), data.size(), endpoint));
}
void usb_descriptor_rejects_malformed_and_unsupported() {
  auto original = descriptor();
  UsbMidiEndpoint endpoint;
  for (size_t size = 0; size < original.size(); ++size)
    TEST_ASSERT_NOT_EQUAL((int)UsbMidiDescriptorResult::Ready,
                          (int)usbMidiEndpoint(original.data(), size, endpoint));
  for (auto change : std::vector<std::pair<int, int>>{
           {9, 0}, {12, 1}, {16, 1}, {21, 2}, {44, 3}, {45, 128}, {42, 128}, {52, 2}, {53, 99}}) {
    auto data = original;
    data[change.first] = change.second;
    TEST_ASSERT_NOT_EQUAL((int)UsbMidiDescriptorResult::Ready,
                          (int)usbMidiEndpoint(data.data(), data.size(), endpoint));
  }
  original[14] = 3;
  TEST_ASSERT_EQUAL((int)UsbMidiDescriptorResult::NotMidi,
                    (int)usbMidiEndpoint(original.data(), original.size(), endpoint));
}
void common_router_drives_existing_engine() {
  MidiRouter router;
  TrainingEngine engine;
  auto emit = [&](const MidiEvent& event) { engine.receive(event, 100); };
  router.receive({60, 100, 1, true, MidiSource::Web}, 0, emit);
  router.receive({60, 90, 2, true, MidiSource::Din}, 0, emit);
  TEST_ASSERT_TRUE(engine.held[60]);
  router.release(MidiSource::Web, 123, emit);
  TEST_ASSERT_TRUE(engine.held[60]);
  router.release(MidiSource::Din, 124, emit);
  TEST_ASSERT_FALSE(engine.held[60]);
  router.receive({60, 100, 1, true, MidiSource::Usb}, 0, emit);
  TEST_ASSERT_TRUE(engine.held[60]);
  MidiEvent reset(0, 0, 0, false, MidiSource::Usb);
  reset.type = MidiEventType::SourceReset;
  router.receive(reset, 0, emit);
  TEST_ASSERT_FALSE(engine.held[60]);
}
int main() {
  UNITY_BEGIN();
  RUN_TEST(running_status_and_realtime);
  RUN_TEST(channel_messages_do_not_desynchronize);
  RUN_TEST(sysex_system_common_and_recovery);
  RUN_TEST(active_sensing_and_reset);
  RUN_TEST(independent_sources_and_channels);
  RUN_TEST(filter_and_channel_panic);
  RUN_TEST(invalid_events_and_ten_note_chords);
  RUN_TEST(repeated_attacks_and_burst);
  RUN_TEST(usb_packets_validate_cin_cable_and_bytes);
  RUN_TEST(usb_sysex_cannot_inject_running_notes);
  RUN_TEST(usb_descriptor_selects_input_and_composite);
  RUN_TEST(usb_descriptor_rejects_malformed_and_unsupported);
  RUN_TEST(common_router_drives_existing_engine);
  return UNITY_END();
}
