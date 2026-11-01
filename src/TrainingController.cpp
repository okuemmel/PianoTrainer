#include "TrainingController.h"
namespace {
const char* modeName(LearningMode mode) {
  switch (mode) {
    case LearningMode::GuidedLearning:
      return "guided";
    case LearningMode::RhythmTraining:
      return "rhythm";
    case LearningMode::SongMode:
      return "song";
    default:
      return "free";
  }
}
const char* stateName(TrainingState state) {
  switch (state) {
    case TrainingState::CountIn:
      return "countin";
    case TrainingState::Playing:
      return "playing";
    case TrainingState::Paused:
      return "paused";
    case TrainingState::Completed:
      return "completed";
    default:
      return "idle";
  }
}
const char* feedbackName(TrainingFeedback feedback) {
  switch (feedback) {
    case TrainingFeedback::Correct:
      return "Richtig!";
    case TrainingFeedback::WrongNote:
      return "Falsche Taste – noch einmal versuchen.";
    case TrainingFeedback::TooEarly:
      return "Zu früh – auf den Einsatz warten.";
    case TrainingFeedback::Missed:
      return "Note verpasst.";
    case TrainingFeedback::Paused:
      return "Pausiert";
    case TrainingFeedback::Completed:
      return "Übung abgeschlossen!";
    default:
      return "Bereit";
  }
}
}  // namespace
bool TrainingController::start(LearningMode mode, const TrainingSequence& sequence, int bpm,
                               int tolerance, bool timed, String& error) {
  for (int i = 0; i < sequence.count && i < MaxTrainingSteps; ++i)
    for (int j = 0; j < sequence.steps[i].count && j < MaxChordNotes; ++j) {
      int note = sequence.steps[i].notes[j];
      if (note < config.baseNote || note >= config.baseNote + config.keys ||
          ledForNote(config, note) < 0) {
        error = "Übung enthält eine Note außerhalb der Tastatur oder ohne LED-Zuordnung: " +
                String(note);
        return false;
      }
    }
  if (!engine.start(mode, sequence, bpm, tolerance, timed, millis())) {
    error = "Ungültige Übung, Tempo oder Zeitfenster.";
    return false;
  }
  if (++sequenceId == 0) ++sequenceId;
  previewing = false;
  ownsLeds = true;
  errorAt = 0;
  render();
  return true;
}
void TrainingController::stop() {
  previewing = false;
  exercise = "Freies Spiel";
  engine.stop();
  ownsLeds = false;
  leds.off();
}
void TrainingController::pause() {
  engine.pause(millis());
  render();
}
void TrainingController::resume() {
  previewing = false;
  engine.resume(millis());
  ownsLeds = true;
  render();
}
void TrainingController::release() {
  engine.clearHeld();
  if (ownsLeds) render();
}
void TrainingController::receive(const MidiEvent& event) {
  if (previewing) return;
  if (event.note > 127 || event.velocity > 127 || !acceptsChannel(config, event.channel)) return;
  if (engine.state == TrainingState::Paused || engine.state == TrainingState::Completed) return;
  int errors = engine.wrong;
  engine.receive(event, millis());
  if (engine.wrong != errors) errorAt = millis();
  ownsLeds = true;
  render();
}
void TrainingController::render() {
  if (!ownsLeds) return;
  if (previewing) {
    leds.trainingFrame(previewHeld, {}, -1, false);
    return;
  }
  const bool pulse =
      engine.running() && engine.timed && engine.elapsed(millis()) % engine.beatMs() < 90;
  auto targets = engine.targets();
  const int error =
      engine.lastErrorNote >= 0 && millis() - errorAt < 450 ? engine.lastErrorNote : -1;
  leds.trainingFrame(engine.held, targets, error, pulse);
  renderedRevision = engine.revision;
  lastPulse = pulse;
}
void TrainingController::loop() {
  engine.tick(millis());
  if (previewing) {
    if (millis() - lastPreviewAt >= 3000) stopPreview();
    return;
  }
  if (!ownsLeds) return;
  const bool pulse =
      engine.running() && engine.timed && engine.elapsed(millis()) % engine.beatMs() < 90;
  if (engine.revision != renderedRevision || pulse != lastPulse ||
      (errorAt && millis() - errorAt >= 450)) {
    if (errorAt && millis() - errorAt >= 450) errorAt = 0;
    render();
  }
}
void TrainingController::status(JsonObject o) const {
  const auto now = millis();
  o["sequenceId"] = sequenceId;
  o["exercise"] = exercise;
  o["preview"] = previewing;
  o["mode"] = modeName(engine.mode);
  o["state"] = stateName(engine.state);
  o["feedback"] = feedbackName(engine.feedback);
  o["index"] = engine.index;
  o["total"] = engine.sequence.count;
  o["correct"] = engine.correct;
  o["wrong"] = engine.wrong;
  o["missed"] = engine.missed;
  o["accuracy"] = engine.accuracy();
  o["timed"] = engine.timed;
  o["bpm"] = engine.bpm;
  o["tolerance"] = engine.tolerance;
  o["lastTimingMs"] = engine.lastTimingMs;
  o["averageTimingMs"] = engine.averageTimingMs();
  o["dueInMs"] = engine.running() ? engine.dueInMs(now) : 0;
  o["nextTimeMs"] = engine.dueMs();
  o["beatMs"] = engine.beatMs();
  o["durationMs"] = engine.durationMs();
  o["elapsedMs"] = engine.elapsed(now);
  o["countInMs"] = engine.countInMs();
  o["lastErrorNote"] = engine.lastErrorNote;
  // Small rolling window: keep the complete lesson on the device.
  auto upcoming = o.createNestedArray("upcoming");
  if (engine.state != TrainingState::Idle) {
    for (int i = engine.index; i < engine.sequence.count && i < engine.index + 6; ++i) {
      const auto& step = engine.sequence.steps[i];
      auto item = upcoming.createNestedObject();
      item["index"] = i;
      item["ticks"] = step.ticks;
      auto notes = item.createNestedArray("notes");
      for (int j = 0; j < step.count; ++j) notes.add(step.notes[j]);
    }
  }
  auto expected = o.createNestedArray("expected");
  auto held = o.createNestedArray("held");
  auto targets = engine.targets();
  for (int n = 0; n < 128; ++n) {
    if (targets[n]) expected.add(n);
    if (previewing ? previewHeld[n] : engine.held[n]) held.add(n);
  }
}

void TrainingController::preview(const std::array<uint8_t, 128>& notes) {
  if (engine.running()) engine.pause(millis());
  previewHeld = notes;
  previewing = true;
  ownsLeds = true;
  lastPreviewAt = millis();
  render();
}
void TrainingController::stopPreview() {
  if (!previewing) return;
  previewing = false;
  previewHeld.fill(0);
  render();
}
