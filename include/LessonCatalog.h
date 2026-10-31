#pragma once
#include "TrainingCatalog.h"

struct Lesson {
  const char *id, *title, *chapter, *goal, *instruction, *preset, *mode;
  int bpm, rootOffset;
};
inline constexpr Lesson Lessons[] = {
    {"first-note", "1. Deinen ersten Ton finden", "1 · Erste Töne",
     "Vier bewusste Anschläge spielen.",
     "Markierte Taste spielen und dazwischen ganz loslassen. Fingersatz-Vorschlag: rechter Daumen.",
     "single", "guided", 55, 0},
    {"neighbors", "2. Zwei Nachbartöne", "1 · Erste Töne", "Zwischen zwei Tasten sicher wechseln.",
     "Rechte Hand: Daumen und Zeigefinger. Spiele langsam und beobachte die Notennamen.",
     "neighbors", "guided", 55, 0},
    {"three-notes", "3. Drei Töne lesen", "1 · Erste Töne", "Drei Tonhöhen unterscheiden.",
     "Nutze Daumen, Zeige- und Mittelfinger. Die Notenvorschau hilft beim Vorauslesen.", "three",
     "guided", 60, 0},
    {"five-fingers", "4. Fünf-Finger-Position", "1 · Erste Töne",
     "Fünf benachbarte weiße Tasten verbinden.",
     "Rechte Hand: ein Finger pro weißer Taste. Notennamen bei Bedarf ausblenden.", "five",
     "guided", 60, 0},
    {"finger-changes", "5. Finger im Wechsel", "1 · Erste Töne",
     "Töne auch außerhalb der Reihenfolge finden.",
     "Bleibe in derselben Fünf-Finger-Position und lies den nächsten Einsatz voraus.", "fingers",
     "guided", 65, 0},
    {"left-hand", "6. Die linke Hand", "2 · Hände & Intervalle",
     "Die tiefere Fünf-Finger-Lage kennenlernen.",
     "Eine Oktave tiefer: Fingersatz-Vorschlag links 5–4–3–2–1 und zurück.", "five", "guided", 60,
     -12},
    {"thirds", "7. Terzen", "2 · Hände & Intervalle", "Sprünge über eine weiße Taste erkennen.",
     "Achte auf die Abstände im Notenbild. Die Hand darf sich mitbewegen.", "thirds", "guided", 65,
     0},
    {"fourths", "8. Größere Sprünge", "2 · Hände & Intervalle", "Quartensprünge gezielt ansteuern.",
     "Schau vor jedem Anschlag auf die nächste LED und die zugehörige Note.", "fourths", "guided",
     65, 0},
    {"octaves", "9. Oktaven", "2 · Hände & Intervalle", "Gleichnamige Töne in zwei Lagen finden.",
     "Die Oktavtöne nacheinander spielen; hier ist keine große Handspanne nötig.", "octaves",
     "guided", 60, 0},
    {"major-scale", "10. Die Dur-Tonleiter", "2 · Hände & Intervalle",
     "Eine ganze Oktave auf und ab verbinden.",
     "Bei Grundnote C: rechts aufwärts 1–2–3–1–2–3–4–5, abwärts zurück.", "scale", "guided", 70, 0},
    {"arpeggio", "11. Akkordtöne nacheinander", "3 · Akkorde & Zusammenspiel",
     "Grundton, Terz und Quinte hören und lesen.",
     "Die Töne des Dur-Akkords einzeln spielen. Achte auf die wiederkehrende Form.", "arpeggio",
     "guided", 65, 0},
    {"minor-chords", "12. Moll-Akkorde", "3 · Akkorde & Zusammenspiel",
     "Drei Töne gleichzeitig anschlagen.",
     "Alle markierten Tasten gemeinsam drücken. Vor dem nächsten Akkord vollständig loslassen.",
     "minor", "guided", 60, 0},
    {"major-chords", "13. Dur-Akkordwechsel", "3 · Akkorde & Zusammenspiel",
     "Zwischen drei Dur-Akkorden wechseln.",
     "Die gemeinsame Akkordform erkennen. Nur die markierten Tasten gleichzeitig spielen.",
     "chords", "guided", 65, 0},
    {"alternating-hands", "14. Hände abwechseln", "3 · Akkorde & Zusammenspiel",
     "Tiefe und hohe Lage verbinden.",
     "Tiefer Ton links, höherer Ton rechts: Beide Hände wechseln sich ab.", "alternate", "guided",
     60, 0},
    {"together", "15. Beide Hände gemeinsam", "3 · Akkorde & Zusammenspiel",
     "Oktavpaare gleichzeitig spielen.",
     "Ein Ton links und derselbe Ton eine Oktave höher rechts. Zwischen den Paaren loslassen.",
     "together", "guided", 60, 0},
    {"quarter-pulse", "16. Gleichmäßiger Puls", "4 · Rhythmus & Lieder",
     "Nach dem Einzähler Viertel im Tempo spielen.",
     "Vier Schläge mitzählen, dann jeden markierten Einsatz neu anschlagen. Der Anschlag zählt, "
     "nicht die Haltedauer.",
     "quarters", "rhythm", 60, 0},
    {"eighth-notes", "17. Viertel und Achtel", "4 · Rhythmus & Lieder",
     "Zwischen langsamen und schnellen Einsätzen wechseln.",
     "Die Achtel liegen doppelt so dicht wie die Viertel. Optischen Takt und Vorschau beachten.",
     "rhythm", "rhythm", 65, 0},
    {"rests", "18. Pausen mitspielen", "4 · Rhythmus & Lieder",
     "Den Puls auch ohne Anschlag weiterführen.",
     "Bei einer Pause nicht spielen. Weiterzählen und den nächsten Ton rechtzeitig vorbereiten.",
     "rests", "rhythm", 65, 0},
    {"joy", "19. Deine erste Melodie", "4 · Rhythmus & Lieder",
     "Eine bekannte Melodie im Tempo spielen.",
     "Freude, schöner Götterfunken: Vor dem Start Noten ansehen, dann dem Einzähler folgen.", "joy",
     "song", 75, 0},
    {"twinkle", "20. Kleines Abschlussstück", "4 · Rhythmus & Lieder",
     "Sprünge, Wiederholungen und Rhythmus verbinden.",
     "Morgen kommt der Weihnachtsmann: Vorauslesen und nach längeren Tönen rechtzeitig neu "
     "anschlagen.",
     "twinkle", "song", 75, 0},
};
inline constexpr size_t LessonCount = sizeof(Lessons) / sizeof(Lessons[0]);
inline int lessonIndex(const char* id) {
  if (!id) return -1;
  for (size_t i = 0; i < LessonCount; ++i)
    if (!strcmp(id, Lessons[i].id)) return int(i);
  return -1;
}
inline int lessonRoot(int baseNote, int keys) {
  // Prefer middle C, with room for the left hand (-12) and octave exercises (+16).
  const int minimum = baseNote + (keys >= 29 ? 12 : 0);
  const int first = minimum + (12 - minimum % 12) % 12;
  const int last = ((baseNote + keys - 1 - 16) / 12) * 12;
  int root = 60;
  if (root < first) root = first;
  if (root > last && last >= first) root = last;
  return root;
}
