# Changelog

Wird bei sichtbaren Änderungen im selben Commit mitgepflegt. Versionen stammen aus `include/AppInfo.h`; ältere Einträge wurden aus Git übernommen.

## 1.11.0 · 2026-10-31

- Erstes GitHub-Release mit geprüften Updatepaketen, USB-Installationspaket und SHA-256-Prüfsummen bereitstellen.
- Notfallseite /recovery direkt aus der Firmware zum erneuten Hochladen beschädigter Webdateien ergänzen.
- Firmware und Weboberfläche per geprüftem ESP32-C3-Updatepaket über den Browser aktualisieren.
- Geräteeinstellungen und Lernfortschritt als JSON sichern und atomar wiederherstellen; Passwörter bleiben auf dem Gerät.
- Versioniertes Changelog mit Hilfsskript und dauerhafter Pflegeregel für weitere Änderungen ergänzen.

## 1.10.0 · 2026-10-31

- Add live German and English UI with local language catalogs

## 1.9.0 · 2026-10-31

- Add progressive lessons and 61, 76 and 88 key profiles

## 1.8.0 · 2026-10-31

- Show project information and synchronized playback score

## Frühere Versionen · 2026-10-31

- Add local sampled piano audio for MIDI playback and virtual keys
- Keep MIDI listening running across window focus changes
- Compact mobile UI and add MIDI libraries with listening LEDs
- Add piano learning previews, network settings and vibe coding disclosure
- Initial commit: ESP32-C3 MIDI piano trainer with simulation and LED preview
