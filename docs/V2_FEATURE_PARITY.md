# PianoTrainer v2 – verbindliche Funktionsreferenz

Stand: 1. November 2026. **Phase 1 portiert, Phase 2 vorbereitet (2.0.0-alpha.2); S3-Hardwareabnahme offen.**

Referenz: Release/Tag [`v1.15.1`](https://github.com/okuemmel/PianoTrainer/releases/tag/v1.15.1), Commit **`6e8206f0dfab4b182a6550b6aa9f3f70d67e2457`**. Remote-Tag, `main` und Ausgangspunkt von `develop/v2` wurden auf denselben Commit geprüft. Der Tag und seine C3-Downloads bleiben unverändert. `include/AppInfo.h` bleibt in Phase 0 bei 1.15.1.

Der Quellcode bestimmt die Referenz. `TODO.md` enthält ältere, teils inzwischen überholte Prüfstände; für neuere Hardwarebelege zusätzlich `TESTING.md` und den Release-Commit verwenden. Ein Build oder ein vorhandener Test ersetzt keine manuelle S3-Prüfung.

## Phase-2-Vorbereitung

Freigegeben mit „dannlos“. Gemeinsame Ereignisse/Quellenledger, DIN-Parser/optionaler S3-UART-Eingang, USB-MIDI-1.0-Protokollparser, isolierter USB-Enumerationsbuild und DE/EN-Diagnose sind in [V2_MIDI_PREPARATION.md](V2_MIDI_PREPARATION.md) beschrieben. Additiv: POST `/api/midi/input` und Statusobjekte `midi`/`usbProbe`. Kein USB-Notenempfang, keine erledigte Hotplug-/Latenz- oder Hardwareabnahme. Alle v1-F-IDs bleiben hinsichtlich realem S3-Betrieb offen.

## Phase-1-Nachweis

Freigegeben durch „dnn los“. Branch `feature/v2-s3-port`, Ziel N16R8. Die Softwareänderungen und Installationsschritte stehen in [V2_S3_PORT.md](V2_S3_PORT.md). Alle F01–F51 bleiben in der Hardwareabnahme offen: Das Board ist laut Nutzer noch im Zulauf. Die folgenden Erwartungs- und Abhängigkeitsspalten beschreiben weiterhin ausdrücklich den v1-Referenzstand. Neue additive API: POST `/api/restore/preview` (gleiche Auth-/Sessionanforderungen wie Restore, keine NVS-/Laufzeitänderung).

## Leseschlüssel

- **V/B**: v1-Code im S3-Port erhalten bzw. hardwareabhängig angepasst; S3-Build und bestehende Hosttests erfolgreich. **Realer S3-Betrieb unverifiziert**, kein Paritätsnachweis. Historischer Phase-0-Status war V/U.
- **N/U**: neue v2-Anforderung, in v1 nicht vorhanden; noch nicht implementiert.
- **P1**: nach Freigabe unverändert übernehmen bzw. hardwareabhängig portieren, danach am S3 prüfen.
- **P4**: zunächst v1-Verhalten erhalten; gemeinsame Zeitbasis/spurbezogene Erweiterung erst in Phase 4.
- Testkürzel: **W** `test/web.test.cjs`, **L** `test/test_logic/test_main.cpp`, **T** `test/test_training/test_main.cpp`, **MF** `test/midi-file.test.cjs`, **MP** `test/midi-player.test.cjs`, **FN** `test/falling-notes.test.cjs`, **AU** `test/piano-audio.test.cjs`, **LB** `test/library.test.cjs`, **FV** `test/favorites.test.cjs`, **NC** `test/nextcloud-upload.test.cjs`, **MT** `test/maintenance.test.cjs`, **I18N** `test/i18n.test.cjs`, **PY** `test/test_tools.py`.
- **M01–M22** sind die noch auszuführenden manuellen Regressionen in [V2_TEST_PLAN.md](V2_TEST_PLAN.md). Abhängigkeiten nennen bestehende Komponenten; S3-Vorschläge sind keine neuen Zusagen über bereits getestete Hardware.

## Training, Eingabe, Wiedergabe und Darstellung

| Funktion / Beschreibung | Implementierungsort | Abhängigkeiten | API | Gespeicherte Daten | Erwartetes v1-Verhalten | S3-Umsetzung | Test / Regression | Status |
|---|---|---|---|---|---|---|---|---|
| F01 Freies Spielen | `MidiInput.h`, `TrainingController.cpp`, `app.js::keyboard` | Mapping, Lernengine, LEDs | POST `/api/midi`, `/api/training` | LED-Kanalfilter; Spielzustand RAM | Mehrere virtuelle Tasten, Note-Off/Velocity 0, sofortige Anzeige; keine Bewertung | P1; physische Quellen später ergänzen | L/T/W, M01 | V/B |
| F02 Virtuelle Eingabe | `app.js::keyboard`, `noteCommand`, `MidiInput.h` | Pointer/Touch, Befehlswarteschlange | POST `/api/midi` | Sendekanal/Velocity im Formular, Filter in NVS | Pointer-Capture, mehrere Finger, Space/Enter, geordnete On/Off; Werte validieren | P1, gleiche Route als Eingangsadapter | W, M01 | V/B |
| F03 Release und Verbindungswächter | `MidiInput.h`, `app.js` | Browser-Heartbeat, `millis()` | POST `/api/midi` mit `release`/`heartbeat` | RAM, kein dauerhafter Zustand | 900-ms-Browserheartbeat bei Eingabe/Training; nach >3 s ohne Kontakt loslassen und pausieren; Blur löst virtuelle Tasten | P1; später strikt pro Quelle trennen | T/W, M01/M18 | V/B |
| F04 Geführtes Lernen / Wait for Note | `TrainingEngine.h`, `TrainingController.cpp` | `TrainingSequence` | POST/GET `/api/training` | laufende Übung RAM | Schritt nur nach korrekten neuen Anschlägen; exakt geforderter Akkord, keine zusätzlichen gehaltenen Töne; gleiche Note erneut anschlagen | P1; v2-Policy für bereits gehaltene Tasten explizit ergänzen | T/W, M02 | V/B |
| F05 Rhythmustraining | `TrainingEngine.h` | monotone Millisekunden | `/api/training`, `/api/status` | Formularwerte RAM | 4-Schlag-Einzähler; früh/falsch/verpasst unterscheiden; Timingfenster 80–400 ms, BPM 40–200 | P1, P4 gemeinsame Uhr | T/W, M02 | V/B |
| F06 Song-Modus | `TrainingEngine.h`, `app.js::trainingCommand` | Schritte, Timing | POST `/api/training` | RAM | Wahl zwischen schrittweise und zeitgebunden; Pausen-/Abschlusszustände | P1, P4 | T/W, M02 | V/B |
| F07 Trainingssteuerung und Kennzahlen | `TrainingController.cpp`, `app.js::renderTraining` | Engine-Revisionen | `/api/training`, `/api/status` | laufende Werte RAM | Start, Pause, Resume, Stop/frei; Fortschritt, richtig/falsch/verpasst, Trefferquote, mittlere absolute Timingabweichung und Taktanzeige | P1; Befehle später an einen Core-Owner | T/W, M02 | V/B |
| F08 Alle 19 Übungsvorlagen | `TrainingCatalog.h`, `app.js::renderPresetCatalog` | Grundnote, Mapping | GET/POST `/api/training` | Vorlagen kompiliert; Auswahl RAM | Alle unten aufgeführten IDs und Grundnotenanpassung bleiben erhalten; ungültiger Bereich wird abgelehnt | P1, IDs stabil | T/W, M03 | V/B |
| F09 Alle 20 Lektionen | `LessonCatalog.h`, `LessonRoutes.cpp`, `app.js::loadLessons` | Vorlagen, passende Root-Lage | GET `/api/lessons`; POST `/api/training` `lesson` | Katalog kompiliert | Kapitel, Ziele, Anweisungen, Startparameter, alle frei wählbar, Empfehlung erste unbestandene Lektion | P1, IDs stabil | T/W/I18N, M03 | V/B |
| F10 Bewertungen und Lernfortschritt | `LessonProgress.h`, `ConfigManager.cpp`, `LessonRoutes.cpp` | Preferences | GET `/api/lessons`; POST `/api/lessons/reset` | pro ID `runs:uint16`, `best:0..100`, NVS-Profil | Nur abgeschlossene Runs; Bestwert sinkt nicht; ab 80 % bestanden; 1/2/3 Sterne bei Abschluss/80/95 %; Speicherfehler sichtbar | P1, Schema/IDs übernehmen | T/W, historischer C3-Beleg, M04 | V/B |
| F11 Eigene MIDI-Dateien | `midi-file.js`, `app.js::importSelectedMidi` | SMF-Parser im Browser | POST `/api/training` `custom` | ausgewählte Datei/Abschnitt RAM | Formate 0/1, PPQN, bis 64 Spuren, 2 MiB/250.000 Ereignisse; Running Status, Akkordgruppen, beschädigte Dateien ablehnen | P1; Parser behalten, kein S3-Komplettrewrite | MF/W, M05 | V/B |
| F12 Importoptionen und Grenzen | `midi-file.js`, `TrainerWebServer.cpp::trainingCommand` | Parser, Engine | POST `/api/training` | Kanal, ±48 Halbtöne, Start-Einsatz, Bereichsfilter im Formular | Kanal 0 alle außer Schlagzeugkanal 10; 1/32-Raster, max. 128 Schritte/8 Noten je Akkord, Ticks 60–7680; lange Pausen teilen; Tempo fürs Üben vereinheitlichen | P1; spätere Erhöhung explizit über alle Validatoren | MF/T/W, M05 | V/B |
| F13 Datei anhören | `midi-player.js`, `app.js::playSelectedMidi` | Web Audio, Parser, PianoAudio | Datei lokal; `/api/playback` nur LED-Spiegel | Player RAM, keine Dateipersistenz auf ESP | Vollständige Datei statt nur 128 Schritte; Original-Tempoereignisse und Notendauern; max. zwei Stunden/32 Stimmen, Kanal-/Transpositionswahl | P1, P4 spätere S3-Uhr | MP/MF/W, M06 | V/B |
| F14 Player-Transport | `midi-player.js::pause/resume/seek`, `app.js` | AudioContext, User Gesture | `/api/playback` | Position/Volume RAM | Pause, Fortsetzen, Stopp, Lautstärke; Falling-Notes-Tasten Pause und 10 s zurück; bei Rücksprung Stimmen freigeben, Pause erhalten, bei null begrenzen | P1, P4 generationengesicherter Seek | MP/W, M06/M08 | V/B |
| F15 Hintergrund-/Seitenwechsel | `app.js::route`, `visibilitychange`, `blockSession` | Browser-Lifecycle | POST `/api/training`, `/api/midi`, `/api/playback` | RAM | Bloßer Blur stoppt Player nicht; Hintergrund pausiert mit Position/Grund; andere Trainerseite stoppt Player und pausiert Übung; Sitzungstrennung sperrt Steuerung | P1; später Quelle und globale Transportpolicy unterscheiden | W, M06/M18 | V/B |
| F16 Lokaler Klavierklang | `piano-audio.js`, `piano-samples.bin`, `piano-credits.txt` | Web Audio, LittleFS | GET `/piano-samples.bin`, `/piano-credits.txt` | Sampledatei Gerät; dekodierte Bank Browser-RAM | 16 lokale MP3-Samples (361.613 Bytes), Transposition nächster Ton, Velocity/Filter/Hüllkurve; Synthesizer-Fallback; Tastenklang optional | P1, kein externer Soundfont-Server | AU/W, M07 | V/B |
| F17 Mobile Audiofreigabe | `piano-audio.js::unlock`, `app.js` | Browser-Audioregeln | keine eigene Route | keine | Resume direkt im Klick, Playback-Audiositzung soweit verfügbar, unterbrochenen Kontext behandeln; Laden mit Rückfall/Fehlermeldung | P1; hörbarer iOS-Test bleibt Pflicht | AU/W, M07 | V/B |
| F18 Notenvorschau | `app.js::renderScore`, `midi-player.js::scoreStatus` | SVG, v1-Status/Player | GET `/api/training`, `/api/status` | `showScore`, `scoreLabels` in localStorage | Aktuell + fünf Einsätze, Violin/Bass, Akkorde/Pausen, Hilfslinien/Kreuze/Oktavmarken, H/B-Texte, optional Notennamen; keine vollständige Partitur | P1, P4 synchronisieren | W/I18N/MP, M08 | V/B |
| F19 Falling Notes | `falling-notes.js`, `app.js::fallingSnapshot` | Canvas, RAF, Audiouhr oder Übungsstatus | GET `/api/training/sequence`, `/api/status` | Modus `trainingDisplay` localStorage; Vorschau/Trennnote RAM | 2/4/6/8 s Vorschau, Standard 4; blaue/grüne Trennnotenfarben C3/C4/C5, proportionale Tasten, Trefferlinie, gehaltene Tasten, Trefferblitz, Pause/Seek/Wait | P1, P4; echte Hand-/Spurzuordnung noch nicht vorhanden | FN/W, M08 | V/B |
| F20 Vergrößerte Ansicht | `app.js::setFallingFocus`, `style.css` | responsive CSS, sicherer Canvas-Rahmen | wie F19 | RAM | Ansicht vergrößern/verkleinern, Escape, Transporttasten erreichbar; bei Ansichts-/Seitenwechsel zurücksetzen; RAF aus bei verborgenem Panel | P1 | W/FN, M08/M14 | V/B |
| F21 Wiedergabe auf physischen LEDs | `app.js::playbackLeds`, `TrainingController::preview` | Player-Noten, Netzwerk, Mapping | POST `/api/playback` | Vorschau RAM | Bis 32 Noten, gleiche Tonhöhe stärkste Velocity; keine Trainingspunkte; Übung pausieren; Pause/Stop freigeben; Vorschau-Watchdog 3 s | P1, P4 lokal terminieren statt Browser-HTTP-Takt | W/MP, M06/M09 | V/B |

## LEDs, Bibliothek und System

| Funktion / Beschreibung | Implementierungsort | Abhängigkeiten | API | Gespeicherte Daten | Erwartetes v1-Verhalten | S3-Umsetzung | Test / Regression | Status |
|---|---|---|---|---|---|---|---|---|
| F22 Streifen-Konfiguration | `TrainerLogic.h`, `ConfigManager.cpp`, `app.js::renderConfig` | Board-Allowlist, NeoPixel | GET/POST `/api/config` | NVS `profile.led` | 1–300 LEDs, Helligkeit 1–100 %, GPIO, RGB/GRB, Startoffset, Reihenfolge umkehren; bei Fehler alte Konfiguration behalten | P1, S3-Pins separat validieren | L/W, M09 | V/B |
| F23 Individuelle Zuordnung / Kalibrierung | `TrainerLogic.h::ledForNote`, `app.js` | 128er Mapping | `/api/config`, POST `/api/led` | `mapping[128]`, `first`, `reversed` | -1 deaktiviert; mehrere Noten pro LED zulässig; Auto-Zuordnung; Einzeltest; stärkste Velocity bei Mehrfachzuordnung | P1 | L/W, M09 | V/B |
| F24 Tastaturprofile und eigene Bereiche | `TrainerLogic.h`, `LessonCatalog.h`, `app.js::syncKeyboardLayout` | Mapping, Lektionen, Parser | `/api/config` | `keys`, `baseNote` | 49:48–96, 61:36–96, 76:28–103, 88:21–108; eigene 1–88 Tasten innerhalb 0–127; fehlende LED-Zuordnungen anzeigen | P1, kein kleineres Profil erzwingen | L/T/W/FN, M10 | V/B |
| F25 LED-Tests und Effekte | `LedController.cpp`, `app.js::sendLed` | NeoPixel/RMT | POST `/api/led` | Testfarbe/Index RAM | `off`, `single`, `color`, `sequence`, `chase`, `colors`, `brightness`, `diagnostic`; RGB/W-Schnelltasten; Diagnosetest erste LED max. 10 % | P1; Ausgabeadapter später optimieren | W + physische Prüfung M11 | V/B |
| F26 Lernfarben / Takt | `LedController::trainingFrame`, `TrainingController.cpp` | Engine held/targets/error | `/api/midi`, `/api/training` | Farben im Quellcode, nicht in NVS | Ziel blau/türkis, gehalten grün/Velocity, Fehler rot ca. 450 ms, rhythmischer Zielpuls; **keine** frei konfigurierbaren Zustandsfarben | P1, spätere optionale Vorschau additiv | T/W + M02/M11 | V/B |
| F27 Virtuelle LED-Leiste | `LedController::rgbFrame`, `app.js::renderLedPreview` | tatsächlicher NeoPixel-Ausgabepuffer, Tastengeometrie | GET `/api/status`; Antworten auf Mutationen | RAM | Eine virtuelle LED pro Taste exakt am Tastenmittelpunkt, physischer Index oder „–“; Mapping/Umkehrung/shared LEDs berücksichtigen; keine optische Messung | P1 | W, M10/M11 | V/B |
| F28 Nextcloud-Ordnerkonfiguration | `LibraryRoutes.cpp`, `LibrarySettings.h`, `app.js` | WebDAV, TLS | GET/POST `/api/library/config` | Ordner, User, Passwort, optionale CA im NVS-Profil | Fester Ordner; Passwort/CA ersetzen/löschen; keine Passwortrückgabe; Origin-/Accountwechsel entfernt alte Secrets | P1 | W/L, M12 | V/B |
| F29 Nextcloud lesen und importieren | `RemoteLibrary.cpp`, `library.js::parseDav`, `app.js` | PROPFIND Depth 1, Streambuffer | `/api/library/job`, `/data`, `/cancel` | geladene Dateien Browser-RAM | Direkt enthaltene .mid/.midi-Dateien beim Trainingsaufruf, Refresh, max. 1000; keine fremden Pfade/XML-Entitäten; Import/Anhören | P1; weiterhin optionale Netzwerkquelle | LB/W, M12 | V/B |
| F30 In Nextcloud speichern | `nextcloud-upload.js`, `LibraryRoutes.cpp`, `RemoteLibrary.cpp` | 4-KiB-Chunks, PUT/MOVE/DELETE | POST `/api/library/job`, `/upload`, `/cancel` | Datei in konfigurierter Nextcloud | Originalbytes 14 B–2 MiB, `.tmp`-Zwischenobjekt, If-None-Match/Overwrite:F; kein Überschreiben; Wiederholungen/Backpressure/Abbruch; 100 % erst nach MOVE | P1; echte C3-HTTP-201-Belege, S3 erneut testen | NC/W + C3-Protokoll, M12 | V/B |
| F31 MIDIsss | `library.js`, `LibraryRoutes.cpp`, `app.js` | externe HTTPS-API optional | gemeinsame `/api/library/*` | Suchbegriff/Treffer RAM | Suche, ID/Name/Beschreibung/Bewertung; max. 200 Treffer; Download per geprüfter ID, Import/Anhören/Favorit | P1 | LB/W, M13 | V/B |
| F32 MIDICollection | dieselben Bibliotheksmodule | externes HTML-Format optional | gemeinsame `/api/library/*` | Suchseite/Treffer RAM | Seitensuche, Artist/Titel, erlaubte /midi/-Pfade desselben Hosts, Seitenwechsel; keine garantierte Fremd-API | P1 | LB/W, M13 | V/B |
| F33 Transport, Limits, TLS, Diagnose | `RemoteLibrary.*`, `library.js`, `nextcloud-upload.js` | HTTPClient, CA-Bundle/CA, NTP | `/api/library/job`, `/data`, `/upload`, `/cancel` | 16-KiB-Streambuffer + 4-KiB-Replay RAM | Ein Auftrag; Download 3 min, Upload 5 min; Liste 256 KiB, MIDI 2 MiB; keine Redirects/insecure TLS; abbrechbar, fehlerhafte Offsets ablehnen; serielle Uploadphasen ohne Secrets | P1; Hintergrundworker erhalten | LB/NC/W, M12/M13/M18 | V/B |
| F34 Favoriten mit vollständigen Dateien | `midi-favorites.js`, `app.js` | IndexedDB | **keine Geräte-API** | DB `piano-trainer-favorites`, Version 1, Stores `meta`/`midi` | Max. 32 Dateien/32 MiB, atomar speichern/ersetzen/entfernen; wiederöffnen/importieren/anhören; Cache vermeidet Wiederdownload; Fehler bei fehlendem Speicher | P1; Origin-Umzug separat lösen | FV/W, M05/M19 | V/B |
| F35 Navigation / mobile Oberfläche | `index.html`, `style.css`, `app.js::route` | lokales HTML/CSS/JS | statische Assets | `navigationCollapsed` localStorage | Übersicht, Training, LEDs, WLAN, Importe, MIDI, System; ausblendbare Navigation; Optionen/Listen kompakt, Touch und horizontales Klaviaturscrollen | P1, bestehende IDs/Hashrouten erhalten | W, M14 | V/B |
| F36 DE/EN und Erweiterbarkeit | `i18n.js`, `data/i18n/*`, `docs/I18N.md` | lokale JSON-Kataloge | GET `/i18n/{name}.json` | `language` localStorage | Laufzeitwechsel ohne Übungsneustart/Werteverlust; deutscher Fallback; Fehlermeldung/Retry; zukünftige Sprachen via Manifest | P1; neue MIDI-/Diagnosetexte in beiden Sprachen | I18N/W, M14 | V/B |
| F37 Offline-Oberfläche und Klang | `embed_web.py`, `TrainerWebServer::file`, `main.cpp` | gzip-PROGMEM, optional LittleFS | `/`, statische JS/CSS/Icons, Samples | Firmware + Sampledatei | Keine CDN-Pflicht; UI ohne LittleFS; nur Samples aus LittleFS, sonst Synthesizer; HTTP 406 ohne gzip; Alt-UI-Dateien nicht ausliefern | P1; externe Bibliotheksquellen bleiben bewusst online | PY/W/AU, M15 | V/B |
| F38 WLAN-Scan / Verbindungswechsel | `WiFiManager.cpp`, `TrainerWebServer.cpp`, `app.js` | Arduino WiFi/DNS | GET `/api/wifi/scan`; POST `/api/wifi` | NVS `network` mit SSID/Passwort | Bis 20 Netze, asynchroner Scan, Kandidat testen und erst bei Verbindung speichern; 15-s-Fehlerpfad; keine Passwortrückgabe | P1; Funkverhalten neu messen | W + M16 | V/B |
| F39 Setup-AP / Recovery-Netz | `WiFiManager.cpp` | SoftAP, DNSServer | POST `/api/setup`, Redirect-Fallback | Routerdaten NVS, AP-Status RAM | `MIDI-Trainer-Setup`, bestehendes Setup-Passwort, 192.168.4.1; bei fehlendem/gescheitertem Router; AP nach erfolgreicher Verbindung nach 30 s schließen | P1, physisch testen | W + M16 | V/B |
| F40 IP-Konfiguration / Hostname | `NetworkSettings.h`, `WiFiManager.cpp`, `app.js::renderNetwork` | DHCP, mDNS | GET `/api/status`; POST `/api/network` | Hostname im Profil | IP/Subnetz/Gateway/DNS/MAC/RSSI, AP-Daten, .local-Link; Hostname 1–31 ASCII-Zeichen, Neustart; **kein** DDNS-/statischer-IP-Client | P1 | L/W, M16 | V/B |
| F41 Optionale Webanmeldung | `TrainerWebServer::auth`, `ConfigManager.cpp`, `app.js` | HTTP Basic Auth | POST `/api/access`, `/api/password`; alle geschützten Routen | NVS `auth-enabled`, `access`, `auth-v1` | Standard aus; bei Aktivierung admin/gesetztes Passwort; vorhandene Defaults/Migrationsmarker respektieren; Änderung 12–63 druckbare ASCII-Zeichen | P1; keine Credentials im Export/HTTP-Log | W + M17 | V/B |
| F42 Aktive Steuersitzung / Takeover | `ControlSession.h`, `TrainerWebServer.cpp`, `app.js` | Zufallstoken, Browser-Poll | POST `/api/session`; `X-Session`, `X-Trainer` | RAM, kein permanenter Token | 30-s-Lease, ausdrückliche Übernahme; alte Seite 409 `session_conflict`, lokal stoppen/inert; Übernahme pausiert, gibt LEDs frei, bricht Libraryjob ab; keine automatische Rückeroberung | P1, physische Quellzustände später sauber trennen | L/W/MT, M18 | V/B |
| F43 JSON-Backup | `ConfigManager::backup`, `MaintenanceRoutes.cpp`, `app.js` | ArduinoJson, Preferences | GET `/api/backup` | exportierte Datei `format`, `schema:1`, hostname, LED, Cloud ohne Passwort, alle Lessons, Firmware | Keine WLAN-/Geräte-/Cloudpasswörter; kein Browser- oder MIDI-Dateibackup | P1; v1-Felder erhalten | W/PY + C3-Protokoll, M19 | V/B |
| F44 Validiertes Restore / NVS-Migration | `ConfigManager::applyProfile`, `begin`, `MaintenanceRoutes.cpp` | Schema 1, Validatoren, ein Profilblob | POST `/api/restore` | NVS-Namespace `trainer`; Altkeys → `profile` | Alles prüfen vor Commit; `RESTORE`; ungültige Daten ohne Änderung; alter GPIO muss gültig sein; WLAN/Login bleiben auf demselben Gerät, Cloudsecret nur bei gleichem Account/Origin; Neustart | P1 mit expliziter C3→S3-Pinübersetzung/Preview | W/L + historische C3-Prüfung, M19 | V/B |
| F45 Reset / physische Hilfe | `main.cpp`, `LessonRoutes.cpp`, `TrainerWebServer.cpp` | BOOT GPIO9, NVS | POST `/api/reset`, `/api/lessons/reset` | alle NVS-Daten bzw. nur Fortschritt | `WERKSRESET`/`LERNFORTSCHRITT`, Bestätigung; BOOT im Betrieb >8 s; serielle t/T-Diagnose und x/X aus | P1; S3-BOOT-/Konsolenpins anpassen | W/T + M04/M20 | V/B |
| F46 Firmware-OTA inkl. Weboberfläche | `MaintenanceRoutes.cpp`, `maintenance.js`, `app.js`, `build_update.py` | Update/OTA-Slot, MD5 | POST `/api/update` Multipart | freie Apppartition, otadata, NVS bleibt | 256-B-Manifest, schema1, target esp32c3, Chip-ID-Check; falsches Ziel/Größe/Hash ablehnen; 99→100 nach Prüfung; Neustart; keine automatische Post-Boot-Rückrollgarantie | P1, hardwaregebundene S3-Pakete + gegenseitige Ablehnung | MT/PY/W + M21 | V/B |
| F47 Optionales LittleFS-Update | dieselben OTA-Module | einzelne LittleFS-Partition 0xF0000 | POST `/api/update` kind `web` | Samplebank, Altdaten im Image | Genau Partitionsgröße; unmount/remount; Unterbrechung kann Dateisystem beschädigen; UI bleibt firmwareseitig; keine zweite FS-Kopie | P1; neues Layout niemals raten | MT/PY + M21 | V/B |
| F48 Recovery-Seite | `MaintenanceRoutes.cpp::recoveryPage` | Seite in Firmware, gültig laufende App | GET `/recovery`, POST `/api/session`, `/api/update` | keine eigenen | Zweisprachiger Firmwareuploader ohne LittleFS, explizite Übernahme und Bestätigung; kein ROM-Ersatz bei kaputter App | P1; zusätzlicher USB/UART-ROM-Weg sichern | MT + M21 | V/B |
| F49 Diagnose / Herkunft / App-Symbole | `main.cpp`, `AppInfo.h`, `app.js`, SVG/ICO/PNG | Serial, Status-API | GET `/api/status`, `/logo.svg`, `/favicon.ico`, `/apple-touch-icon.png` | Version/Autor/Repo kompiliert | Heap/Flash/Uptime/Board/Pins/WLAN, Serial-Logs, Fußzeile/GitHub/Vibe-Coding-Hinweis, Favicon/Startsymbol | P1, S3/PSRAM-Diagnose additiv | W/PY, M20/M22 | V/B |
| F50 Reproduzierbarer Build / Downloads | `platformio.ini`, `partitions.csv`, `tools/*.py`, `dist/*` | festgelegte SDK-/Libversionen, Python | keine App-API | versionierte fünf Release-Dateien/Prüfsummen | Firmware+Web gemeinsam, deterministisches gzip; geprüftes .ptupdate und USB-ZIP ohne NVS; aktuelle C3-Downloads unverändert erhalten | P1 neue S3-Ziele/Offsets/target; alte Pakete nicht neu labeln | PY + Builds + M21 | V/B |
| F51 Tests, Dokumentation und Quellen | `test/*`, README, TESTING, docs, Changelog | Node/jsdom/fake-indexeddb/Unity/Python | Testfixtures der echten v1-API | Dokumente, Samples/Illustrationen mit Quellenangaben | 85 Node-, 21 native, 4 Python-Tests; Prüfstände klar von realer Hardware trennen; Änderungslog weiterführen | P1 bestehende Tests behalten, S3-Instrumentierung ergänzen | kompletter Testplan, M22 | V/B |

## Was v1 ausdrücklich noch nicht implementiert

| Anforderung | Tatsächlicher Befund / Ort | API / Daten heute | Geplanter Schritt | Test | Status |
|---|---|---|---|---|---|
| N01 DIN-MIDI / USB-MIDI-Host | v1: nur Simulation. Jetzt gemeinsame Ereignisse/Router, MIDI-Byteparser und optionaler S3-DIN-UART; USB-Paket-/Deskriptorparser und separater Enumerationsprobe-Build | POST `/api/midi/input`, additive Diagnose; Quelle/Typ/Zeitstempel im Ereignis | USB-Bulk-Empfang/Generationen/Queue/Fehlerbereinigung und reale Hardwareprüfung folgen | native MIDI-/W-Tests; U01–U04 teilweise, H01–H03 offen | vorbereitet / nicht HW-abgenommen |
| N02 Gemeinsame musikalische Uhr | AudioContext-Player im Browser; Engine auf ESP32-`millis`; HTTP-LED-Spiegel, keine Transportreplikation | keine Clock-Epoch, keine Sync-Timestamps | Phase 4, ADR/Zeitprotokoll in Architektur | U05, H05 | N/U |
| N03 Spur-/Handtraining, Begleitspuren | Spurereignisse zu Tonliste verschmolzen; keine auswählbaren Begleit-/Übungsspuren, Splitfarbe ist Pitch-Heuristik | Voiceobjekte tragen keine dauerhafte Track-/Channel-ID | Phase 4, Parser-Metadaten additiv behalten | U06, M05/H05 | N/U |
| N04 Wiedergabetempo-Faktor | Übungs-BPM veränderbar, Dateiwiedergabe folgt Tempo-Map; kein globaler Dateiplayer-Rate-Regler | keine Rate-Eigenschaft | Phase 4, gemeinsame Transportsteuerung | U05/H05 | N/U |
| N05 Zehnnotige Trainingsakkorde / gehaltene Akkorde | Freie Eingabe polyphon; Lerngrenze 8, frische Anschläge und exakt passende gehaltene Tasten | Engine/Parser/API-Limits stimmen auf 8 überein | Gezielte gemeinsame Erweiterung auf mindestens 10, neue Halte-/Toleranzpolicy explizit | U03/U07/H04 | N/U |
| N06 Frei konfigurierbare LED-Vorschauzustände | Lernfarben hartcodiert, kommender Einsatz nur grafisch; allgemeine Farbe und Helligkeit bereits vorhanden | keine Preview-Farben im Schema | Phase 3/4, Defaults kompatibel, optional | U07/H04 | N/U |
| N07 Latenz-/Taskdiagnose, WebSocket | Keine Eventqueue-Messwerte/P95/P99; WebServer HTTP-Poll, kein WebSocketserver | Status-Heap ist keine Latenzmessung | Phase 3; optionales Sync-Transportprotokoll Phase 4 | U08/H04/H06 | N/U |
| N08 S3-Update-/Migrationsprofil | Board-/Layoutbindung in Paketbauer, Firmware und Browser; schema-1-Restore-Vorabprüfung und binärer Browserdatenumzug implementiert | additive Statusfelder, POST `/api/restore/preview`; alte Routen erhalten | Software portiert; echte NVS-/OTA-/Recovery-Migration auf S3 noch prüfen | MT/PY/W/FV, U09/H07 | implementiert / HW offen |
| N09 Adaptive Begleitung | Nicht vorhanden | keine | Nur Machbarkeit/Architektur dokumentieren, keine Umsetzung vor stabiler Synchronisation | spätere eigene Abnahme | N/U |
| N10 URL-Updater / DDNS / Akkordnamen | Nicht vorhanden; Dateiupload, mDNS und Notenakkorde sind vorhanden | keine | Keine v1-Paritätsanforderung; nicht stillschweigend als vorhanden behandeln | optional später separat | N/U |

## Vollständige Katalog-IDs

19 Vorlagen: `five`, `scale`, `chords`, `rhythm`, `joy`, `twinkle`, `single`, `neighbors`, `three`, `fingers`, `thirds`, `fourths`, `octaves`, `arpeggio`, `minor`, `alternate`, `together`, `quarters`, `rests`. `custom` ist zusätzlich der Importweg, keine zwanzigste Vorlage.

20 Lektionen: `first-note`, `neighbors`, `three-notes`, `five-fingers`, `finger-changes`, `left-hand`, `thirds`, `fourths`, `octaves`, `major-scale`, `arpeggio`, `minor-chords`, `major-chords`, `alternating-hands`, `together`, `quarter-pulse`, `eighth-notes`, `rests`, `joy`, `twinkle`. Je ID müssen Titel, Kapitel, Lernziel, Anweisung, Preset, Mode, BPM und Root-Offset erhalten bleiben; Datensatzgleichheit gegen den Referenzcommit testen.

## API-Vertrag und Vollständigkeit

Alle unten inventarisierten Methoden/Pfade einschließlich Fehlerverhalten bleiben verfügbar. Felder, Bestätigungswörter und Methoden nicht umbenennen. Ohne aktivierte Webanmeldung sind GETs ohne Sessionheader grundsätzlich lesbar; Mutationen benötigen `X-Trainer:1` und die kontrollierende `X-Session`. **GET `/api/library/data` ist absichtlich ebenfalls ein kontrollierter Zugriff** (`auth(true)`). Bei gesetztem Sessionheader können auch andere GETs 409 `session_conflict` liefern. API-Fehler bleiben `{error:...}`, Sessionkonflikte behalten zusätzlich `code`. Neue v2-Zustände/Endpunkte additiv/versioniert einführen.

Die Routenliste folgt aus den `server.on`-Registrierungen im Referenzquellcode. Dynamische Sprachrouten, Multipart-Uploadhandler und der AP-Redirect werden zusätzlich erfasst.

| Pfad | Methoden | Implementierung |
|---|---|---|
| `/` | GET | `src/TrainerWebServer.cpp` |
| `/api/access` | POST | `src/TrainerWebServer.cpp` |
| `/api/backup` | GET | `src/MaintenanceRoutes.cpp` |
| `/api/config` | GET, POST | `src/TrainerWebServer.cpp` |
| `/api/led` | POST | `src/TrainerWebServer.cpp` |
| `/api/lessons` | GET | `src/LessonRoutes.cpp` |
| `/api/lessons/reset` | POST | `src/LessonRoutes.cpp` |
| `/api/library/cancel` | POST | `src/LibraryRoutes.cpp` |
| `/api/library/config` | GET, POST | `src/LibraryRoutes.cpp` |
| `/api/library/data` | GET | `src/LibraryRoutes.cpp` |
| `/api/library/job` | GET, POST | `src/LibraryRoutes.cpp` |
| `/api/library/upload` | POST | `src/LibraryRoutes.cpp` |
| `/api/midi` | POST | `src/TrainerWebServer.cpp` |
| `/api/network` | POST | `src/TrainerWebServer.cpp` |
| `/api/password` | POST | `src/TrainerWebServer.cpp` |
| `/api/playback` | POST | `src/TrainerWebServer.cpp` |
| `/api/reset` | POST | `src/TrainerWebServer.cpp` |
| `/api/restore` | POST | `src/MaintenanceRoutes.cpp` |
| `/api/session` | POST | `src/TrainerWebServer.cpp` |
| `/api/setup` | POST | `src/TrainerWebServer.cpp` |
| `/api/status` | GET | `src/TrainerWebServer.cpp` |
| `/api/training` | GET, POST | `src/TrainerWebServer.cpp` |
| `/api/training/sequence` | GET | `src/LessonRoutes.cpp` |
| `/api/update` | POST | `src/MaintenanceRoutes.cpp` |
| `/api/wifi` | POST | `src/TrainerWebServer.cpp` |
| `/api/wifi/scan` | GET | `src/TrainerWebServer.cpp` |
| `/app.js` | GET | `src/TrainerWebServer.cpp` |
| `/apple-touch-icon.png` | GET | `src/TrainerWebServer.cpp` |
| `/falling-notes.js` | GET | `src/TrainerWebServer.cpp` |
| `/favicon.ico` | GET | `src/TrainerWebServer.cpp` |
| `/i18n.js` | GET | `src/TrainerWebServer.cpp` |
| `/library.js` | GET | `src/TrainerWebServer.cpp` |
| `/logo.svg` | GET | `src/TrainerWebServer.cpp` |
| `/maintenance.js` | GET | `src/TrainerWebServer.cpp` |
| `/midi-favorites.js` | GET | `src/TrainerWebServer.cpp` |
| `/midi-file.js` | GET | `src/TrainerWebServer.cpp` |
| `/midi-player.js` | GET | `src/TrainerWebServer.cpp` |
| `/nextcloud-upload.js` | GET | `src/TrainerWebServer.cpp` |
| `/piano-audio.js` | GET | `src/TrainerWebServer.cpp` |
| `/piano-credits.txt` | GET | `src/TrainerWebServer.cpp` |
| `/piano-samples.bin` | GET | `src/TrainerWebServer.cpp` |
| `/recovery` | GET | `src/TrainerWebServer.cpp` |
| `/style.css` | GET | `src/TrainerWebServer.cpp` |
| `/i18n/{name}.json` | GET, validierter Sprach-/Manifestname | `TrainerWebServer.cpp::onNotFound` → EmbeddedWeb |
| sonstige `/api/*` | nicht vorhanden → 404 JSON | `TrainerWebServer.cpp::onNotFound` |
| sonstige Nicht-API-Pfade | AP: 302 auf Setupadresse; sonst 404 | `TrainerWebServer.cpp::onNotFound` |

Persistenzvertrag und Hardwarefreigaben: [V2_MIGRATION_PLAN.md](V2_MIGRATION_PLAN.md). Architektur, Wiederverwendung und offene Entscheidungen: [V2_ARCHITECTURE.md](V2_ARCHITECTURE.md).
