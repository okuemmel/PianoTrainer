# PianoTrainer v2 – Prüfplan und Nachweisführung

Stand: 1. November 2026. **Phase 1: Softwareport getestet, Hardwareabnahme offen.** Referenz: Tag v1.15.1, Commit `6e8206f0dfab4b182a6550b6aa9f3f70d67e2457`. Alle F-/N-IDs beziehen sich auf [V2_FEATURE_PARITY.md](V2_FEATURE_PARITY.md), Phasengates auf [V2_MIGRATION_PLAN.md](V2_MIGRATION_PLAN.md).

## Phase-1-Ergebnisse · 2.0.0-alpha.1

Am 1. November 2026 nach Freigabe ausgeführt, Branch `feature/v2-s3-port`. Das Board befindet sich noch im Zulauf. **Keine realen C3-/S3-Uploads oder Hardwaretests in dieser Phase.** Anbieterbeschreibung WROOM-1-N16R8 und geplanter OTraki-DIN/USB-Konverter sind im [Portierungsbericht](V2_S3_PORT.md) erfasst.

| Prüfung | Tatsächliches Ergebnis | Aussagegrenze |
|---|---|---|
| `npm test` | **89/89 bestanden** | Bestehende 85 Tests erhalten; neue Fälle für S3-/C3-Kreuzpakete, binäre Browsermigration/Integritätsfehler/atomare Limits, S3-Status/Restore-GPIO-Vorabprüfung |
| `pio test -e native -e native_s3` | **42/42 bestanden**, je 21 mit beiden Boardprofilen | portable Mapping-/GPIO-/Lern-/Katalog-/Sessionlogik, keine physische Ansteuerung |
| Python-Buildwerkzeuge | **6/6 bestanden** | Chips/Layouts/Größen/Partitionen/Pakete/Releaseartefakte; keine reale OTA-Übertragung |
| Prettier + clang-format der geänderten C++-Quellen | bestanden | Formatprüfung, kein Laufzeitnachweis |
| S3-Firmwarebuild | erfolgreich; statischer RAM **57.188/327.680 B**, Linker-Flash **1.275.573/4.194.304 B** | Linkermap bindet `esp32s3/qio_opi`; keine gemessene PSRAM-Erkennung/Heapwerte |
| C3-Regressionsbuild | erfolgreich; statischer RAM **51.324/327.680 B**, Linker-Flash **1.304.798/1.572.864 B** | Entwicklungsbuild, ersetzt nicht die stabile v1-Hardwareabnahme |
| Beide LittleFS-Builds | erfolgreich; S3 **8.323.072 B**, C3 **983.040 B** | Imagegröße entspricht jeweiliger Partition; kein Mount-/Unterbrechungstest am Gerät |
| Getrennte Artefaktbündel | beide erstellt, alle SHA-256-Summen erneut geprüft | `dist/v2.0.0-alpha.1/{s3_n16r8,c3_supermini}`; keine Releasefreigabe |
| M01–M22 / H01–H07 | **weiterhin offen** | kein S3 verfügbar; browserseitige Testdoubles beweisen keine reale NVS-/OTA-/iOS-Parität |

Anwendungsimages ohne Paketkopf:

- S3: **1.275.936 B**, SHA-256 `5a57d0537bf23952669bb1283f9e7f564200595860af1bcf0767d74a281a3205`.
- C3-Datenexporthilfe: **1.355.808 B**, SHA-256 `d235d15f7ddca0d3729ba9c8a7b0357c358c57e96dc48d9d33b27685df9242a8`.

Die folgenden Abschnitte bewahren das Phase-0-Baselineinventar und die vollständigen noch offenen manuellen Abnahmekriterien. Phase 2 (MIDI-Parser/USB-Host) und Phase 3/4 sind nicht durch diese Tests erledigt. U09/U10 sind hinsichtlich vorhandener Paket-/Browserfälle teilweise implementiert; vollständige Konfigurations-/Hardwaremigration und Fehlerabnahme bleiben offen.

## 1. Erneut ausgeführte Baselineprüfungen

Am 1. November 2026 auf dem unveränderten v1.15.1-Programmstand im Branch `develop/v2` erneut ausgeführt; die Phase-0-Änderungen sind ausschließlich Dokumentation.

| Prüfung | Tatsächliches Ergebnis | Aussagegrenze |
|---|---|---|
| `npm test` | **85/85 bestanden**, 0 fehlgeschlagen | Node/jsdom und Testdoubles, keine hörbare iOS-Ausgabe oder physischer MIDI-Empfang |
| `pio test -e native` | **21/21 bestanden** | portable C++-Logik, keine S3-Treiber-/Timingmessung |
| `python3 -m unittest discover -s test -p test_tools.py` | **4/4 bestanden** | Paket-/Release-/EmbeddedWeb-/Changelogwerkzeuge, keine echte OTA-Unterbrechung |
| `npm run format:check` | bestanden | Formatprüfung bestehender Web-/Testquellen |
| `pio run -e c3_supermini` | erfolgreich; RAM **51.324/327.680 B**, Linker-Flash **1.300.624/1.572.864 B** | reproduzierbarer C3-Build, kein S3-Build und keine Feature-Parität |
| S3-Build, Upload oder Messung | **nicht ausgeführt** | noch keine S3-Umgebung, Phase 1 nicht freigegeben |
| LittleFS neu bauen/flashen | nicht erforderlich für reine Dokumentationsänderung; nicht ausgeführt | letzter v1.15.1-Build/HW-Bericht in `TESTING.md`; keine neue Behauptung |

Für diese Sitzung: PIO mit `PLATFORMIO_CORE_DIR=/private/tmp/piano-pio-core` und `/private/tmp/piano-pio-venv/bin/pio`; reguläre Nutzerinstallationen benötigen diese temporären Pfade nicht. Node-Testlauf: 9.319,7 ms in dieser Messung; das ist **keine** MIDI-/LED-Latenz.

Das unveränderte C3-Release-Anwendungsimage umfasst **1.351.424 Bytes**. SHA-256 der Anwendungsbytes (ohne .ptupdate-Header): `d49c7d80f5df37f673fa58a555e271747963d2ffad6f37ffe967cff683e20568`. Das ist eine Artefaktreferenz, kein S3-Image.

Historische C3-Nachweise in `TESTING.md`: USB-Flash/Hash/API-Versionsprüfung, lokale Webauslieferung, Nextcloud-PUT/MOVE mit HTTP 201, Profil-/Backupvergleich und negative Updatefälle. Diese Ergebnisse werden **nicht** als in Phase 0 erneut ausgeführte Hardwaretests verbucht. Dort dokumentierte offene Fälle wie Stromausfall, fehlendes LittleFS/Bootfehler und reale iOS-Audioabnahme bleiben entsprechend offen.

### Bestehende Testsuiten – unverändert erhalten

| Datei / Suite | Anzahl | Wesentliche abgedeckte Verträge |
|---|---|---|
| `test/falling-notes.test.cjs` | 4 | Tastengeometrie 49/61/76/88 und schwarze Starttaste, Window/Seek/Notendauer, eine RAF-Schleife, Tempo-/Einzählerdaten |
| `test/favorites.test.cjs` | 3 | volle Bytes nach Wiederöffnen, atomare Ersetzung/Entfernung, parallele Limits/Quota |
| `test/i18n.test.cjs` | 4 | statische/dynamische Schlüssel, Kataloggleichheit, Fallback/Fehler/Sprachauswahl-Races |
| `test/library.test.cjs` | 6 | WebDAV/XML, MIDIsss/Collection, erlaubte Pfade, Chunk-Replay, Abbruch/Timeouts |
| `test/maintenance.test.cjs` | 4 | Manifest/Target/Größen, Multipart, 99/100 %, Recovery und Sessionwechsel |
| `test/midi-file.test.cjs` | 10 | Formate/PPQN/Running Status, Kanäle, Tempo, Quantisierung, große/fehlerhafte Dateien, Notendauern/überlappende Kanäle |
| `test/midi-player.test.cjs` | 2 | Scheduling/Release, Pause/Resume/Seek, Stimmenfreigabe, Scorefenster/Tempoabstände |
| `test/nextcloud-upload.test.cjs` | 2 | Ackverlust, Backpressure, vollständiger Remotecommit, Fehler/Cancel |
| `test/piano-audio.test.cjs` | 4 | Paketvalidierung, Decodecache/Retry, Sampletransposition/Velocity, mobile Freigabe |
| `test/web.test.cjs` | 46 | sämtliche Formulare/Navigation, LED-/Tastatur-/Lern-/Quellen-/Transport-/Session-/Backup-/Update-/Sprachbedienung |
| `test/test_logic/test_main.cpp` | 10 | Mapping, Grenzen/Pins, Reverse, Profile, Kanal-/URL-/Hostnamevalidatoren, ControlSession |
| `test/test_training/test_main.cpp` | 11 | Modis, frische Akkordanschläge, Einzähler/Timing/Fehler, Pause/Clockwrap, Presets/Lektionen/Bewertung |
| `test/test_tools.py` | 4 | vollständige EmbeddedWeb-Roundtrips, Header/Payload, Release-ZIP/SHA, Changelog-Idempotenz |

## 2. Regeln für neue Nachweise

Jeder Testbericht enthält Commit/Artefakthash, Datum, Boardhersteller/-revision, Modul-/Flash-/PSRAM-Erkennung, SDK-/Libraryversionen und relevante `sdkconfig`, Verdrahtung/Stromversorgung, Keyboard-Modell/VID/PID, Quelle/Kanal und Testparameter. Status: **offen**, **bestanden**, **fehlgeschlagen**, **nicht ausführbar** mit Grund. „Nicht ausführbar“ ist kein grüner Haken. Messungen auf einem Simulator oder C3 bleiben so gekennzeichnet.

Hosttests dürfen Hardwareaufrufe mit Testdoubles prüfen; die Matrix kennzeichnet daneben den tatsächlichen manuellen S3-Test. Keine vorhandene Testdatei löschen, um v2 grün zu bekommen. Neue APIs/Felder additiv und mit v1-Requests/Responses/Fehlern prüfen; keine Mocks als neue Produktionskomponenten einsetzen.

Nur synthetische MIDI-/Backup-/Credential-Fixtures versionieren. Keine WLAN-/Cloudpasswörter, Sessiontokens oder persönlichen MIDI-Dateien in Prüfprotokolle exportieren. v1 gibt das Gerätezugangspasswort ausschließlich zur lokalen Inbetriebnahme seriell aus; auch dieses muss vor Aufnahme eines Logs in Prüfberichte gefiltert werden. Lastgeneratoren und Hardwarediagnose nach Freigabe reproduzierbar implementieren; diese Planungsdatei behauptet ihre Existenz noch nicht.

## 3. Geplante automatisierte Erweiterungen

| ID / Phase | Prüfgruppe | Erforderliche Fälle | Akzeptanz |
|---|---|---|---|
| U01 / P2 | DIN-Byteparser | Note-On/Off, Velocity 0, alle 16 Kanäle, Running Status, Realtime zwischen Datenbytes, SysEx, Systemstatus, ungültige Bytes/Framing, Abbruch mitten in Nachricht, anschließende Resynchronisierung | erwartete Ereignisse exakt einmal, kein Raten fehlender Noten, begrenzte Puffer |
| U02 / P2 | USB-Parser / Hotplugmodell | korrekte und verkürzte Deskriptoren, Audio/MIDI-Streaminginterfaces, CIN/Kabel/Padding, mehrere Endpoints, Transferfehler, Gerätegeneration und alte Callbacks nach Disconnect | gültige Events, klare Ablehnung nicht unterstützter Geräte, kein Zugriff auf freigegebene Ressourcen |
| U03 / P2 | Quellen-/Kanalledger | gleiche Tonhöhe auf DIN/USB/Web und mehreren Kanälen, wiederholtes On/Off, 10-Ton-Akkorde frei, Quellen-Panic/Disconnect und virtueller Heartbeatausfall | Note-Off einer Quelle löscht andere nicht; keine hängenden Töne; stabile Zähler/Anschläge |
| U04 / P2–3 | Queue/Ownership | Burst, volle Queue, verlorenes Note-Off, Quellenreset, gleichzeitige API-/MIDI-Befehle, Snapshot-Revisionswechsel | deterministische Reihenfolge/Überlastpolicy, Verluste gezählt, keine Race-/Use-after-free-Fälle |
| U05 / P4 | Uhr/Transport/Sync | Start/Stop, Count-In, Pause/Resume, vor/zurück Seek, Tick-/Tempo-Map-Grenzen, Faktorwechsel, Milliswrap/64-bit-Uhr, Wait, Reconnect, alte Revisionsbatches/Dateiwechsel während Audio-Unlock | eine Autorität, korrekte Tick↔Zeit-Konversion und Stillstand in Pause/Wait; keine alten Stimmen/LEDs nach Seek |
| U06 / P4 | Tracks/Hände/Dateiparität | Format 0/1, volle Tempo-Map und Dauer, getrennte Track-/Channel-ID, verschiedene Hände auf einem Kanal, Übungs-/Begleitmasken, Export der Originalbytes | keine Handheuristik als echte Spurinformation; Kanalwahl/Transposition/Abschnitt aus v1 unverändert; neue Masken wirken nur wie ausgewählt |
| U07 / P3–4 | Lernen/LEDs | alle Kataloge/IDs, 49/61/76/88/individuell, frische vs. gehaltene Akkordpolicy, Toleranzen, ≥10 Trainingsnoten nach Erweiterung, Shared-Mapping/Previewzustände/Effekte | alte Fixtures identisch; neue Optionen opt-in; kein widersprüchliches 8er-Limit zwischen Parser/API/Engine |
| U08 / P3 | Diagnose | Histogramm-/Perzentilgrenzen, leerer/kleiner Datensatz, Zählerüberlauf, deaktivierte Messung, fehlende Runtime-Stats/PSRAM | P95/P99 nur mit Stichprobenzahl und definierter Einheit, „nicht verfügbar“ statt erfundener Werte, begrenzter Messoverhead |
| U09 / P1/P5 | Migration/OTA | Schema-1-Roundtrip, Legacy-NVS/kanonisches Profil, alle 20 Lektionen, Pinübersetzung, fehlerhafte Typen/Mapping/CA/Größen, ausgeschlossene Secrets, v2-Abbruch/Rollback; C3↔S3/anderes Board/Layout/Chip-ID/Hash/Shortwrite/Trailingbytes | ungültiger Input verändert keine aktiven Daten; passende Pakete reproduzierbar; fremdes Target zuverlässig abgelehnt |
| U10 / P1/P5 | UI/API-Kompatibilität | vollständiges Routeninventar, JSON-Felder/Bestätigungswörter/409-Code, Header/Auth/Session, Sprachwechsel im Betrieb, Favorites-/UI-Export am alten und Import am neuen Origin | F01–F51 erhalten; alle DE/EN-Schlüssel und keine verlorenen Browserbytes |

Für U09 besonders Firmwareheader auf HTTP-Chunkgrenzen verteilen, Dateiabbruch an jedem relevanten Punkt testen und v1-Werte nahe Grenzen verwenden. Ein Hashformat-Test ist keine vollständige Firmware-Authentifizierung; automatische Post-Boot-Rückkehr ist separat zu prüfen.

## 4. Manuelle vollständige v1-Regression am S3 – alles noch offen

Jede Zeile in DE und EN prüfen, soweit sie UI enthält. `M14` ergänzt die vollständige geräteübergreifende Layout-/Audio-Matrix. Pro Zeile tatsächlichen Testcommit, Ergebnis und Beleg eintragen; F-IDs machen die Zuordnung zur Paritätsmatrix prüfbar.

| ID | Funktionen | Durchführung / erwartetes Ergebnis | Phase-0-Status |
|---|---|---|---|
| M01 | F01–F03 | Freies Spiel, Multi-Touch/Space/Enter, Kanal und Velocity, Note-Off/0, gleiche Töne, Release/Blur; Browser schließen/Heartbeat ausfallen lassen → keine hängenden simulierten Noten | offen, S3 |
| M02 | F04–F07/F26 | Guided/Rhythm/Song zeitgebunden und schrittweise; Einzähler, korrekte/falsche/frühe/verpasste Einsätze/Akkorde, frischer Wiederanschlag; Pause/Resume/frei, Werte/Takt/LED-Farben vergleichen | offen, S3 |
| M03 | F08/F09 | Alle 19 Presets und 20 Lektionen, alle vier Kapitel, Lernziele/Anweisungen/Root-Offsets und Empfehlung; jede Variante auf 49/61/76/88 starten und abschließen | offen, S3 |
| M04 | F10/F45 | Runs/Best/1–3 Sterne und 80/95-%-Grenzen, schwächere Wiederholung, Neustart/Browserwechsel; absichtlich fehlendes Persistieren sichtbar; nur Lernfortschritt und separat Werksreset prüfen | offen, S3 |
| M05 | F11/F12/F34 | Kleine/große Format-0/1-Dateien, 64 Spuren/Grenzen, Laufstatus/Tempo/Pausen, Kanal 10/Einzelkanal, Transposition/Range/Startabschnitt, Fehlerdatei und >8er-v1-Grenze; gespeicherten Favoriten wieder öffnen | offen, S3 |
| M06 | F13–F15/F21 | Anhören neben Übungsstart, Lautstärke, Pause/Resume/Stop/10 s zurück an Anfang/Mitte/Ende; langen Ton und Akkorde über Seek prüfen; reale LEDs folgen; keine Trainingspunkte; Blur vs. Hintergrund und Seitenwechsel korrekt | offen, S3 |
| M07 | F16/F17 | Tasten- und Playerklang mit Bank/Fallback, langsames/fehlendes Sampleladen, Dekodierfehler; iOS-Lautlos-/Unterbrechungs-/Klickfreigabe prüfen; keine Internet-Samples | offen, S3 + echte iOS-Geräte |
| M08 | F18–F20 | SVG beide Schlüssel/Notennamen/extreme Lagen, Canvas schwarze/weiße Tasten, vier Vorschauzeiten, Hand-Trennnote, Trefferlinie/Tasten/Blitz, Pause/Seek/Wait; vergrößern/Escape/Transport; keine gelöschte klassische Ansicht | offen, S3 |
| M09 | F21–F23 | Pin/Helligkeit/Anzahl/Offset/RGB/GRB/Reverse, 128-Zuordnung, deaktivierte und gemeinsam genutzte LEDs; Einzelkalibrierung; falsche Konfiguration ohne Überschreiben des Altzustands | offen, S3 |
| M10 | F24/F27 | Alle vier Standardprofile und individuelle Bereiche inkl. schwarzer Starttaste, zu kurzer Streifen, Randnotennummern; virtuelle LED/Taste zentriert, physische Indizes/Shared-Mapping korrekt | offen, S3 |
| M11 | F25–F27 | Aus/Einzel/Farbe/Sequenz/Lauflicht/Farbwechsel/Helligkeitsrampe/erste-LED-Diagnose, RGBW-Schnelltasten; physische Richtung/Farben/Helligkeit und Konflikt bei Lernstart prüfen | offen, S3 |
| M12 | F28–F30/F33 | Echte Nextcloud: Ordnerliste, Unicode/Leerzeichen, Import/Anhören/Favorit, PUT/MOVE, bestehendes Ziel, Cancel, wiederholte Chunks, Origin-/Accountwechsel, private CA/fehlende Uhrzeit, Berechtigungs-/NVS-Fehler | offen, S3 |
| M13 | F31–F33 | MIDIsss/Collection Suche, Metadaten/Seiten, Import/Anhören/Favorit; fremde Pfade, geändertes HTML, Rate-/Serverfehler, Offline und Abbruch; Übung darf nicht unbeabsichtigt starten | offen, S3 + optionale Server |
| M14 | F20/F35/F36 | Alle sieben Seiten, ein-/ausblendbares Menü, Tastatur horizontal, Mobilformulare, lange Texte/Dateinamen; Sprachauswahl während Übung/Audio ohne Neustart; aktuelle iPhone-Safari/Chrome, iPad-Safari und Desktop-Browser dokumentieren | offen |
| M15 | F16/F37 | Internet getrennt, nur Setup-AP; Oberfläche/Sprachen/Datei/Favorit/Lektionen/Klang lokal; fehlendes/beschädigtes LittleFS → UI+Synthesizer und Recovery; gzip/406/Assets prüfen | offen, S3 |
| M16 | F38–F40 | Routerwechsel, gutes/schwaches WLAN, 15-s-Fehler/Setup-AP, Scan/Passwortfehler, IP/DNS/Gateway/mDNS, neuer Hostname/Neustart, AP nach Erfolg schließen, DHCP-Wechsel | offen, S3 |
| M17 | F41 | Anmeldung aus/an, Defaults und vorhandener Änderungsmarker, falsches/korrektes Passwort, Zugriff auf Assets/API/Recovery, Passwort ändern und reboot; keine Secret-Rückgabe und keine WLAN-/Cloudsecrets im Log; lokale Inbetriebnahme-Ausnahme beachten | offen, S3 |
| M18 | F03/F15/F33/F42 | Zwei Browser und zweiter Tab, ausdrückliche Übernahme, 409-Sperre, kein Auto-Reclaim, 30-s-Abwesenheit, alte Player-/Download-/LED-Stopps; Onlinejob/WLAN-Abbruch unter aktiver Sitzung | offen, S3 |
| M19 | F34/F43/F44 | v1-Backup am C3 erzeugen, auf S3 prüfen/importieren; Pinübersetzung und jede Lektions-ID vergleichen; Auth/WLAN-Secrets wie vereinbart neu einrichten; Favoriten/Präferenzen am alten Origin vollständig exportieren und am neuen importieren | offen, beide Geräte/Browser |
| M20 | F45/F49 | Serielle t/T-/x/X-Befehle, S3-BOOT im Betrieb lang halten, absichtlicher Reset, Start-/WiFi-/Nextcloud-Diagnosen, Statuswerte ohne Datenlecks | offen, S3 |
| M21 | F46–F48/F50 | USB-Erstinstallation, gültige Firmware-/optionale FS-OTA, falsche Targets beidseitig, abgebrochener/kaputter Upload, Neustart/Bestandsdaten, kaputtes FS und Recovery, Bootfehler/ROM-Rettung, Prüfsummen/ZIP/Offsets | offen, getrennte Testhardware |
| M22 | F49–F51 | Fußzeile/AppVersion/Urheber/GitHub, Icons/Startsymbol, Vibe-Coding-/Quellenhinweise, API-Routen/Capabilities, Artefakte und Dokumentation auf realen Release-Stand prüfen | offen, S3 |

„Offen“ darf erst nach tatsächlicher Ausführung geändert werden. Gemeinsam mit U10 und dem vollständigen Routeninventar decken M01–M22 alle F01–F51 ab; neue N-Funktionen brauchen zusätzlich die folgenden Hardwaretests.

## 5. Neue S3-/MIDI-Hardwareprüfungen

| ID | Reproduzierbarer Aufbau / Schritte | Ziel / Beleg | Status |
|---|---|---|---|
| H01 Zielboard | konkretes DevC-Modell/Revision, WROOM-Aufdruck, Flash-ID/erkannte 16-MB-Kapazität und 8-MB-PSRAM, Speichertyp, Reset/Debug, WiFi, GPIO-Sperrliste; RAM-Test mit/ohne erkannte PSRAM | Startlog ohne Secrets; kein stilles N8-/No-PSRAM-Profil; sicheres Fehlverhalten bei falschem Speicherprofil | nicht ausgeführt |
| H02 DIN | dokumentierter Optokoppler/UART-Pin, 31.250/8N1; definierte Bytefolgen/Skalen/Akkorde vom Testsender, Oszilloskop-/Logikanalysatorbeleg soweit vorhanden | Note-/Channel-/Velocity-/Repeatvergleich, keine verlorenen Releases; elektrische und Softwareverzögerung getrennt | nicht ausgeführt |
| H03 USB | class-compliant Keyboard mit VID/PID/Deskriptoren; geprüfter Host-VBUS und separater Debugweg; 100 An-/Absteckzyklen inkl. gehaltenem Akkord, Unsupported-Gerät, Fehler während Transfer, WLAN parallel | keine hängenden Töne/Leaks, wiederholt erfolgreiche Enumeration; kompatible Modelle und Grenzen namentlich protokollieren | nicht ausgeführt |
| H04 Echtzeit/LED | unten definierte Lastprofile mit 60 und 300 LEDs, aktivem Browser/Netzwerk und Diagnosen an/aus | P95/P99/Max, Drop-/Fehler-/Queue-/Heapwerte und tatsächliche TX-/Latchzeiten; Ziele bewertet, nicht behauptet | nicht ausgeführt |
| H05 Transport/Hands/Audio | Score mit Tempo-Map, überlappenden langen Noten und getrennten Spuren; 0,5×/1×/1,5×-Testfaktoren, Pause/Seek/Wait/Ratewechsel, Paketjitter, Reconnect/Browservorgänge | dieselbe Position/Revision auf S3/LEDs/Audio/Canvas; Drift und Input-/Audio-Latenz separat; keine alte Revision nach Seek | nicht ausgeführt |
| H06 Dauer-/Fehlerlast | mindestens 60 min gemischtes MIDI+LED+HTTP, anschließend WLAN-/USB-Unterbrechung, NVS-Persistieren und Jobabbruch; 8-h-Soak vor RC | keine Abstürze/Deadlocks/unerklärten Drops, kein fortlaufender Heap-/Taskverlust; Tick-/Zeitüberlauf zusätzlich simulieren | nicht ausgeführt |
| H07 Update/Recovery/Daten | C3/S3-Kreuzpakete, anderes S3-Layout, falscher Hash, Abbruch vor/während Commit und Bootfehler; kontrollierter Stromausfall nur an Testdaten/-hardware | alter Slot/Daten bleiben wie spezifiziert oder belegter Recoverypfad; Profile/Browserfavoriten/Sprachen nach Umzug vollständig | nicht ausgeführt |

## 6. Belastungsprofile und Messdefinition

Die folgenden Werte sind **geplante Lastparameter**, keine gemessene Geräteleistung. Für UART beachten, dass 31.250 Baud mit 8N1 maximal 3.125 Bytes/s transportieren; überhöhte Raten gehören zum synthetischen Queue-/USB-Test, nicht als erfundene DIN-Last deklarieren.

| Profil | Last / Dauer | Begleitlast | Erwartung |
|---|---|---|---|
| B01 Normal | Skalen + Note-Offs mit 20/100/300 Events/s, je 60 s | 60 und 300 LEDs, eine aktive UI mit Statuspoll | Nullverluste, korrekte Reihenfolge/Noten |
| B02 Akkorde | zehn Note-On, zehn Note-Off pro Akkord, 5 Akkorde/s für 60 s; gleiche Töne auf mehreren Quellen separat | Training/frei, Kanalfilter, Shared-Mapping, gleichzeitige Animation/Testmoduswechsel | keine hängenden Töne; unzulässigen Moduswechsel kontrolliert behandeln; Lernlimit erst nach U07-Erweiterung ≥10 zusagen |
| B03 Stress | 1.000/2.000 Events/s synthetisch/USB für je 60 s, definierte Bursts, danach Drain/Release | zwei Browser (nur einer Owner), Dateiliste/Download/Upload auf vorhandenem Worker | Verlust-/Overflowzähler korrekt; kein Crash und definierte Recovery; nicht jede Überlast als Normalbetrieb ausgeben |
| B04 Parallelbetrieb | B01/B02 abwechselnd, 60 min; vor RC 8 h | WiFi gut/schwach, API-Last fest protokollieren, Diagnose aus/an, Lektionsspeichern | Heap-/Stack-/Queue-Watermarks stabil, keine Starvation; Samplezahlen/Fehler separat |
| B05 Fehler | gehaltene Akkorde, dann USB-Abziehen/Hostfehler, virtueller Heartbeatausfall, WLAN aus/an, HTTPjob-/OTA-Abbruch | einzeln und ausgewählte Kombinationen | quellenbezogenes Release, keine fremde Quelllöschung, gültiger Transport-/Konfigzustand |

Interne Zeitpunkte: `t_rx` bei vollständig intern verfügbarer MIDI-Nachricht, `t_queue`, `t_process`, `t_led_request`, optional `t_tx_done`. Hauptwert: `t_led_request - t_rx`; zusätzlich Queuewartezeit und TX-Dauer. Bei UART ist ein Blockcallback-Zeitstempel nicht automatisch der exakte Zeitpunkt jedes enthaltenen Events – diese Messunsicherheit angeben oder Treiber/ISR-Zeitstempel geeignet erfassen.

P95/P99 über dieselbe klar benannte Stichprobe mit Anzahl berechnen (oder Histogrammauflösung/Fehlergrenze nennen), Histogramm und Dropzähler nicht bei jeder UI-Abfrage zurücksetzen. Warm-up getrennt protokollieren. Für den Zielbericht mindestens 10.000 normale Events je relevanter Konfiguration erfassen; kurze Funktionsproben sind keine belastbaren P99-Werte. Durchschnitt, P95, P99, Maximum und längste Queuewartezeit, Quelle/Kanal, LED-Anzahl, Firmware, WLAN-/UI-Last, Heap und aktiven Treiber gemeinsam berichten.

Interne Entwicklungsziele aus dem Auftrag: **P95 <10 ms; Maximum möglichst <20 ms; keine Drops bei üblichen Akkorden/schnellen Folgen**. Softwareziele nicht mit vollständiger physischer Reaktionszeit gleichsetzen. Ein zusätzlicher Messkanal kann `t_rx`/`t_led_request` per GPIO markieren und LED-Daten/Latch erfassen; Optokoppler-/USB-Drahtzeit und Audio-/Displaylatenz erscheinen in eigenen Spalten.

### Noch nicht befülltes Messblatt

| Messgröße | C3 v1.15.1 / Phase 0 | S3 Normalbetrieb | S3 unter Last |
|---|---|---|---|
| Interne MIDI→LED-P95/P99/Max | nicht gemessen | nicht gemessen | nicht gemessen |
| Physische Reaktionszeit / TX-/Latchdauer | nicht gemessen; nur rechnerische Drahtzeiten in Architektur | nicht gemessen | nicht gemessen |
| MIDI-Events/s und verlorene Events | kein realer MIDI-Treiber | nicht gemessen | nicht gemessen |
| Queue-Auslastung / größter Heapblock / Taskanteile | keine entsprechende Instrumentierung | nicht gemessen | nicht gemessen |
| Statischer RAM / Linker-Flash | 51.324 B / 1.300.624 B, echter Build | S3-Build: 57.188 B / 1.275.573 B; Laufzeit offen | keine Laufzeitwerte aus Linkerzahlen ableiten |
| Audio-/Canvas-Drift und FPS | keine qualifizierte Messung | nicht gemessen | nicht gemessen |

## 7. Abschluss und Freigabe

P1-Parität braucht für jede F-ID einen nachvollziehbaren S3-Beleg, einschließlich Audio auf tatsächlichem iPhone/iPad und der Datenübernahme. „Build erfolgreich“ kann keinen offenen manuellen Fall schließen. Ein Fehler oder ungeklärter Ergebnisverlust in Restore, Hotplug oder Seek blockiert die betreffende Meilensteinabnahme.

Vor v2.0.0: alle vereinbarten U-/M-/H-Prüfungen ausgeführt, F-Matrix ohne offene Regression, RC mit unveränderlichem Hash, Risiken/Kompatibilitätsliste vollständig, Nutzerfreigabe für Release und eventuelle main-Integration. Phase 1 ist freigegeben und softwareseitig vorbereitet; ihr Hardwaremeilenstein bleibt bis zu tatsächlichen S3-Nachweisen offen.
