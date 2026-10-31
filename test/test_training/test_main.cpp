#include <unity.h>

#include "TrainingCatalog.h"
void setUp() {}
void tearDown() {}
TrainingSequence notes(std::initializer_list<int> values) {
  TrainingSequence s;
  for (int n : values) {
    auto& step = s.steps[s.count++];
    step.count = 1;
    step.notes[0] = n;
  }
  return s;
}
void send(TrainingEngine& e, int note, uint32_t at, bool on = true, int velocity = 100) {
  e.receive({uint8_t(note), uint8_t(velocity), 1, on}, at);
}
void guided_wrong_and_repeat() {
  TrainingEngine e;
  TEST_ASSERT_TRUE(e.start(LearningMode::GuidedLearning, notes({60, 60}), 80, 200, false, 10));
  send(e, 61, 20);
  TEST_ASSERT_EQUAL(1, e.wrong);
  TEST_ASSERT_EQUAL(0, e.index);
  send(e, 61, 21, false);
  send(e, 60, 30);
  TEST_ASSERT_EQUAL(1, e.index);
  send(e, 60, 31);
  TEST_ASSERT_EQUAL(1, e.index);
  send(e, 60, 32, false);
  send(e, 60, 33);
  TEST_ASSERT_EQUAL(2, e.correct);
  TEST_ASSERT_EQUAL(int(TrainingState::Completed), int(e.state));
}
void chord_requires_fresh_complete_attacks() {
  TrainingSequence s;
  s.count = 2;
  for (auto i : {0, 1}) {
    s.steps[i].count = 3;
    s.steps[i].notes = {60, 64, 67};
  }
  TrainingEngine e;
  e.start(LearningMode::SongMode, s, 80, 200, false, 0);
  send(e, 60, 1);
  send(e, 64, 2);
  TEST_ASSERT_EQUAL(0, e.index);
  send(e, 67, 3);
  TEST_ASSERT_EQUAL(1, e.index);
  send(e, 60, 4, false);
  send(e, 60, 5);
  TEST_ASSERT_EQUAL(1, e.index);
  send(e, 64, 6, false);
  send(e, 64, 7);
  TEST_ASSERT_EQUAL(1, e.index);
  send(e, 67, 8, false);
  send(e, 67, 9);
  TEST_ASSERT_EQUAL(2, e.correct);
}
void rhythm_window_and_early_input() {
  TrainingEngine e;
  e.start(LearningMode::RhythmTraining, notes({60, 62}), 120, 150, true, 1000);
  TEST_ASSERT_EQUAL(int(TrainingState::CountIn), int(e.state));
  send(e, 60, 2000);
  TEST_ASSERT_EQUAL(1, e.wrong);
  TEST_ASSERT_EQUAL(0, e.correct);
  send(e, 60, 2100, false);
  send(e, 60, 2900);
  TEST_ASSERT_EQUAL(1, e.correct);
  TEST_ASSERT_EQUAL(-100, e.lastTimingMs);
  send(e, 60, 2910, false);
  send(e, 62, 3500);
  TEST_ASSERT_EQUAL(2, e.correct);
  TEST_ASSERT_EQUAL(50, e.averageTimingMs());
}
void misses_and_boundaries() {
  TrainingEngine e;
  e.start(LearningMode::RhythmTraining, notes({60, 62}), 120, 100, true, 0);
  e.tick(2100);
  TEST_ASSERT_EQUAL(0, e.missed);
  e.tick(2101);
  TEST_ASSERT_EQUAL(1, e.missed);
  send(e, 62, 2500);
  TEST_ASSERT_EQUAL(1, e.correct);
  TEST_ASSERT_EQUAL(50, e.accuracy());
}
void pause_and_clock_wrap() {
  TrainingEngine e;
  const uint32_t start = UINT32_MAX - 999;
  e.start(LearningMode::RhythmTraining, notes({60}), 120, 100, true, start);
  e.pause(start + 1000);
  e.tick(start + 20000);
  TEST_ASSERT_EQUAL(0, e.missed);
  e.resume(start + 20000);
  TEST_ASSERT_EQUAL(1000, e.dueInMs(start + 20000));
  send(e, 60, start + 21000);
  TEST_ASSERT_EQUAL(1, e.correct);
}
void invalid_sequence_does_not_replace_session() {
  TrainingEngine e;
  auto s = notes({60});
  e.start(LearningMode::GuidedLearning, s, 80, 200, false, 0);
  auto bad = s;
  bad.steps[0].count = 2;
  bad.steps[0].notes[1] = 60;
  TEST_ASSERT_FALSE(e.start(LearningMode::SongMode, bad, 80, 200, false, 1));
  TEST_ASSERT_EQUAL(int(LearningMode::GuidedLearning), int(e.mode));
  TEST_ASSERT_FALSE(e.start(LearningMode::SongMode, s, 0, 200, false, 1));
  bad = s;
  bad.steps[0].ticks = 0;
  TEST_ASSERT_FALSE(e.start(LearningMode::SongMode, bad, 80, 200, false, 1));
}
void velocity_zero_and_panic() {
  TrainingEngine e;
  send(e, 60, 10);
  TEST_ASSERT_EQUAL(100, e.held[60]);
  send(e, 60, 11, true, 0);
  TEST_ASSERT_EQUAL(0, e.held[60]);
  send(e, 62, 12);
  e.clearHeld();
  TEST_ASSERT_EQUAL(0, e.held[62]);
  e.stop();
  TEST_ASSERT_EQUAL(int(LearningMode::FreePlay), int(e.mode));
}
void rests_and_large_time_jump() {
  TrainingEngine e;
  auto s = notes({60, 62});
  s.steps[0].count = 0;
  e.start(LearningMode::GuidedLearning, s, 80, 200, false, 0);
  TEST_ASSERT_EQUAL(1, e.index);
  send(e, 62, 1);
  TEST_ASSERT_EQUAL(1, e.correct);
  s = notes({60, 62, 64});
  e.start(LearningMode::RhythmTraining, s, 120, 100, true, 0);
  e.tick(10000);
  TEST_ASSERT_EQUAL(3, e.missed);
  TEST_ASSERT_EQUAL(int(TrainingState::Completed), int(e.state));
}
void all_presets_playable() {
  for (const auto& p : TrainingPresets) {
    TrainingSequence s;
    TEST_ASSERT_TRUE(buildTrainingPreset(p.id, 60, s));
    TrainingEngine e;
    TEST_ASSERT_TRUE(e.start(LearningMode::GuidedLearning, s, 80, 200, false, 0));
  }
}
int main() {
  UNITY_BEGIN();
  RUN_TEST(guided_wrong_and_repeat);
  RUN_TEST(chord_requires_fresh_complete_attacks);
  RUN_TEST(rhythm_window_and_early_input);
  RUN_TEST(misses_and_boundaries);
  RUN_TEST(pause_and_clock_wrap);
  RUN_TEST(invalid_sequence_does_not_replace_session);
  RUN_TEST(velocity_zero_and_panic);
  RUN_TEST(rests_and_large_time_jump);
  RUN_TEST(all_presets_playable);
  return UNITY_END();
}
