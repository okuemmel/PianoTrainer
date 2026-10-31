#include "TrainerWebServer.h"

void TrainerWebServer::recordCompletedLesson() {
  if (activeLesson < 0 || lessonRecorded || training.engine.state != TrainingState::Completed)
    return;
  // One bounded NVS write per finished run, never per note or status poll.
  lessonRecorded = true;
  lessonSaved = config.saveLessonResult(activeLesson, training.engine.accuracy());
  Serial.printf("[Lektion] %s beendet, %d Prozent, Fortschritt %s.\n", Lessons[activeLesson].id,
                training.engine.accuracy(), lessonSaved ? "gespeichert" : "NICHT gespeichert");
}
void TrainerWebServer::trainingSnapshot(JsonObject object) {
  recordCompletedLesson();
  training.status(object);
  const bool active = activeLesson >= 0 && training.engine.state != TrainingState::Idle;
  object["lesson"] = active ? Lessons[activeLesson].id : "";
  object["lessonRun"] = lessonRun;
  object["lessonRecorded"] = active && lessonRecorded;
  object["lessonSaved"] = active && lessonSaved;
}
void TrainerWebServer::lessonRoutes() {
  server.on("/api/lessons", HTTP_GET, [this] {
    if (!auth()) return;
    recordCompletedLesson();
    DynamicJsonDocument doc(16384);
    doc["passAccuracy"] = LessonPassAccuracy;
    auto list = doc.createNestedArray("lessons");
    for (size_t i = 0; i < LessonCount; ++i) {
      const auto& lesson = Lessons[i];
      const auto& result = config.lessonResults[i];
      auto item = list.createNestedObject();
      item["id"] = lesson.id;
      item["title"] = lesson.title;
      item["chapter"] = lesson.chapter;
      item["goal"] = lesson.goal;
      item["instruction"] = lesson.instruction;
      item["preset"] = lesson.preset;
      item["mode"] = lesson.mode;
      item["bpm"] = lesson.bpm;
      item["root"] = lessonRoot(config.led.baseNote, config.led.keys) + lesson.rootOffset;
      item["runs"] = result.runs;
      item["best"] = result.best;
      item["stars"] = lessonStars(result);
      item["passed"] = result.runs > 0 && result.best >= LessonPassAccuracy;
    }
    json(200, doc);
  });
  server.on("/api/lessons/reset", HTTP_POST, [this] {
    if (!auth(true)) return;
    StaticJsonDocument<128> doc;
    if (!body(doc, 128)) return;
    if (doc["confirm"] != "LERNFORTSCHRITT") {
      error(400, "Bestätigung fehlt.");
      return;
    }
    if (!config.resetLessonProgress()) {
      error(500, "Lernfortschritt konnte nicht gelöscht werden.");
      return;
    }
    midi.release();
    training.stop();
    activeLesson = -1;
    lessonRecorded = lessonSaved = false;
    ledReply();
  });
}
