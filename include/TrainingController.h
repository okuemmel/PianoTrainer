#pragma once
#include <ArduinoJson.h>

#include "LedController.h"
#include "TrainingCatalog.h"
class TrainingController {
 public:
  TrainingController(LedController& leds, const LedConfig& config) : leds(leds), config(config) {}
  TrainingEngine engine;
  String exercise = "Freies Spiel";
  bool start(LearningMode mode, const TrainingSequence& sequence, int bpm, int tolerance,
             bool timed, String& error);
  void stop();
  void pause();
  void resume();
  void receive(const MidiEvent& event);
  void release();
  void loop();
  void status(JsonObject object) const;

 private:
  LedController& leds;
  const LedConfig& config;
  bool ownsLeds = false, lastPulse = false;
  uint32_t renderedRevision = UINT32_MAX, errorAt = 0;
  void render();
};
