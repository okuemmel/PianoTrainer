# MIDI LED Piano Trainer · ESP32-C3 SuperMini

Phase 1 plus Trainingsmodi mit simuliertem MIDI für ein **ESP32-C3 SuperMini mit 4 MB Flash** und einen WS2812B-Streifen. Die Firmware bietet WLAN-Einrichtung, lokale deutsche Weboberfläche, persistente LED-Konfiguration, Animationen und eine virtuelle, mehrstimmige MIDI-Tastatur. Für Phase 1 wird kein MIDI-Kabel benötigt.

## Hardware anschließen

| Verbindung | Anschluss |
|---|---|
| LED DIN (Eingangsseite / Pfeilrichtung beachten) | GPIO **4**, vorzugsweise über 74AHCT125-Pegelwandler und 330–470 Ω Serienwiderstand |
| LED +5 V | Externes geregeltes 5-V-Netzteil |
| LED GND, Netzteil GND, ESP GND | Gemeinsame Masse |
| ESP USB-C | PC zum Programmieren und zur Versorgung des ESP |

60 klassische WS2812B können bei voller weißer Helligkeit bis ca. 3,6 A benötigen; Netzteil und Leitungen passend dimensionieren (z. B. 5 V / 4 A oder größer). Standardhelligkeit ist 25 %, die Software ist jedoch kein Überstromschutz. 500–1000 µF zwischen 5 V und GND nahe am Streifen sind sinnvoll. LED-Streifen nicht über den 3,3-V-Ausgang versorgen. Externe 5 V nicht gleichzeitig unkontrolliert auf den USB-5-V-Pfad des Boards einspeisen. Boardvarianten unterscheiden sich beim Rückspeiseschutz. 3,3-V-Daten direkt an einem 5-V-Streifen sind nicht für alle WS2812B zuverlässig; der Pegelwandler sorgt für einen passenden Logikpegel.

Die konservative GPIO-Freigabe lautet **0, 1, 3, 4, 5, 6, 7, 10, 20, 21**. GPIO 2/8/9 sind Boot-Strapping-Pins, GPIO 8 ist auf üblichen SuperMinis mit der Board-LED verbunden, GPIO 9 mit BOOT. GPIO 18/19 gehören zu USB Serial/JTAG. Flash-Pins sind ebenfalls ausgeschlossen. GPIO 4 wird ausschließlich als LED-Ausgang verwendet; externes JTAG auf diesem Pin darf nicht parallel angeschlossen sein.

Das generische PlatformIO-Profil `esp32-c3-devkitm-1` bildet CPU und 4-MB-Flash ab. Die Umgebung `c3_supermini` ergänzt **native USB-CDC**, DIO-Flash-Modus und ein eigenes LittleFS-Partitionslayout. Es wird keine externe UART-USB-Brücke vorausgesetzt. Vor dem Upload überprüfen, ob dein konkreter SuperMini tatsächlich 4 MB Flash besitzt.

## Installation und Kompilierung

1. [Visual Studio Code](https://code.visualstudio.com/) installieren.
2. In VS Code die Erweiterung **PlatformIO IDE** von PlatformIO installieren. Die C/C++-Erweiterung von Microsoft ist für Navigation hilfreich; Compiler und Python-Umgebung verwaltet PlatformIO.
3. Diesen Projektordner in VS Code öffnen. PlatformIO lädt beim ersten Build Plattform, Compiler und Bibliotheken herunter.
4. Über die PlatformIO-Seitenleiste → Project Tasks → **c3_supermini → General → Build** kompilieren.

Alternativ im **PlatformIO-Terminal**:

```sh
pio run -e c3_supermini
```

Es sind ESP32-Plattform `6.10.0` (Arduino-ESP32 2.0.17), Adafruit NeoPixel `1.12.5` und ArduinoJson `6.21.5` festgelegt. WLAN, synchroner WebServer, DNS, Preferences und LittleFS stammen aus dem Arduino-Core. Die NeoPixel-Bibliothek unterstützt ESP32 einschließlich der C3-RMT-Ausgabe; der vollständige C3-Build überprüft die konkrete Kombination.

## Firmware und Webdateien hochladen

1. Board mit einem **USB-Datenkabel** anschließen.
2. PlatformIO → c3_supermini → General → **Upload**.
3. PlatformIO → c3_supermini → Platform → **Upload Filesystem Image**. Dies ist zwingend erforderlich: HTML, CSS und JavaScript liegen in LittleFS.
4. PlatformIO → General → **Monitor** bei 115200 Baud öffnen. Nach dem Upload ggf. RESET drücken.

```sh
pio run -e c3_supermini -t upload
pio run -e c3_supermini -t uploadfs
pio device monitor -b 115200
```

Falls mehrere Geräte angeschlossen sind, `--upload-port /dev/cu.usbmodem…` ergänzen beziehungsweise `upload_port` und `monitor_port` in `platformio.ini` setzen. Unter Windows heißt der Anschluss z. B. `COM5`.

Wenn kein Port erscheint: BOOT gedrückt halten, RESET kurz drücken, BOOT loslassen und erneut hochladen. Nach dem ersten Flash ggf. RESET drücken und den USB-Port neu auswählen. BOOT beim Einschalten versetzt den Chip in den Bootloader; der unten beschriebene Werksreset erfolgt dagegen im laufenden Betrieb.

LittleFS wird bei Mountfehlern **nicht automatisch formatiert**. Die HTTP-Antwort weist dann auf `uploadfs` hin. Der Upload des Dateisystems ersetzt die Webdateien; NVS bleibt im normalen Uploadablauf erhalten. Ein vollständiges Flash-Erase löscht auch Einstellungen und Passwort.

## Erstes WLAN einrichten

1. Die Webanmeldung lautet standardmäßig **Benutzer `admin`, Passwort `admin`**. Diese Vorgabe wird beim ersten Start dieser Firmware auch auf dem bereits eingerichteten Gerät gesetzt. Spätere eigene Passwortänderungen bleiben über Neustarts erhalten.
2. Auf Smartphone/iPad/PC mit **MIDI-Trainer-Setup** verbinden. Das Setup-WLAN-Passwort lautet dauerhaft **`piano123`**, auch nach einem Werksreset.
3. Ein Captive Portal kann automatisch erscheinen. Andernfalls **http://192.168.4.1/** im Browser öffnen. Die Systemmeldung „kein Internet“ ist bei diesem lokalen AP normal.
4. Mit Benutzer `admin` und Passwort `admin` anmelden (sofern nicht selbst geändert). Unter WLAN-Einstellungen Netzwerke suchen oder SSID manuell eingeben. Nur 2,4 GHz; unterstützt werden offene Netzwerke und persönliche WPA/WPA2-Netze, kein Enterprise-Login.
5. WLAN-Passwort eingeben und Verbindung testen. Der Test blockiert den Hauptloop nicht und endet spätestens nach 15 Sekunden. Zugangsdaten werden erst nach erfolgreicher Verbindung als gemeinsamer NVS-Datensatz gespeichert.
6. Die neue IP-Adresse erscheint auf dem Dashboard/Systemseite und im seriellen Monitor. Der Setup-AP bleibt nach erfolgreicher Verbindung noch 30 Sekunden aktiv. Danach zum Heim-WLAN wechseln und **http://GERÄTE-IP/** öffnen. Bei einem Wechsel des AP-Kanals während Scan/Verbindungsaufbau kann eine erneute Verbindung zum Setup-AP nötig sein.

Ist das gespeicherte WLAN beim Start nicht erreichbar oder geht eine bestehende Verbindung länger verloren, öffnet sich nach dem begrenzten Verbindungsversuch wieder der Setup-AP. Die Weboberfläche bietet außerdem „Setup-AP einschalten“. Bei fehlgeschlagenem Wechsel bleiben die vorherigen gespeicherten Zugangsdaten erhalten; sie werden nach einem Neustart erneut versucht. Eine Verbindung ohne Internet ist ausreichend.

## WLAN-Diagnose am C3 SuperMini

Der serielle Monitor läuft mit 115200 Baud. Nach RESET zeigt er AP-Start, den tatsächlich gesetzten Authentifizierungsmodus, eine Passwortprüfung ohne Passwortausgabe und die Sendeleistung. Beim Verbinden eines Telefons werden Anmeldung (`Gerät am Setup-AP angemeldet`), DHCP-Adressvergabe und Trennung protokolliert. Router-Verbindungsabbrüche enthalten zusätzlich den numerischen Grundcode. Der verwendete IDF-4.4-Core liefert für AP-Client-Trennungen keinen solchen Grundcode.

Zur Eingrenzung der gemeldeten iPhone/iPad-Verbindungsprobleme ist die Sendeleistung versuchsweise auf **8,5 dBm** begrenzt und WLAN-Modem-Sleep deaktiviert (`configureRadio()` in `src/WiFiManager.cpp`). Das ist ein Diagnoseversuch, keine bestätigte Fehlerursache. Bei größerer Entfernung kann die reduzierte Leistung die Reichweite verringern. Die WLAN-Ereignisse und Energieeinstellungen sind in der [Espressif-C3-Dokumentation](https://docs.espressif.com/projects/esp-idf/en/v4.4.5/esp32c3/api-guides/wifi.html) beschrieben.

## Webserver-Log lesen

Beim Start prüft die Firmware die drei Webdateien mit Dateigröße und meldet den HTTP-Start auf Port 80. Beim Öffnen der Oberfläche erscheinen `[HTTP]`-Zeilen:

- `200`: HTML, CSS oder JavaScript wurden gesendet; die Bytezahlen zeigen den übertragenen Umfang.
- `401, Webanmeldung erforderlich`: Der Browser muss sich mit `admin` und dem seriell ausgegebenen Gerätepasswort anmelden.
- `401, Webanmeldung fehlgeschlagen`: Anmeldedaten fehlen oder stimmen nicht. Das Setup-WLAN-Passwort `piano123` ist von der Webanmeldung unabhängig.
- `302`: Ein unbekannter Pfad (z. B. die automatische iOS-Captive-Portal-Prüfung) wird zur Startseite umgeleitet.
- `503`: Eine benötigte Webdatei fehlt oder lässt sich nicht öffnen; LittleFS-Upload beziehungsweise Dateisystem prüfen.

Die Arduino-Core-Meldung `request handler not found` erscheint vor dem eigenen `onNotFound`-Handler auch bei einer anschließend regulär beantworteten Weiterleitung. Die folgende `[HTTP]`-Zeile zeigt den tatsächlich gewählten Antwortcode. Passwörter und Authorization-Header werden nicht geloggt.

## LEDs testen und zuordnen

1. Mit Standardwerten beginnen: 60 LEDs, GPIO 4, GRB, 25 % Helligkeit, erste LED 0, 49 Tasten.
2. Unter LED-Steuerung LED-Index **0** wählen und mit niedriger Helligkeit testen. Danach Rot, Grün und Blau einzeln prüfen; bei vertauschten Farben die Farbreihenfolge ändern.
3. „LEDs nacheinander“ durchläuft den Streifen einmal und schaltet ihn anschließend aus. „Lauflicht“, „Rot/Grün/Blau/Weiß“ und „Helligkeitsrampe“ laufen bis zum Stoppen. Die Rampe überschreitet die konfigurierte Helligkeit nicht.
4. Auf dem Dashboard virtuelle Tasten halten. Mehrere Finger erzeugen gleichzeitige Noten; Loslassen sendet Note Off. Die Velocity wird unter MIDI-Konfiguration eingestellt. „Alle Noten loslassen“ oder „Alles ausschalten“ beendet die Ausgabe.
5. Unter LED-Konfiguration die mechanische Zuordnung anpassen und speichern. Indizes beginnen bei **0**. Die Tabelle enthält alle 128 MIDI-Noten. `-1` deaktiviert eine Note. Sonst gilt `logischer Index = erste LED + Tabellenwert`; Umkehrung ergibt `LED-Anzahl − 1 − logischer Index`. Bei gemeinsam genutzten LEDs gewinnt die höchste aktive Velocity.
6. „Fortlaufend zuordnen“ erzeugt die Zuordnung neu anhand von erster MIDI-Note, Tastenanzahl und Platz auf dem Streifen; anschließend speichern. Die Startnote ist zunächst **48 (C3, MIDI-Namenskonvention C4=60)** und bis 96 reichen die 49 virtuellen Tasten. Den tatsächlichen Bereich des Yamaha vor späterer Hardware-MIDI-Nutzung prüfen und bei Bedarf anpassen.

Der MIDI-Kanalfilter ist persistent (0 = alle, 1–16 = ausgewählter Kanal). Der Sendekanal und die virtuelle Anschlagstärke sind browserlokale Bedienwerte. Die Tastatur nutzt geordnete HTTP-Befehle und einen Heartbeat; nach 3 Sekunden ohne Heartbeat/Notenereignis werden virtuelle Noten freigegeben. Statusdaten werden alle 2 Sekunden abgefragt, ohne Seitenreload. Mehrere Browser steuern denselben gemeinsamen Gerätezustand; getrennte Spielsessions sind nicht vorgesehen.

## Wenn keine LED leuchtet

Ein WS2812B-Streifen schaltet seine LEDs durch Versorgung allein nicht zuverlässig ein. Er benötigt gültige Farbdaten; die Firmware sendet beim Start bewusst „Aus“. Bei 5-V-Versorgung kann ein direktes 3,3-V-Datensignal je nach LED-Variante nicht ausreichen. Den Signalpegel mit einem für 3,3-V-Eingänge geeigneten 5-V-Puffer wie 74AHCT125 anpassen; gemeinsame Masse und Anschluss an **DIN** der ersten LED sind nötig. Siehe [Adafruit: Basic Connections](https://learn.adafruit.com/adafruit-neopixel-uberguide/basic-connections).

Unter LED-Steuerung gibt es „Erste LED: kurzer RGB-Test“. Dieser Test nutzt den physischen Index 0, unabhängig vom MIDI-Mapping, zeigt nacheinander Rot/Grün/Blau bei höchstens 10 % Helligkeit und schaltet nach etwa 3 Sekunden aus. Die konfigurierte Helligkeit wird danach wiederhergestellt.

Um die Weboberfläche als Fehlerquelle auszuschließen, kann derselbe Test im seriellen Monitor durch Senden von **`t`** gestartet werden; **`x`** schaltet aus. Der Hauptloop läuft währenddessen weiter. Das Startlog nennt GPIO, LED-Anzahl, Farbfolge und Helligkeit. Angenommene Webbefehle und API-Fehler werden ebenfalls protokolliert; die Oberfläche zeigt die Annahme oder Ablehnung eines LED-Befehls direkt an. Ein Logeintrag bestätigt den ausgeführten Softwarepfad, nicht den elektrischen Signalpegel oder sichtbares Leuchten.

Nach erfolgreichem WLAN-Wechsel zeigt das WLAN-Formular die neue Geräteadresse als anklickbaren Link, sobald die nächste Statusabfrage erfolgreich ist. Die Adresse bleibt im geöffneten Dokument sichtbar, wenn danach die Verbindung zum Setup-AP abbricht.

## Zugriff und Reset

Alle Webdateien und regulären API-Endpunkte erfordern HTTP-Basic-Authentifizierung. Schreibzugriffe verlangen zusätzlich einen eigenen Request-Header; CORS wird nicht aktiviert. Das Gerätepasswort lässt sich in Systeminformationen ändern (12–63 druckbare ASCII-Zeichen ohne Leerzeichen). Danach startet das Gerät neu. Das Setup-WLAN-Passwort bleibt unabhängig davon immer `piano123`.

WLAN-Passwort und Gerätepasswort werden nie über eine API zurückgegeben. WLAN-Passwörter werden nicht protokolliert. Das Gerätepasswort wird bewusst seriell ausgegeben, damit die lokale Ersteinrichtung möglich ist. NVS und HTTP sind in diesem lokalen Prototyp unverschlüsselt: ausschließlich in einem vertrauenswürdigen lokalen Netz nutzen und keine Portweiterleitung ins Internet einrichten.

Werkseinstellungen sind über Systeminformationen mit der Bestätigung **WERKSRESET** möglich. Alternativ **BOOT im laufenden Betrieb mindestens 8 Sekunden halten**. Anschließend werden alle Einstellungen gelöscht und die Webanmeldung auf `admin` / `admin` zurückgesetzt.

## Aufbau und spätere Erweiterung

```text
include/BoardProfile.h      Boardname und geeignete GPIO-Pins
include/TrainerLogic.h      Portable Konfiguration, Validierung, Notenmapping, Lernmodi
src/ConfigManager.cpp      NVS, strikte JSON-Validierung, sichere API-Repräsentation
src/WiFiManager.cpp        AP, Captive-DNS, asynchroner Verbindungszustand
src/LedController.cpp      WS2812B, millis-Animationen, mehrstimmige Noten
include/MidiInput.h        Eingangsschnittstelle und Simulation
src/TrainerWebServer.cpp   Authentifizierung, REST-API, LittleFS-Dateien
src/main.cpp               Initialisierung, Hauptloop, BOOT-Werksreset
data/                      Lokale deutsche Weboberfläche ohne CDN
test/test_logic/           Native C++-Tests
test/web.test.cjs          DOM-Integrationstests der Browserlogik
test/test_training/       Portable Trainings- und Timing-Tests
test/midi-file.test.cjs    Tests des lokalen MIDI-Importers
```

Der synchrone Arduino-Webserver verarbeitet kurze HTTP-Befehle; Animationen, DNS und WLAN-Zustände werden kooperativ im Hauptloop bedient. Ein einzelnes NeoPixel-`show()` benötigt physikalisch etwa 30 µs pro LED (bei maximal 300 LEDs ca. 9 ms), ohne lange Animationsschleifen. Langsame/gestörte HTTP-Clients können den synchronen Server dennoch zeitweise aufhalten.

Für den ESP32-S3 später ein eigenes Boardprofil und PlatformIO-Environment anlegen, Pins und Partitionierung anpassen und einen USB-Host-Eingang als `MidiInput` ergänzen. `MidiEvent` läuft über `TrainingController` in dieselbe Auswertung und LED-Darstellung. C3 hat keinen entsprechenden USB-Host-OTG. Echtes USB-MIDI und allgemeine Akkordnamenerkennung sind weiterhin nicht implementiert.

## Training mit simuliertem MIDI (Firmware 1.1)

1. Nach Firmware- und LittleFS-Upload die Browserseite neu laden und **Training** öffnen. Es wird dieselbe 49-Tasten-Tastatur wie auf dem Dashboard verwendet.
2. Modus und Übung wählen. Die Grundnote ist standardmäßig C4 / MIDI 60 bei der 49-Tasten-Konfiguration; sie lässt sich passend zum eigenen Tastenbereich ändern. Alle Zielnoten müssen innerhalb des konfigurierten Bereichs liegen und einer LED zugeordnet sein.
3. **Geführtes Lernen** wartet auf die richtige Note beziehungsweise den vollständigen Akkord. Blau zeigt das nächste Ziel, Grün gespielte Tasten und Rot eine falsche Taste. Wiederholte Noten müssen neu angeschlagen werden; gehaltene Tasten zählen nicht mehrfach. Für Akkorde alle Zielnoten gleichzeitig halten und beim nächsten Einsatz erneut anschlagen.
4. **Rhythmustraining** zählt vier Viertelschläge ein und bewertet die Anschläge bei 40–200 BPM im einstellbaren Fenster von ±80 bis ±400 ms. Zu frühe/falsche Tasten und verpasste Einsätze werden gezählt. Die Anzeige und die Ziel-LEDs geben einen optischen Takt vor. Es werden keine Klaviertöne oder Klickgeräusche abgespielt.
5. **Song-Modus** bietet dieselbe schrittweise Spielweise oder zeitgesteuertes Spielen mit Einzähler. Eingebaut sind Fünf-Finger-Übung, Dur-Tonleiter, Dur-Akkorde, Viertel/Achtel, „Freude, schöner Götterfunken“ und „Morgen kommt der Weihnachtsmann“.
6. Die Auswertung zeigt Fortschritt, richtige Einsätze, Fehler, verpasste Einsätze, Trefferquote und mittlere absolute Timing-Abweichung. Trefferquote = richtig / (richtig + falsch + verpasst). Es werden Anschläge bewertet, nicht Notenlängen, Pedal oder Anschlagsdynamik.
7. **Pause / Fortsetzen** erhält Position und Auswertung; Pausenzeit verschiebt die zeitlichen Ziele entsprechend. Beim Verlassen des Trainingsbereichs oder Fokusverlust pausiert die Oberfläche. Ohne Heartbeat oder MIDI-Ereignisse pausiert der ESP nach etwa drei Sekunden und gibt gehaltene Noten frei.
8. **Stoppen & freies Spiel** beendet das Training. Auf dem Dashboard kann freies Spiel ebenfalls ausdrücklich aktiviert werden. LED-Testprogramme und Änderungen der LED-Konfiguration beenden eine laufende Übung.

Die Zeitwertung verwendet den Empfangszeitpunkt am ESP32. WLAN- und Browserlatenz fließen damit in das Ergebnis ein; für die Simulation ist ein großzügiges Zeitfenster sinnvoll. Pro Gerät gibt es einen gemeinsamen Trainingszustand; mehrere Browser sind keine unabhängigen Spieler. Übungen und Ergebnisse liegen im RAM und werden bei Neustart verworfen.

### Virtuelle LED-Leiste (Firmware 1.1.1)

Über der virtuellen Tastatur ist im freien Spiel und im Training die konfigurierte LED-Leiste sichtbar. Sie zeigt die physischen LED-Indizes ab 0 und die vom ESP32 berechneten Farben. Zielnoten, gespielte Noten, Fehler und Testfarben werden aus dem aktuellen, bereits helligkeitsskalierten Ausgabepuffer übernommen. GRB/RGB wird für die Anzeige in RGB umgerechnet. Zur besseren Sichtbarkeit ist die Bildschirmdarstellung aufgehellt; sie ist keine Messung des elektrischen Signals oder der tatsächlichen Leuchtstärke.

Die LED-Beschreibungen enthalten die zugehörigen MIDI-Noten. Startoffset, umgekehrte Reihenfolge und mehrfach zugeordnete Noten werden berücksichtigt. Die Vorschau unterstützt 1–300 LEDs und wandert mit der Tastatur zwischen Dashboard und Training. Antworten auf MIDI-, Trainings-, Konfigurations- und LED-Befehle enthalten den aktuellen Farbzustand, sodass Tasteneingaben unmittelbar aktualisiert werden. Weitere Änderungen werden über die Statusabfrage abgeglichen; kurze Taktimpulse können zwischen zwei Abfragen liegen.

Die API liefert unter `leds` Anzahl, GPIO, Ausgabehelligkeit und `frame` als sechs RGB-Hexzeichen pro LED. Maximal werden 1.800 Farbzeichen pro Snapshot übertragen. Dieser Zustand wird aus dem Puffer gelesen und nicht unabhängig im Browser nachgebildet.

### Eigene MIDI-Datei

Unter Training eine `.mid`/`.midi`-Datei wählen, Importkanal und bei Bedarf Transposition einstellen, dann **Datei als Übung übernehmen**. Anschließend oben die importierte Übung starten. Der Import läuft vollständig lokal im Browser; die Rohdatei wird nicht auf den ESP hochgeladen oder persistent gespeichert.

Unterstützt werden Standard-MIDI-Dateien **Format 0 und 1**, PPQN-Zeitbasis, Running Status, Note On/Off und gleichzeitig angeschlagene Noten aus mehreren Spuren. Grenzen: 256 KiB, 64 Spuren, 20.000 Ereignisse, 128 Noteneinsätze und acht gleichzeitig angeschlagene Noten. Kanal 0 importiert alle Kanäle außer Schlagzeugkanal 10; ein einzelner Kanal kann gezielt ausgewählt werden. SMPTE-Zeitbasis und Format 2 werden mit einer verständlichen Meldung abgewiesen.

Der Import erzeugt Übungen aus den Note-On-Einsätzen. Gehaltene Begleitnoten, Pedal und Note-Off-Dauern werden nicht als eigene Aufgaben ausgewertet. Vorlauf wird entfernt und durch den Trainings-Einzähler ersetzt. Einsätze dürfen 1/8 bis 16 Viertelschläge auseinanderliegen; Tempoänderungen werden bewusst auf das gewählte feste Übungstempo vereinheitlicht. Umfangreiche Stücke vorher in kurze Übungsausschnitte teilen. [MIDI Association: Standard MIDI Files](https://midi.org/standard-midi-files).

Die portable Zustandsmaschine liegt in `include/TrainingEngine.h`, die eingebauten Übungen in `include/TrainingCatalog.h`, die LED-/Zeit-Anbindung in `TrainingController` und der Importer in `data/midi-file.js`. `GET /api/training` liefert Zustand und Übungskatalog; `POST /api/training` verarbeitet `start`, `pause`, `resume`, `free` und `stop` mit derselben Authentifizierung wie die übrige API. MIDI-Antworten und `/api/status` enthalten den aktuellen Trainingszustand.

## Prüfungen

```sh
pio test -e native
pio run -e c3_supermini
pio run -e c3_supermini -t buildfs
npm ci --ignore-scripts
npm test
node --check data/app.js
```

`npm` und jsdom sind ausschließlich für Entwicklertests nötig; auf dem ESP läuft kein Node.js. Die nativen Tests decken GPIO-Freigabe, Grenzwerte, Mapping, deaktivierte/mehrfach zugeordnete Noten, Kanalfilter und die Umkehrung über viele Streifenlängen und Offsets ab. DOM-Tests prüfen Tastatur, Mehrstimmigkeit, Note-Off, Freigabe bei Fokusverlust, Konfigurations-Requests und sichere Anzeige gescannter SSIDs.

Die konkreten Ergebnisse sowie verbleibende Hardwareprüfungen stehen in [TESTING.md](TESTING.md).

## Technische Quellen

- [Espressif ESP32-C3 Datasheet](https://documentation.espressif.com/ESP32-C3_Datasheet_en.pdf): GPIO/Strapping, USB Serial/JTAG und RMT.
- [SuperMini-Schaltplan / Pinout](https://dl.artronshop.co.th/ESP32-C3%20SuperMini%20datasheet.pdf): übliche Boardbeschaltung; Herstellerklone können abweichen.
- [PlatformIO C3-Boardprofil](https://docs.platformio.org/en/latest/boards/espressif32/esp32-c3-devkitm-1.html): CPU, Speicher und Arduino-Unterstützung.
- [Adafruit NeoPixel 1.12.5 ESP32-Ausgabe](https://github.com/adafruit/Adafruit_NeoPixel/blob/1.12.5/esp.c): RMT-Implementierung.
