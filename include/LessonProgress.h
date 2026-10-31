#pragma once
#include <cstdint>

inline constexpr int LessonPassAccuracy = 80;
struct LessonResult {
  uint16_t runs = 0;
  uint8_t best = 0;
};
inline bool recordLessonResult(LessonResult& result, int accuracy) {
  if (accuracy < 0 || accuracy > 100) return false;
  if (result.runs < UINT16_MAX) ++result.runs;
  if (accuracy > result.best) result.best = accuracy;
  return true;
}
inline int lessonStars(const LessonResult& result) {
  return !result.runs ? 0 : result.best >= 95 ? 3 : result.best >= LessonPassAccuracy ? 2 : 1;
}
