#pragma once
#include <WebServer.h>

#include "ConfigManager.h"
#include "MidiInput.h"
#include "RemoteLibrary.h"
#include "WiFiManager.h"
class TrainerWebServer {
 public:
  TrainerWebServer(ConfigManager& c, WiFiManager& w, LedController& l, SimulatedMidiInput& m,
                   TrainingController& t)
      : config(c), wifi(w), leds(l), midi(m), training(t) {}
  void begin(bool filesystemReady);
  void loop();

 private:
  WebServer server{80};
  RemoteLibrary library;
  void libraryRoutes();
  void lessonRoutes();
  void recordCompletedLesson();
  void trainingSnapshot(JsonObject object);
  int activeLesson = -1;
  uint32_t lessonRun = 0;
  bool lessonRecorded = false, lessonSaved = false;
  ConfigManager& config;
  WiFiManager& wifi;
  LedController& leds;
  SimulatedMidiInput& midi;
  TrainingController& training;
  void trainingStatus();
  void trainingCommand();
  bool fsReady = false;
  uint32_t rebootAt = 0;
  bool auth(bool mutation = false);
  bool body(JsonDocument& doc, size_t maxBytes = 6144);
  void json(int code, JsonDocument& doc);
  void error(int code, const String& message);
  void status();
  void ledStatus(JsonObject object) const;
  void ledReply();
  void file(const char* path, const char* mime);
};
