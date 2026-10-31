#pragma once
#include <Adafruit_NeoPixel.h>

#include "TrainerLogic.h"
class LedController {
 public:
  bool configure(const LedConfig& c);
  void off();
  void single(int index, uint32_t color);
  void fill(uint32_t color);
  void start(const String& mode, uint32_t color);
  void diagnostic();
  void note(int note, int velocity);
  void loop();
  String rgbFrame() const;
  uint16_t count() const {
    return pixels.numPixels();
  }
  int outputBrightnessPercent() const {
    return (pixels.getBrightness() * 100 + 127) / 255;
  }
  void trainingFrame(const std::array<uint8_t, 128>& played, const std::array<bool, 128>& targets,
                     int wrongNote, bool pulse);
  String mode = "off";

 private:
  Adafruit_NeoPixel pixels;
  LedConfig config;
  std::array<uint8_t, 128> notes{};
  uint32_t last = 0, color = 0;
  int step = 0;
  void renderNotes();
};
