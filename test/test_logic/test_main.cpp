#include <unity.h>

#include <string>

#include "ControlSession.h"
#include "LibrarySettings.h"
#include "NetworkSettings.h"
#include "TrainerLogic.h"
void setUp() {}
void tearDown() {}
void defaults_valid() {
  LedConfig c;
  TEST_ASSERT_NULL(validate(c));
  TEST_ASSERT_EQUAL(0, ledForNote(c, 48));
  TEST_ASSERT_EQUAL(48, ledForNote(c, 96));
  TEST_ASSERT_EQUAL(-1, ledForNote(c, 47));
  TEST_ASSERT_EQUAL(-1, ledForNote(c, 128));
  TEST_ASSERT_EQUAL(-1, ledForNote(c, -1));
}
void gpio_allowlist() {
  LedConfig c;
  for (int p = -1; p < 50; ++p) {
    c.pin = p;
    bool expected = p == 0 || p == 1 || p == 3 || p == 4 || p == 5 || p == 6 || p == 7 || p == 10 ||
                    p == 20 || p == 21;
    TEST_ASSERT_EQUAL(expected, validate(c) == nullptr);
  }
}
void boundaries() {
  LedConfig c;
  c.count = 0;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.count = 301;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.count = 60;
  c.brightness = 0;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.brightness = 101;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.brightness = 1;
  c.first = -1;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.first = 60;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.first = 0;
  c.keys = 89;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.keys = 49;
  c.baseNote = 80;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.baseNote = -1;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.baseNote = 48;
  c.channel = 17;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.channel = -1;
  TEST_ASSERT_NOT_NULL(validate(c));
}
void mapping_validation() {
  LedConfig c;
  c.mapping[0] = -2;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.mapping[0] = 60;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.mapping[0] = 59;
  TEST_ASSERT_NULL(validate(c));
  c.first = 1;
  TEST_ASSERT_NOT_NULL(validate(c));
  c.mapping[0] = -1;
  TEST_ASSERT_NULL(validate(c));
}
void reversal_property() {
  LedConfig c;
  for (int size = 49; size <= 300; size++) {
    c.count = size;
    for (int first = 0; first <= size - 49; ++first) {
      c.first = first;
      TEST_ASSERT_NULL(validate(c));
      for (int n = 48; n <= 96; ++n) {
        c.reversed = false;
        int normal = ledForNote(c, n);
        c.reversed = true;
        int reversed = ledForNote(c, n);
        TEST_ASSERT_EQUAL(size - 1, normal + reversed);
        TEST_ASSERT_TRUE(normal >= 0 && normal < size);
        TEST_ASSERT_TRUE(reversed >= 0 && reversed < size);
      }
    }
  }
}
void custom_mapping() {
  LedConfig c;
  c.first = 4;
  c.mapping[48] = 10;
  c.mapping[49] = 10;
  c.mapping[50] = -1;
  TEST_ASSERT_NULL(validate(c));
  TEST_ASSERT_EQUAL(14, ledForNote(c, 48));
  TEST_ASSERT_EQUAL(14, ledForNote(c, 49));
  TEST_ASSERT_EQUAL(-1, ledForNote(c, 50));
  c.reversed = true;
  TEST_ASSERT_EQUAL(45, ledForNote(c, 48));
}
void channels() {
  LedConfig c;
  TEST_ASSERT_FALSE(acceptsChannel(c, 0));
  TEST_ASSERT_FALSE(acceptsChannel(c, 17));
  for (int channel = 1; channel <= 16; ++channel) TEST_ASSERT_TRUE(acceptsChannel(c, channel));
  c.channel = 5;
  for (int channel = 1; channel <= 16; ++channel)
    TEST_ASSERT_EQUAL(channel == 5, acceptsChannel(c, channel));
}
void hostname_boundaries() {
  for (const auto* name : {"piano", "midi-trainer", "piano-2", "a", "123"})
    TEST_ASSERT_TRUE(validHostname(name));
  TEST_ASSERT_TRUE(validHostname(std::string(31, 'a')));
  TEST_ASSERT_FALSE(validHostname(std::string(32, 'a')));
  for (const auto* name : {"", "-piano", "piano-", "piano.local", "piano trainer", "piano_2",
                           "PIANO", "pianö", "http://piano"})
    TEST_ASSERT_FALSE(validHostname(name));
  TEST_ASSERT_FALSE(validHostname(std::string_view("piano\0suffix", 12)));
}
void library_paths() {
  TEST_ASSERT_TRUE(validCollectionPath("/midi/MIDI/song.mid"));
  for (const auto* path : {"https://other.example/a.mid", "/download/a.mid", "/midi/../secret.mid",
                           "/midi/%252e%252e/a.mid", "/midi/a.mid?x=1", "/midi/a%2Fb.mid"})
    TEST_ASSERT_FALSE(validCollectionPath(path));
  TEST_ASSERT_TRUE(validLibraryUrl("https://cloud.example/remote.php/dav/files/user/MIDI/"));
  TEST_ASSERT_TRUE(validLibraryUrl("http://192.168.1.2:8765/MIDI/"));
  for (const auto* url :
       {"ftp://cloud/MIDI/", "https://user:pass@cloud/MIDI/", "https://cloud/MIDI/?token=x",
        "https:///MIDI/", "https://cloud/a b/", "https://cloud/\\evil"})
    TEST_ASSERT_FALSE(validLibraryUrl(url));
  TEST_ASSERT_TRUE(validMidiFilename("Übung 1.MID"));
  for (const auto* name : {"../a.mid", "a/b.mid", "a\\b.mid", "a.txt", ".mid"})
    TEST_ASSERT_FALSE(validMidiFilename(name));
  TEST_ASSERT_FALSE(validMidiFilename(std::string_view("a.mid\0x", 7)));
  TEST_ASSERT_EQUAL_STRING("My%20Song%23%C3%BC.mid", libraryUrlEncode("My Song#ü.mid").c_str());
  TEST_ASSERT_EQUAL_STRING("https://cloud:8443", libraryOrigin("https://cloud:8443/dir/").c_str());
}
void control_session_lease() {
  ControlSession session;
  const std::string a(32, 'a'), b(32, 'b');
  TEST_ASSERT_FALSE(session.claim("bad", 1, true));
  TEST_ASSERT_FALSE(session.renew(a, 1));
  TEST_ASSERT_TRUE(session.claim(a, 10, false));
  TEST_ASSERT_FALSE(session.claim(b, 20, false));
  TEST_ASSERT_TRUE(session.renew(a, 25));
  TEST_ASSERT_TRUE(session.claim(b, 30, true));
  TEST_ASSERT_FALSE(session.renew(a, 31));
  TEST_ASSERT_FALSE(session.claim(a, 32, false));
  TEST_ASSERT_TRUE(session.claim(a, 30030, false));
  TEST_ASSERT_FALSE(session.renew(b, 30031));
  TEST_ASSERT_TRUE(session.claim(b, UINT32_MAX - 100, true));
  TEST_ASSERT_TRUE(session.active(100));
  TEST_ASSERT_FALSE(session.claim(a, 100, false));
  TEST_ASSERT_TRUE(session.claim(a, 30100, false));
}
int main() {
  UNITY_BEGIN();
  RUN_TEST(control_session_lease);
  RUN_TEST(library_paths);
  RUN_TEST(hostname_boundaries);
  RUN_TEST(defaults_valid);
  RUN_TEST(gpio_allowlist);
  RUN_TEST(boundaries);
  RUN_TEST(mapping_validation);
  RUN_TEST(reversal_property);
  RUN_TEST(custom_mapping);
  RUN_TEST(channels);
  return UNITY_END();
}
