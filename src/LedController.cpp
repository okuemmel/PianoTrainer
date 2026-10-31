#include "LedController.h"

String LedController::rgbFrame() const {
  // Read the actual, brightness-scaled output buffer and normalize GRB/RGB to RGB.
  // This is the requested frame, not an electrical measurement of the strip.
  String frame;
  const auto count = pixels.numPixels();
  if (!frame.reserve(count * 6)) return frame;
  const uint8_t* data = pixels.getPixels();
  if (!data) return frame;
  constexpr char hex[] = "0123456789abcdef";
  const int offsets[] = {config.rgb ? 0 : 1, config.rgb ? 1 : 0, 2};
  for (uint16_t i = 0; i < count; ++i) {
    for (int offset : offsets) {
      const uint8_t value = data[i * 3 + offset];
      frame += hex[value >> 4];
      frame += hex[value & 15];
    }
  }
  return frame;
}
bool LedController::configure(const LedConfig& c) {
  off();
  pixels.updateType((c.rgb ? NEO_RGB : NEO_GRB) + NEO_KHZ800);
  pixels.updateLength(c.count);
  if (pixels.numPixels() != c.count) return false;
  pixels.setPin(c.pin);
  pixels.begin();
  config = c;
  pixels.setBrightness(c.brightness * 255 / 100);
  off();
  Serial.printf("[LED] Konfiguriert: GPIO %d, %d LEDs, %s, %d %%, WS2812B/800 kHz.\n", c.pin,
                c.count, c.rgb ? "RGB" : "GRB", c.brightness);
  return true;
}
void LedController::off() {
  mode = "off";
  notes.fill(0);
  pixels.clear();
  pixels.setBrightness(config.brightness * 255 / 100);
  pixels.show();
}
void LedController::single(int index, uint32_t c) {
  off();
  mode = "single";
  pixels.setPixelColor(index, c);
  pixels.show();
  Serial.printf("[LED] Einzeltest: Index %d, Farbe #%06lx, GPIO %d.\n", index,
                static_cast<unsigned long>(c), config.pin);
}
void LedController::fill(uint32_t c) {
  off();
  mode = "color";
  pixels.fill(c);
  pixels.show();
  Serial.printf("[LED] Vollfarbe: #%06lx, GPIO %d, %d LEDs.\n", static_cast<unsigned long>(c),
                config.pin, config.count);
}
void LedController::start(const String& name, uint32_t c) {
  off();
  mode = name;
  color = c;
  step = 0;
  last = millis() - 1000;
  Serial.printf("[LED] Animation: %s, GPIO %d.\n", name.c_str(), config.pin);
}
void LedController::diagnostic() {
  off();
  mode = "diagnostic";
  pixels.setBrightness(min(config.brightness, 10) * 255 / 100);
  step = 0;
  last = millis() - 1000;
  Serial.printf("[LED] Direkttest startet: erste LED (Index 0), GPIO %d, maximal 10 %%.\n",
                config.pin);
}
void LedController::note(int n, int velocity) {
  if (n < 0 || n > 127) return;
  if (mode != "notes") {
    off();
    mode = "notes";
  }
  notes[n] = velocity;
  renderNotes();
}
void LedController::renderNotes() {
  pixels.clear();
  // Multiple notes may map to one LED; use the strongest active velocity.
  for (int i = 0; i < config.count; ++i) {
    int v = 0;
    for (int n = 0; n < 128; ++n)
      if (ledForNote(config, n) == i && notes[n] > v) v = notes[n];
    if (v) pixels.setPixelColor(i, 0, v * 2, v);
  }
  pixels.show();
}
void LedController::loop() {
  uint32_t interval = mode == "diagnostic" ? 1000 : mode == "brightness" ? 40 : 150;
  if (mode != "sequence" && mode != "chase" && mode != "brightness" && mode != "colors" &&
      mode != "diagnostic")
    return;
  if (millis() - last < interval) return;
  last = millis();
  pixels.clear();
  if (mode == "diagnostic") {
    if (step >= 3) {
      off();
      Serial.println(
          "[LED] Direkttest beendet. Sichtbares Leuchten muss am Streifen geprüft werden.");
      return;
    }
    const uint32_t colors[] = {0xff0000, 0x00ff00, 0x0000ff};
    const char* names[] = {"Rot", "Grün", "Blau"};
    pixels.setPixelColor(0, colors[step]);
    Serial.printf("[LED] Direkttest: %s.\n", names[step]);
    ++step;
  } else if (mode == "sequence" || mode == "chase") {
    pixels.setPixelColor(step % config.count, color);
    ++step;
    if (mode == "sequence" && step > config.count) {
      off();
      return;
    }
  } else if (mode == "colors") {
    const uint32_t colors[] = {0xff0000, 0x00ff00, 0x0000ff, 0xffffff};
    pixels.fill(colors[(step++ / 7) % 4]);
  } else {
    int level = step % 50;
    level = level <= 25 ? level : 50 - level;
    ++step;
    uint8_t v = level * 255 / 25;
    pixels.fill(pixels.Color(v, v, v));
  }
  pixels.show();
}

void LedController::trainingFrame(const std::array<uint8_t, 128>& played,
                                  const std::array<bool, 128>& targets, int wrongNote, bool pulse) {
  mode = "training";
  pixels.setBrightness(config.brightness * 255 / 100);
  pixels.clear();
  for (int i = 0; i < config.count; ++i) {
    int r = 0, g = 0, b = 0;
    for (int n = 0; n < 128; ++n)
      if (ledForNote(config, n) == i) {
        if (targets[n]) {
          g = max(g, pulse ? 100 : 35);
          b = max(b, pulse ? 255 : 150);
        }
        if (played[n]) {
          g = max(g, int(played[n]) * 2);
          b = max(b, int(played[n]) / 2);
        }
        if (n == wrongNote) {
          r = 255;
          g = 0;
          b = 0;
          break;
        }
      }
    pixels.setPixelColor(i, r, g, b);
  }
  pixels.show();
}
