# Prüfprotokoll

Stand: 31. Oktober 2026. Ziel: ESP32-C3 SuperMini, 4 MB Flash, native USB-CDC, Arduino-Framework, C++17.

## Ausgeführt

| Prüfung | Ergebnis |
|---|---|
| `pio run -e c3_supermini` | Erfolgreich, Firmware und ESP32-C3-Bootloader erzeugt |
| `pio run -e c3_supermini -t buildfs` | Erfolgreich, LittleFS mit HTML, CSS und JavaScript erzeugt |
| `pio test -e native` | 16 von 16 Tests bestanden |
| `npm test` | 18 von 18 Browser-/MIDI-Tests bestanden |
| `node --check data/app.js` | JavaScript-Syntax gültig |
| `npm run format:check` | Bestanden |

Build: Espressif32 6.10.0, Arduino-ESP32 2.0.17 (`3.20017.241212+sha.dcc1105b`), RISC-V GCC 8.4.0, Adafruit NeoPixel 1.12.5, ArduinoJson 6.21.5. Der tatsächliche Build kompiliert die ESP32-RMT-Ausgabe der NeoPixel-Bibliothek für C3.

Speicherbelegung laut finalem Linkergebnis:

- Statischer RAM: **43.068 / 327.680 Bytes (13,1 %)**; dynamische Laufzeitallokationen sind darin nicht enthalten.
- Anwendung im Flash: **864.396 / 1.572.864 Bytes (55,0 %)**.
- LittleFS-Partition: **983.040 Bytes**; das Image enthält alle lokalen Webdateien.

Artefakte unter `.pio/build/c3_supermini/`: `firmware.bin`, `firmware.elf`, `bootloader.bin`, `partitions.bin`, `littlefs.bin`. Für das Flashen die PlatformIO-Uploadziele verwenden, damit Offsets und Bootloader korrekt gesetzt werden.

Die Prüfungen wurden mit einer temporären PlatformIO-Installation durchgeführt (`/private/tmp/piano-pio-venv`, Core-Verzeichnis `/private/tmp/piano-pio-core`). Das Projekt benötigt diese Pfade nicht und lässt sich regulär mit PlatformIO IDE öffnen.

## Testumfang

C++: Standardkonfiguration, erlaubte/gesperrte GPIOs, Bereichsgrenzen, unzulässige Notenzuordnungen, deaktivierte und gemeinsam genutzte LEDs, Kanalfilter. Der Umkehrungstest prüft viele Kombinationen von Streifenlänge, Startoffset und Noten: Normalindex und umgekehrter Index müssen stets zusammen `count - 1` ergeben und innerhalb des Streifens liegen.

DOM: 49 virtuelle Tasten, 128 Zuordnungen, GPIO-Auswahl, geordnete mehrstimmige Note-On/Off-Ereignisse, Freigabe bei Fokusverlust und Seitenwechsel, typisierte Konfigurationsdaten samt Schreibzugriffsheader, WLAN-Auswahl und Passwortlöschung im Formular. Ein SSID-Name mit HTML-Zeichen wird als Text dargestellt.

Die DOM-Tests verwenden jsdom und simulierte API-Antworten. Sie bestätigen weder die reale Firmware-HTTP-Authentifizierung noch die visuelle Darstellung auf iPad/Safari. Ein sichtbarer Browserlauf war hier mangels Browser-Ausführungswerkzeug nicht möglich.

## Upload und Starttest am echten Gerät

Am 31. Oktober 2026 wurde ein ESP32-C3 Revision v0.4 über `/dev/cu.usbmodem101` erkannt. Firmware einschließlich Bootloader/Partitionstabelle sowie LittleFS-Image wurden erfolgreich übertragen und jeweils per Flash-Hash verifiziert. Der anschließende Neustart über USB wurde seriell geprüft.

Dabei wurde eine Abweichung zwischen dem LittleFS-Standardlabel des Arduino-Cores (`spiffs`) und dem eigenen Partitionslabel (`littlefs`) gefunden und in `src/main.cpp` durch die explizite Labelangabe korrigiert. Die korrigierte Firmware wurde neu gebaut, hochgeladen und erneut gestartet. Bestätigte Startmeldungen: `LittleFS bereit.` sowie `Setup-AP: MIDI-Trainer-Setup / http://192.168.4.1`. Das Gerätepasswort blieb über die Neustarts erhalten und wird nicht in diesem Protokoll gespeichert.

Die Core-Meldung zur fehlenden Core-Dump-Partition betrifft die nicht eingerichtete Absturzspeicherung. Die Meldungen `network NOT_FOUND` und `led NOT_FOUND` entsprechen den noch nicht gespeicherten WLAN-/LED-Einstellungen; die Firmware verwendet dann ihre Standardwerte.

## Festes Setup-WLAN-Passwort

Auf Benutzerwunsch verwendet der Setup-AP dauerhaft `piano123`, unabhängig vom Web-Gerätepasswort und vom NVS-Zustand. Firmware und Webtexte wurden angepasst. Der erneute C3-Build sowie alle 7 nativen und 5 DOM-Tests sind erfolgreich; die Firmware wurde per USB erneut hochgeladen und per Hash verifiziert. Die erfolgreiche WLAN-Anmeldung wurde später im Diagnoseversuch bestätigt (siehe unten).

## Diagnose der iPhone/iPad-WLAN-Verbindung

Nach gemeldeten Verbindungsfehlern wurden WLAN-Ereignislogs ergänzt, Modem-Sleep deaktiviert und die Sendeleistung versuchsweise auf 8,5 dBm begrenzt. Der ESP32-C3-Build und alle 7 nativen Tests waren erfolgreich. Nach einem unterbrochenen Upload wurde der belegte USB-Port erneut geprüft; der anschließende Firmware-Upload war erfolgreich und wurde per Flash-Hash verifiziert.

Das serielle Log bestätigte Kanal 1, WPA2 (Authmodus 3), die Übereinstimmung des gesetzten Setup-Passworts und 8,50 dBm Sendeleistung. Beim erneuten Versuch wurden `Gerät am Setup-AP angemeldet` und `DHCP-Adresse vergeben: 192.168.4.2` erfasst. Der Benutzer bestätigte die erfolgreiche Verbindung auf iPhone/iPad. Damit ist die WLAN-Anmeldung mit `piano123` tatsächlich geprüft. Die genaue Ursache des vorherigen Fehlschlags ist nicht isoliert; aus dem erfolgreichen Versuch lässt sich keine einzelne Funkänderung als Ursache ableiten.

Eine anfängliche Warnung zum Energiesparen war irreführend: Arduino-ESP32 `setSleep(false)` gibt auch bei bereits deaktiviertem Energiesparen `false` zurück. Die Abfrage prüft nun vor dem Aufruf, ob eine Änderung nötig ist.

## HTTP-Diagnose

Nach dem gemeldeten Problem beim Öffnen der Webseite wurden Startprüfungen für alle drei Webdateien und HTTP-Logs für Authentifizierung, Dateiauslieferung und Weiterleitung ergänzt. Der Build und die 7 nativen Tests sind erfolgreich; die Diagnosefirmware wurde hochgeladen und per Flash-Hash verifiziert.

Der serielle Starttest bestätigt `/index.html` mit 13.162 Bytes, `/style.css` mit 7.550 Bytes und `/app.js` mit 11.390 Bytes sowie den Start des Webservers auf Port 80. Dies prüft das Dateisystem und die Initialisierung, noch nicht die erfolgreiche Darstellung in Safari. Die zuvor sichtbare Core-Meldung `request handler not found` allein beweist keinen Serverausfall, da danach der eigene `onNotFound`-Handler antwortet.

Im anschließenden 75-Sekunden-Mitschnitt meldete sich ein WLAN-Client an und trennte sich nach rund 55 Sekunden wieder. Keine HTTP-Anfrage an die Startseite oder Webdateien wurde dabei erfasst. Der Benutzer meldete „Safari kann die Seite nicht öffnen“. Damit ist die Ursache noch offen; IPv4-Adresse und Routeradresse am iPhone/iPad sind als nächster Diagnoseschritt angefragt. Ein erfolgreicher Seitenaufruf ist weiterhin nicht bestätigt.

## Webanmeldung admin/admin

Der Benutzer bestätigte inzwischen, dass die Webseite erreichbar ist und die Anmeldeabfrage erscheint. Anschließend wurde auf ausdrücklichen Wunsch die Webanmeldung auf `admin` / `admin` umgestellt. Eine einmalige NVS-Migration setzt auch auf bereits eingerichteten Geräten das neue Standardpasswort. Spätere eigene Passwortänderungen bleiben bei Neustarts erhalten; ein Werksreset stellt `admin` / `admin` wieder her. Das Setup-WLAN-Passwort bleibt unabhängig davon `piano123`.

Firmware und LittleFS wurden erfolgreich neu gebaut, hochgeladen und per Flash-Hash verifiziert. Alle 7 nativen und 5 DOM-Tests sowie die Formatprüfung sind erfolgreich. Der anschließende serielle Neustart bestätigte Benutzer `admin`, das aktive Webpasswort `admin` und den Webserverstart. Die aktuellen Webdateien umfassen 13.191 Bytes HTML, 7.550 Bytes CSS und 11.365 Bytes JavaScript. Der eigentliche Anmeldevorgang mit Safari wurde durch diesen seriellen Test nicht ausgeführt.

## LED-Diagnose und WLAN-IP-Anzeige

Nach der Meldung, dass keine LED-Funktion sichtbar reagiert, wurden LED-Konfiguration und angenommene Webbefehle im seriellen Log sichtbar gemacht. Ein nichtblockierender RGB-Test der ersten physischen LED mit maximal 10 % Helligkeit lässt sich über die Weboberfläche oder mit `t` im seriellen Monitor starten. `x` schaltet aus. Die ursprüngliche Helligkeit wird nach dem Test wiederhergestellt. Die Oberfläche zeigt API-Erfolg beziehungsweise Fehler bei LED-Befehlen und die neue WLAN-IP als Link an.

Build, Firmware-Upload und LittleFS-Upload sind erfolgreich und die übertragenen Images per Hash verifiziert. Es bestehen 7 native und jetzt 7 DOM-Tests. Die zwei zusätzlichen DOM-Tests prüfen den Adresslink, Diagnosebefehl und sichtbare API-Fehler. Formatprüfung erfolgreich.

Das Hardware-Startlog zeigt GPIO 4, 60 LEDs, GRB und 25 % konfigurierte Helligkeit. Der erste LED-Test wurde zweimal direkt über USB ausgelöst und erreichte jeweils Rot, Grün, Blau und automatisches Ausschalten. Der Benutzer meldete weiterhin einen dunklen Streifen. Im Mitschnitt erschienen keine RMT-Fehlermeldungen; die verwendete Bibliothek prüft im Legacy-Pfad nicht alle RMT-Rückgabewerte. Damit ist keine elektrisch korrekte Datenausgabe oder defekte Hardware bewiesen. Sichtbares Leuchten ist weiterhin nicht bestätigt.

Der Benutzer bestätigte eine direkte GPIO-4/DIN-Verbindung ohne Pegelwandler. Ein nicht ausreichender 3,3-V-Datenpegel bei 5-V-Streifenversorgung ist deshalb eine mögliche Ursache. Spannungen am Streifen, gemeinsame Masse und Signalpegel müssen elektrisch geprüft werden. Der Test umgeht HTTP und MIDI-Mapping und grenzt einen ausschließlich im Browser liegenden Fehler ein.

Die Station war beim Test verbunden; die aktuell seriell gemeldete Adresse lautet `192.168.100.127`. Sie ist eine DHCP-Adresse und kann sich ändern.

## Trainingsmodi mit simuliertem MIDI · Firmware 1.1.0

Implementiert sind Free Play, geführte Noten-/Akkordfolgen, zeitgesteuertes Rhythmustraining und Song-Übungen wahlweise schrittweise oder im Tempo. Eingaben laufen über `MidiEvent` und `TrainingController` in eine portable, zeitgesteuerte Zustandsmaschine. Sie verarbeitet wiederholte Anschläge, vollständige Akkorde, Fehler, verpasste Einsätze, Pause/Fortsetzen und Ergebniszahlen. Das Browser-Keyboard und die LED-Zielanzeige verwenden denselben Zustand. Ohne Client-Heartbeat pausiert der Trainer nach etwa drei Sekunden.

Der lokale Browser-Importer verarbeitet Standard-MIDI-Dateien 0/1 mit PPQN, Running Status, Kanalwahl, Transposition und bis zu acht gleichzeitigen Note-On-Einsätzen. Begrenzung: 256 KiB, 64 Spuren, 20.000 Ereignisse und 128 Übungsschritte. Es wird bewusst bei festem Übungstempo trainiert; Tempoänderungen werden als Hinweis gemeldet, Notenlängen und Pedal nicht bewertet. Die Rohdatei bleibt im Browser.

Bestanden: **16 native Tests** (7 Mapping/GPIO, 9 Training) sowie **15 Node-Tests** (9 DOM, 6 MIDI-Dateien). Die Trainingstests decken Fehlversuche, wiederholte Noten, frische Akkordanschläge, Einzähler und Timing-Grenzen, verpasste Noten, Pausenzeit, millis-Überlauf, ungültige Sequenzen und alle eingebauten Übungen ab. Die DOM-Tests prüfen Start, Pause, Fortsetzen, freies Spiel und Pausieren beim Seitenwechsel. Importtests prüfen mehrspurige Akkorde, Running Status, Tempo-Metadaten, Kanalfilter, Transposition und beschädigte/überlange Dateien. Format- und JavaScript-Syntaxprüfungen sind erfolgreich.

Firmware und LittleFS-Image wurden gebaut, auf den angeschlossenen C3 hochgeladen und jeweils per Flash-Hash verifiziert. Das Startlog bestätigt GPIO 4 / 60 LEDs / GRB / 25 %, LittleFS sowie alle vier Assets: HTML 20.528 Bytes, CSS 8.658 Bytes, MIDI-Importer 6.002 Bytes und App-JavaScript 18.175 Bytes.

Ein direkter LAN-API-Test an der zuletzt bekannten Adresse `192.168.100.127` scheiterte durch Timeout. Der vollständige serielle WLAN-Start zeigte Router-Anmeldefehler (Grundcodes 2/15/39) und nach rund 15 Sekunden den korrekt gestarteten Setup-AP `MIDI-Trainer-Setup`, WPA2, Kanal 1, IP `192.168.4.1`. Die WLAN-Zugangsdaten wurden während dieser Änderung nicht verändert. Damit sind vollständige Trainings-HTTP-Durchläufe auf dem Gerät, Safari-Darstellung und Timing/LED-Hinweise beim tatsächlichen Spielen noch manuell zu prüfen. Die Hosttests sind keine Bestätigung dieser Hardware-/Browserabläufe.

Der Benutzer hat vor dieser Erweiterung bestätigt, dass der LED-Streifen nach Korrektur der Anschlussrichtung funktioniert. Die ursprüngliche Dunkelheit lag am Anschluss an der falschen Streifenseite; daraus wurde kein Treiberfehler abgeleitet. Die LED-Ausgabe der neuen Trainingsmodi ist separat noch visuell zu prüfen.

## Virtuelle LED-Leiste · Firmware 1.1.1

Über der virtuellen Tastatur befindet sich nun im Dashboard und im Training eine gemeinsame, nummerierte LED-Leiste. Die JSON-Antworten von Status-, MIDI-, Trainings-, LED- und Konfigurationsbefehlen enthalten den aktuellen Ausgabezustand. Der ESP32 kodiert den echten, bereits helligkeitsskalierten NeoPixel-Puffer als sechs RGB-Hexzeichen je physischer LED; GRB/RGB wird dabei normalisiert. Das ist keine Rückmeldung vom Streifen und kein Nachweis der elektrischen Ausgabe. Die Bildschirmfarben werden zur Sichtbarkeit aufgehellt.

Die Browseranzeige berücksichtigt Startoffset, umgekehrte Reihenfolge und mehrere Noten pro LED in den LED-Beschreibungen. Es wird keine zweite Trainings-Farblogik im Browser unterhalten. MIDI-/Trainingsantworten aktualisieren die Vorschau unmittelbar; Statusabfragen gleichen weitere Änderungen ab. Sehr kurze Rhythmusimpulse können zwischen zwei Abfragen liegen.

Bestanden: **16 native Tests und 18 Node-Tests** (12 DOM, 6 MIDI-Dateien), JavaScript-Syntax und Formatprüfung. Die drei zusätzlichen DOM-Tests prüfen konkrete RGB-Farben aus Antwort-Snapshots, Rückkehr auf Aus nach Note Off, die gemeinsame Anzeige beim Seitenwechsel, Offset/Umkehrung/Mehrfachzuordnung sowie 300 LEDs und fehlerhafte Snapshots. Der C3-Build ist erfolgreich. Firmware und LittleFS-Image wurden hochgeladen und per Flash-Hash verifiziert. Ein visueller Vergleich mit Safari und dem physischen Streifen steht noch aus.

## Noch am echten Gerät prüfen

Upload und serieller Starttest sind durchgeführt. Der Benutzer bestätigte die LED-Funktion nach Korrektur der Anschlussrichtung. Die LED-Hinweise der neuen Trainingsmodi und das Yamaha-Keyboard wurden noch nicht funktional geprüft. Folgende Prüfungen sind noch offen:

1. Wiederholung des Uploads über andere Betriebssysteme/USB-Kabel und manuelles BOOT-/RESET-Verhalten.
2. Gerätepasswort im seriellen Monitor, passwortgeschützter Setup-AP, Captive-Portal-Erkennung auf iOS/Android/Windows.
3. WLAN-Scan, erfolgreicher und fehlgeschlagener Verbindungstest, AP-Abschaltung nach Erfolg, Fallback nach WLAN-Ausfall; Router- und Funkverhalten.
4. HTTP-Anmeldung, Ablehnung unautorisierter Schreibzugriffe, tatsächlicher NVS-Erhalt nach Stromausfall sowie Passwortwechsel und Werksreset einschließlich BOOT-Langdruck.
5. LED-Datenpegel, GRB/RGB, Helligkeit, Reihenfolge, individuelle Zuordnung, alle Animationen und Stabilität unter Last.
6. Mehrfingereingabe und Layout auf Smartphone/iPad; Timeout beim Verbindungsabbruch des Browsers.
7. Tatsächlicher MIDI-Notenbereich des Yamaha für die spätere Hardwareanbindung. Die aktuelle Startnote 48 ist konfigurierbar.

8. Trainingsmodi auf iPhone/iPad einschließlich MIDI-Dateiimport, zeitlicher Auswertung, Verbindungsabbruch und passender LED-Zielanzeige.

Echtes USB-MIDI und allgemeine Akkordnamenerkennung gehören weiterhin zu späteren Phasen. Die Trainingsmodi sind mit simuliertem MIDI implementiert und durch Hosttests geprüft; der vollständige Geräte-/Safari-Durchlauf bleibt offen.
