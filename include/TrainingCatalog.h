#pragma once
#include <cstring>

#include "TrainingEngine.h"
struct TrainingPreset {
  const char* id;
  const char* title;
};
inline constexpr TrainingPreset TrainingPresets[] = {
    {"five", "Fünf-Finger-Übung"},
    {"scale", "Dur-Tonleiter"},
    {"chords", "Drei Dur-Akkorde"},
    {"rhythm", "Viertel und Achtel"},
    {"joy", "Freude, schöner Götterfunken"},
    {"twinkle", "Morgen kommt der Weihnachtsmann"},
    {"single", "Ein Ton, vier Anschläge"},
    {"neighbors", "Zwei Nachbartöne"},
    {"three", "Drei Töne auf und ab"},
    {"fingers", "Fünf Finger im Wechsel"},
    {"thirds", "Terzen entdecken"},
    {"fourths", "Quartensprünge"},
    {"octaves", "Oktaven finden"},
    {"arpeggio", "Gebrochener Dur-Akkord"},
    {"minor", "Moll-Akkorde"},
    {"alternate", "Linke und rechte Hand im Wechsel"},
    {"together", "Beide Hände gemeinsam"},
    {"quarters", "Gleichmäßige Viertel"},
    {"rests", "Rhythmus mit Pausen"}};
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
  auto chord = [&](std::initializer_list<int> offsets, int ticks = 960) {
    if (sequence.count >= MaxTrainingSteps || offsets.size() > MaxChordNotes) return false;
    TrainingStep step;
    step.ticks = ticks;
    for (int n : offsets) {
      if (root + n < 0 || root + n > 127) return false;
      step.notes[step.count++] = root + n;
    }
    sequence.steps[sequence.count++] = step;
    return true;
  };
  if (!strcmp(id, "single")) {
    for (int i = 0; i < 4; ++i)
      if (!add(0)) return false;
  } else if (!strcmp(id, "neighbors")) {
    for (int n : {0, 2, 0, 2, 2, 0, 2, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "three")) {
    for (int n : {0, 2, 4, 2, 0, 4, 2, 0, 2, 4, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "fingers")) {
    for (int n : {0, 4, 2, 5, 4, 7, 5, 2, 0, 7, 4, 2, 5, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "thirds")) {
    for (int n : {0, 4, 2, 5, 4, 7, 5, 9, 7, 11, 5, 9, 4, 7, 2, 5, 0, 4, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "fourths")) {
    for (int n : {0, 5, 2, 7, 4, 9, 7, 12, 9, 14, 7, 12, 4, 9, 2, 7, 0, 5, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "octaves")) {
    for (int n : {0, 12, 0, 12, 2, 14, 2, 14, 4, 16, 4, 16, 0, 12, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "arpeggio")) {
    for (int n : {0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 7, 4, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "minor")) {
    for (int offset : {0, 5, 7, 0})
      if (!chord({offset, offset + 3, offset + 7})) return false;
  } else if (!strcmp(id, "alternate")) {
    for (int n : {-12, 0, -10, 2, -8, 4, -7, 5, -5, 7, -7, 5, -8, 4, -10, 2, -12, 0})
      if (!add(n)) return false;
  } else if (!strcmp(id, "together")) {
    for (int n : {0, 2, 4, 5, 7, 5, 4, 2, 0})
      if (!chord({n - 12, n}, 480)) return false;
  } else if (!strcmp(id, "quarters")) {
    for (int i = 0; i < 12; ++i)
      if (!add(0)) return false;
  } else if (!strcmp(id, "rests")) {
    for (int repeat = 0; repeat < 3; ++repeat) {
      if (!add(0) || !chord({}, 480) || !add(2, 240) || !chord({}, 240) || !add(4) ||
          !chord({}, 480))
        return false;
    }
  } else if (!strcmp(id, "five")) {
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
