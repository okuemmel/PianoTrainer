#pragma once
#include <cstring>

#include "TrainingEngine.h"
struct TrainingPreset {
  const char* id;
  const char* title;
};
inline constexpr TrainingPreset TrainingPresets[] = {
    {"five", "Fünf-Finger-Übung"},           {"scale", "Dur-Tonleiter"},
    {"chords", "Drei Dur-Akkorde"},          {"rhythm", "Viertel und Achtel"},
    {"joy", "Freude, schöner Götterfunken"}, {"twinkle", "Morgen kommt der Weihnachtsmann"}};
inline bool buildTrainingPreset(const char* id, int root, TrainingSequence& sequence) {
  sequence = TrainingSequence();
  auto add = [&](int offset, int ticks = 480) {
    if (root + offset > 127 || root + offset < 0 || sequence.count >= MaxTrainingSteps)
      return false;
    auto& step = sequence.steps[sequence.count++];
    step.count = 1;
    step.notes[0] = root + offset;
    step.ticks = ticks;
    return true;
  };
  if (!strcmp(id, "five")) {
    for (int n : {0, 2, 4, 5, 7, 5, 4, 2, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "scale")) {
    for (int n : {0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "rhythm")) {
    for (int ticks : {480, 480, 240, 240, 480, 480, 240, 240, 240, 240, 480, 960})
      if (!add(0, ticks)) return false;
  } else if (!strcmp(id, "chords")) {
    for (int offset : {0, 5, 7, 0}) {
      if (root + offset + 7 > 127 || root < 0) return false;
      auto& step = sequence.steps[sequence.count++];
      step.count = 3;
      step.ticks = 960;
      step.notes[0] = root + offset;
      step.notes[1] = root + offset + 4;
      step.notes[2] = root + offset + 7;
    }
  } else if (!strcmp(id, "joy")) {
    const int notes[] = {4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, 4, 2, 2,
                         4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, 2, 0, 0};
    for (int i = 0; i < 30; ++i)
      if (!add(notes[i], i == 14 || i == 29 ? 960 : 480)) return false;
  } else if (!strcmp(id, "twinkle")) {
    const int notes[] = {0, 0, 7, 7, 9, 9, 7, 5, 5, 4, 4, 2, 2, 0, 7, 7, 5, 5, 4, 4, 2,
                         7, 7, 5, 5, 4, 4, 2, 0, 0, 7, 7, 9, 9, 7, 5, 5, 4, 4, 2, 2, 0};
    for (int i = 0; i < 42; ++i)
      if (!add(notes[i], i % 7 == 6 ? 960 : 480)) return false;
  } else
    return false;
  return true;
}
