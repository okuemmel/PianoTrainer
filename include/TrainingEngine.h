#pragma once
#include <array>
#include <cstdint>

#include "MidiTypes.h"
#include "TrainerLogic.h"

constexpr int MaxTrainingSteps = 128;
constexpr int MaxChordNotes = 8;
constexpr uint16_t TrainingTicksPerBeat = 480;
struct TrainingStep {
  std::array<uint8_t, MaxChordNotes> notes{};
  uint8_t count = 0;
  uint16_t ticks = TrainingTicksPerBeat;
};
struct TrainingSequence {
  std::array<TrainingStep, MaxTrainingSteps> steps{};
  int count = 0;
};
enum class TrainingState { Idle, CountIn, Playing, Paused, Completed };
enum class TrainingFeedback { Ready, Correct, WrongNote, TooEarly, Missed, Paused, Completed };

// Portable state machine: all timestamps are supplied by the caller, in milliseconds.
class TrainingEngine {
 public:
  bool start(LearningMode requestedMode, const TrainingSequence& requestedSequence, int tempo,
             int window, bool songInTime, uint32_t now) {
    if (requestedMode == LearningMode::FreePlay || tempo < 40 || tempo > 200 || window < 80 ||
        window > 400 || requestedSequence.count < 1 || requestedSequence.count > MaxTrainingSteps)
      return false;
    bool playable = false;
    for (int i = 0; i < requestedSequence.count; ++i) {
      const auto& step = requestedSequence.steps[i];
      if (step.count > MaxChordNotes || step.ticks < 60 || step.ticks > 7680) return false;
      for (int j = 0; j < step.count; ++j) {
        if (step.notes[j] > 127) return false;
        for (int k = 0; k < j; ++k)
          if (step.notes[j] == step.notes[k]) return false;
      }
      playable |= step.count > 0;
    }
    if (!playable) return false;
    sequence = requestedSequence;
    mode = requestedMode;
    bpm = tempo;
    tolerance = window;
    timed = mode == LearningMode::RhythmTraining || (mode == LearningMode::SongMode && songInTime);
    startedAt = now;
    pausedAt = 0;
    index = correct = wrong = missed = timingCount = 0;
    stepTicks = 0;
    absoluteTimingSum = 0;
    lastTimingMs = 0;
    lastErrorNote = -1;
    held.fill(0);
    stepAttacks.fill(false);
    state = timed ? TrainingState::CountIn : TrainingState::Playing;
    feedback = TrainingFeedback::Ready;
    ++revision;
    if (!timed) skipRests();
    return true;
  }
  void stop() {
    mode = LearningMode::FreePlay;
    state = TrainingState::Idle;
    feedback = TrainingFeedback::Ready;
    held.fill(0);
    lastErrorNote = -1;
    ++revision;
  }
  void clearHeld() {
    held.fill(0);
    stepAttacks.fill(false);
    ++revision;
  }
  bool running() const {
    return state == TrainingState::Playing || state == TrainingState::CountIn;
  }
  void pause(uint32_t now) {
    if (!running()) return;
    pausedAt = now;
    state = TrainingState::Paused;
    feedback = TrainingFeedback::Paused;
    clearHeld();
  }
  void resume(uint32_t now) {
    if (state != TrainingState::Paused) return;
    startedAt += now - pausedAt;
    state = timed && elapsed(now) < countInMs() ? TrainingState::CountIn : TrainingState::Playing;
    feedback = TrainingFeedback::Ready;
    clearHeld();
  }
  void tick(uint32_t now) {
    if (!running() || !timed) return;
    if (state == TrainingState::CountIn && elapsed(now) + tolerance >= countInMs()) {
      state = TrainingState::Playing;
      ++revision;
    }
    while (index < sequence.count) {
      const auto& step = sequence.steps[index];
      if (step.count == 0) {
        if (elapsed(now) < dueMs() + ticksToMs(step.ticks)) break;
      } else {
        if (static_cast<int32_t>(elapsed(now) - dueMs()) <= tolerance) break;
        ++missed;
        feedback = TrainingFeedback::Missed;
      }
      advance();
    }
  }
  void receive(const MidiEvent& event, uint32_t now) {
    if (event.note > 127 || event.velocity > 127) return;
    tick(now);
    const bool on = event.on && event.velocity > 0;
    if (!on) {
      held[event.note] = 0;
      ++revision;
      return;
    }
    if (state == TrainingState::Paused || state == TrainingState::Completed) return;
    if (held[event.note]) return;  // Holding a key must not score repeated notes.
    held[event.note] = event.velocity;
    ++revision;
    if (mode == LearningMode::FreePlay || !running() || index >= sequence.count) return;
    const auto& step = sequence.steps[index];
    bool expected = false;
    for (int i = 0; i < step.count; ++i) expected |= step.notes[i] == event.note;
    if (!expected) {
      ++wrong;
      lastErrorNote = event.note;
      feedback = TrainingFeedback::WrongNote;
      return;
    }
    if (timed && static_cast<int32_t>(elapsed(now) - dueMs()) < -tolerance) {
      ++wrong;
      lastErrorNote = event.note;
      feedback = TrainingFeedback::TooEarly;
      return;
    }
    stepAttacks[event.note] = true;
    for (int n = 0; n < 128; ++n) {
      bool target = false;
      for (int j = 0; j < step.count; ++j) target |= n == step.notes[j];
      if (target && !stepAttacks[n]) return;
      if (target != (held[n] > 0)) return;  // Chords require exactly their notes.
    }
    ++correct;
    if (timed) {
      lastTimingMs = static_cast<int32_t>(elapsed(now) - dueMs());
      absoluteTimingSum += lastTimingMs < 0 ? -lastTimingMs : lastTimingMs;
      ++timingCount;
    }
    lastErrorNote = -1;
    feedback = TrainingFeedback::Correct;
    advance();
    if (!timed) skipRests();
  }
  uint32_t elapsed(uint32_t now) const {
    return (state == TrainingState::Paused ? pausedAt : now) - startedAt;
  }
  uint32_t beatMs() const {
    return 60000U / bpm;
  }
  uint32_t countInMs() const {
    return timed ? ticksToMs(4 * TrainingTicksPerBeat) : 0;
  }
  uint32_t dueMs() const {
    return countInMs() + ticksToMs(stepTicks);
  }
  uint32_t durationMs() const {
    return index < sequence.count ? ticksToMs(sequence.steps[index].ticks) : 0;
  }
  int32_t dueInMs(uint32_t now) const {
    return static_cast<int32_t>(dueMs() - elapsed(now));
  }
  int accuracy() const {
    int attempts = correct + wrong + missed;
    return attempts ? correct * 100 / attempts : 0;
  }
  int averageTimingMs() const {
    return timingCount ? absoluteTimingSum / timingCount : 0;
  }
  std::array<bool, 128> targets() const {
    std::array<bool, 128> result{};
    if (running() && index < sequence.count)
      for (int i = 0; i < sequence.steps[index].count; ++i)
        result[sequence.steps[index].notes[i]] = true;
    return result;
  }
  LearningMode mode = LearningMode::FreePlay;
  TrainingState state = TrainingState::Idle;
  TrainingFeedback feedback = TrainingFeedback::Ready;
  std::array<uint8_t, 128> held{};
  uint32_t revision = 0;
  int index = 0, correct = 0, wrong = 0, missed = 0;
  int bpm = 80, tolerance = 220, lastTimingMs = 0, lastErrorNote = -1;
  bool timed = false;
  TrainingSequence sequence;

 private:
  std::array<bool, 128> stepAttacks{};
  uint32_t startedAt = 0, pausedAt = 0, stepTicks = 0;
  int absoluteTimingSum = 0, timingCount = 0;
  uint32_t ticksToMs(uint32_t ticks) const {
    return static_cast<uint64_t>(ticks) * 60000 / (bpm * TrainingTicksPerBeat);
  }
  void advance() {
    stepAttacks.fill(false);
    if (index < sequence.count) stepTicks += sequence.steps[index++].ticks;
    ++revision;
    if (index == sequence.count) {
      state = TrainingState::Completed;
      feedback = TrainingFeedback::Completed;
      held.fill(0);
    }
  }
  void skipRests() {
    while (index < sequence.count && !sequence.steps[index].count) advance();
  }
};
