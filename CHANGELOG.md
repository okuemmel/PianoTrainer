# Changelog

Wird bei sichtbaren Änderungen im selben Commit mitgepflegt. Versionen stammen aus `include/AppInfo.h`; ältere Einträge wurden aus Git übernommen.

## 2.0.0-alpha.2 · 2026-11-01

- Phase 2 vor Ankunft der Hardware vorbereiten: gemeinsame typisierte MIDI-Ereignisse mit Empfangszeit/Quelle, begrenzte Quellen-/Kanalverwaltung und derselbe bestehende Lernpfad für virtuelle und vorbereitete Hardwareeingaben.
- MIDI-1.0-Byteparser mit Running Status, Velocity-0-Note-Off, CC120/123, Realtime/System-Common und begrenzter SysEx-Behandlung ergänzen. S3-DIN-UART optional mit ausdrücklich gewähltem RX-Pin, Fehlerbereinigung und Active-Sensing-Wächter vorbereiten; Standard bleibt virtuelle Eingabe, Auswahl nur bis Neustart.
- DE/EN-Eingangsauswahl und MIDI-Diagnose ergänzen; Web-Release und Heartbeat auf die Webquelle begrenzen, LED-/RX-Pinkonflikte abweisen und virtuelle Noten bei gewähltem DIN-Eingang klar ablehnen.
- USB-MIDI-1.0-Paket-/Deskriptorparser und separaten `s3_usb_probe`-Build mit manuell gestartetem ESP-IDF-Host zur Enumeration ergänzen. Der Probe-Build erzeugt keine OTA-Pakete und empfängt noch keine USB-Noten; OTraki-Kompatibilität, Bulk-Transfers, VBUS und Hardwareabnahme bleiben offen.

## 2.0.0-alpha.1 · 2026-11-01

- Nach Freigabe Phase 1 beginnen: eigenes S3-N16R8-Profil mit QSPI-Flash/OPI-PSRAM, 16-MiB-Partitionstabelle, zwei 4-MiB-OTA-Plätzen, S3-BOOT-Pin und konservativer LED-Pinauswahl. Bestehende Lern-, LED-, MIDI-, Audio-, Import- und Oberflächenfunktionen beibehalten; C3-Regressionsprofil erhalten.
- Updatepakete an Chip und Flash-Layout binden, Bootloader/Partitionstabelle im Paketbau prüfen und S3-/C3-Pakete gegenseitig ablehnen. Gerät meldet tatsächliche Updategrenzen und PSRAM; alte C3-Pakete bleiben dort verwendbar.
- Schema-1-Backups vor Wiederherstellung ohne NVS-Änderung prüfen; gesperrte GPIOs erfordern bewusste Neuauswahl. Separaten binären Browserexport/-import für vollständige MIDI-Favoriten und Ansichtseinstellungen mit Prüfsummen und atomarem Favoritenimport ergänzen, DE/EN erhalten.
- Entwicklungsartefakte für S3 und C3-Datenexporthilfe getrennt bereitstellen. Board ist noch im Zulauf; Anbieterangabe WROOM-1-N16R8 und geplanter OTraki-USB-MIDI-Adapter dokumentiert. Keine Hardwareabnahme, kein Upload, kein finales v2-Release; USB-MIDI-Host bleibt Phase 2.

## v2-Planung auf Basis 1.15.1 · 2026-11-01

- Ausschließlich Phase 0 auf `develop/v2`: v1.15.1-Referenzcommit, vollständige Feature-/API-/Dateninventare, Architektur- und MIDI-Integrationsentwurf, S3-Hardwarefragen für das genannte DevC-N16R8-Board sowie Migrations- und Regressionstestplan dokumentieren.
- Keine Firmware-/API-/Buildänderung und keine S3-Paritäts- oder Latenzzusage; AppInfo bleibt 1.15.1. Phase 1 beginnt erst nach ausdrücklicher Freigabe.

## 1.15.1 · 2026-11-01

- Pause-/Fortsetzen-Taste direkt in der Falling-Notes-Ansicht ergänzen, auch in der vergrößerten Ansicht. Je nach aktiver Quelle den vorhandenen MIDI-Player oder die Übung steuern; mobile Audiofreigabe beim Fortsetzen beibehalten.
- MIDI-Player mit „10 s zurück“ zurücksetzen, laufende Töne und LED-Vorschau neu synchronisieren und den Spiel-/Pausenzustand beibehalten; Rücksprung vor Dateianfang auf null begrenzen.
- Verifizierte Firmware-/Sample-Updatepakete, USB-Installation, Anleitung und Prüfsummen unter `dist/v1.15.1` und im GitHub-Release bereitstellen.

## 1.15.0 · 2026-11-01

- Umschaltbare Falling-Notes-Ansicht mit Canvas, synchroner Audio-/Übungszeit, proportionaler Klaviatur, Trefferlinie und 4-Sekunden-Vorschau ergänzen; Vorschau und Trennnote für blaue/grüne Handfarben einstellbar.
- MIDI-Notendauern visualisieren, Pausen und Positionswechsel direkt aus dem vorhandenen Player übernehmen; im schrittweisen Lernmodus am aktuellen Einsatz warten und bestätigte Treffer kurz aufleuchten lassen.
- Übungssequenz einmalig über eine rein lesende Abfrage laden; Animation ohne zusätzliche MIDI-/LED-Befehle und ohne Timer pro Note ausführen. Deutsche und englische Oberfläche ergänzen.

## 1.14.2 · 2026-11-01

- Temporäre Nextcloud-Uploads mit `.tmp` statt der von Nextcloud speziell behandelten `.part`-Endung anlegen; PUT-Fehler 412 nicht länger als vorhandene Zieldatei melden. Schutz vor Überschreiben bleibt aktiv.

## 1.14.1 · 2026-11-01

- Nextcloud-Speichern im seriellen Log mit getrennten PUT-/MOVE-/DELETE-Ergebnissen, HTTP- und Transportfehlern, Bytezahlen und Laufzeiten diagnostizieren; keine URLs, Zugangsdaten oder Serverantworten protokollieren.

## 1.14.0 · 2026-11-01

- Ausgewählte MIDIs per WebDAV in den konfigurierten Nextcloud-Ordner kopieren: blockweise Übertragung, temporäre Datei und abschließendes MOVE ohne Überschreiben vorhandener Dateien.

- MIDI-Favoriten samt vollständiger Datei im Browser speichern, direkt anhören, als Übung übernehmen und entfernen; auch lokale Dateien können gespeichert werden.
- Gespeicherte Online-/Nextcloud-MIDIs beim erneuten Öffnen aus dem lokalen Favoritenspeicher laden statt erneut herunterladen.
- IndexedDB-Speicherung auf 32 Dateien und insgesamt 32 MiB begrenzen, Schreibvorgänge atomar ausführen und Speicherfehler verständlich melden; DE/EN ergänzen.

## 1.13.1 · 2026-11-01

- Eigenes Klaviertasten-/LED-Logo im App-Kopf ergänzen, mit SVG-/ICO-Favicon und iPhone-Startbildschirmsymbol; alle Symbole direkt in die Firmware einbetten.

## 1.13.0 · 2026-11-01

- Eine aktive Steuersitzung mit ausdrücklicher Übernahmefrage für weitere Browser einführen; alte Sitzungen serverseitig sperren und ihre lokale Wiedergabe anhalten.
- Übung bei Besitzerwechsel pausieren, Noten und LEDs freigeben, Download abbrechen und verwaiste Sitzungen nach 30 Sekunden wieder verfügbar machen.
- Sitzung auch bei MIDI-Downloads, Update-Uploads und der Recovery-Seite prüfen; DE-/EN-Texte ergänzen.

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
