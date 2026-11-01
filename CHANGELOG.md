# Changelog

Wird bei sichtbaren Änderungen im selben Commit mitgepflegt. Versionen stammen aus `include/AppInfo.h`; ältere Einträge wurden aus Git übernommen.

## 1.12.3 · 2026-11-01

- Webanmeldung standardmäßig ausschalten und unter System optional aktivierbar machen; Einstellung dauerhaft speichern und für Oberfläche, API und Updates einheitlich anwenden.
- Aktuelle Updatepakete, USB-Installationspaket, Anleitung und Prüfsummen unter dist/v1.12.3 im Git-Repository bereitstellen.

## 1.12.2 · 2026-11-01

- Mobile Klaviertonausgabe mit Playback-Audiositzung und direkter Freigabe beim Tippen verbessern; unterbrochene iOS-Audiokontexte erneut aktivieren.
- MIDI-Fortsetzen ohne verzögerte Audiofreigabe ausführen und nicht laufende Audiokontexte vor dem Start erkennen.

## 1.12.1 · 2026-11-01

- Diagnosebegrenzung der WLAN-Sendeleistung auf 8,5 dBm entfernen und wieder den Treiberstandard verwenden; aktuelle Sendeleistung im seriellen Log anzeigen.

## 1.12.0 · 2026-10-31

- Oberfläche und Sprachdateien komprimiert in die Firmware einbetten: ein Firmwarepaket aktualisiert alles gemeinsam im freien OTA-Slot.
- Vollständige Oberfläche auch ohne LittleFS bereitstellen; vorhandene Klaviersamples erhalten, bei fehlenden Samples Synthesizer verwenden.
- Firmwareupdates auch bei fehlendem Dateisystem erfolgreich abschließen und /recovery als Firmwareuploader anbieten.
- Fertige Updatepakete, USB-Installationspaket, Anleitung und SHA-256-Prüfsummen versioniert direkt im Git-Repository bereitstellen.

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
