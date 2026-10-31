#pragma once
#include <Arduino.h>

#include "TrainingController.h"
class MidiInput {
 public:
  virtual ~MidiInput() = default;
  virtual void loop() = 0;
};
// USB-host MIDI can later forward the same MidiEvent to TrainingController.
class SimulatedMidiInput final : public MidiInput {
 public:
  SimulatedMidiInput(TrainingController& training, const LedConfig& config)
      : training(training), config(config) {}
  void receive(const MidiEvent& event) {
    if (event.note > 127 || event.velocity > 127 || !acceptsChannel(config, event.channel)) return;
    training.receive(event);
    last = millis();
    active = true;
  }
  void keepAlive() {
    last = millis();
    active = true;
  }
  void release() {
    training.release();
    active = training.engine.running();
    last = millis();
  }
  void loop() override {
    if (active && millis() - last > 3000) {
      training.release();
      training.pause();
      active = false;
    }
  }

 private:
  TrainingController& training;
  const LedConfig& config;
  uint32_t last = 0;
  bool active = false;
};
