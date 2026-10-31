# Prüfprotokoll

Stand: 31. Oktober 2026. Ziel: ESP32-C3 SuperMini, 4 MB Flash, native USB-CDC, Arduino-Framework, C++17.

## Ausgeführt

| Prüfung | Ergebnis |
|---|---|
| `pio run -e c3_supermini` | Erfolgreich, Firmware und ESP32-C3-Bootloader erzeugt |
| `pio run -e c3_supermini -t buildfs` | Erfolgreich, LittleFS mit HTML, CSS und JavaScript erzeugt |
| `pio test -e native` | 18 von 18 Tests bestanden |
| `npm test` | 49 von 49 Browser-/MIDI-Tests bestanden |
| `node --check data/app.js` | JavaScript-Syntax gültig |
| `npm run format:check` | Bestanden |

Build: Espressif32 6.10.0, Arduino-ESP32 2.0.17 (`3.20017.241212+sha.dcc1105b`), RISC-V GCC 8.4.0, Adafruit NeoPixel 1.12.5, ArduinoJson 6.21.5. Der tatsächliche Build kompiliert die ESP32-RMT-Ausgabe der NeoPixel-Bibliothek für C3.

Speicherbelegung laut finalem Linkergebnis:

- Statischer RAM: **50.700 / 327.680 Bytes (15,5 %)**; dynamische Laufzeitallokationen sind darin nicht enthalten.
- Anwendung im Flash: **1.147.826 / 1.572.864 Bytes (73,0 %)**.
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

## Tastengeometrie, Browser-Audio und große MIDI-Dateien · Firmware 1.2.0

Eine virtuelle LED pro Taste wird über derselben weißen/schwarzen Tastenmitte positioniert. Beide Reihen liegen in einem gemeinsamen horizontalen Scrollbereich. Die Anzeige löst weiterhin das tatsächliche physische Mapping einschließlich Offset, Umkehrung und gemeinsam genutzten LEDs auf. Nicht sichtbare/unzugeordnete Streifen-LEDs werden nicht als zusätzliche Tastenzellen ausgegeben.

Optionaler lokaler Web-Audio-Synthesizer: Benutzeraktion aktiviert den AudioContext, die gespielten Tasten erzeugen Grundton und Obertöne mit Abklinghüllkurve. Note Off, Fokusverlust und Seitenwechsel lösen die Stimmen. Audio läuft im Browser, es werden weder Internet-Samples noch zusätzliche ESP32-Ressourcen benötigt. Es ist ein synthetischer Klang und keine automatische MIDI-Wiedergabe.

Der Browserimport erlaubt 2 MiB / 250.000 Ereignisse / 64 Spuren. Ein gewählter Abschnitt von bis zu 128 Schritten bleibt innerhalb der unveränderten C3-Grenzen. Quantisierung auf 1/32-Noten, Aufteilung langer Pausen und optionaler Tastaturbereichsfilter werden angezeigt. Die angegebene Startposition zählt auch Pausenschritte; Abschnitte werden manuell gewählt und gestartet, nicht automatisch weitergestreamt.

Die bereitgestellte Datei `Metallica_-_Master_Of_Puppets.mid` wurde lokal gelesen, nicht ins Repository übernommen: 108.555 Bytes, Format 1, 25 Spuren, 35.201 Ereignisse. Der alte Parser brach an der 20.000-Ereignisgrenze ab. Mit Bereich 48–96 und allen Kanälen außer 10: 1.816 Schritte in 15 Abschnitten; 8.475 Note-On-Ereignisse außerhalb der Tastatur ausgelassen. Alle 15 Abschnitte konnten geparst werden; Notenbereich, Akkordgröße, Dauergrenzen und JSON-Payload unter 12.288 Bytes wurden geprüft. Das Dateitempo 220 BPM wird für die Übung auf die bestehende Obergrenze 200 BPM gesetzt und in der Oberfläche ausgewiesen.

Bestanden: 16 native Tests, 23 Node-Tests (15 DOM/Audio, 8 Parser), Format- und Syntaxprüfung, C3-Firmwarebuild. Neue Prüfungen decken weiße/schwarze Tastenpositionen und gemeinsamen Scrollcontainer, 440-Hz-Grundton samt Freigabe anhand eines AudioContext-Testdoubles, Abschnittsübertragung, lange Dateien, Rasterung und Pausen ab. Diese Prüfungen bestätigen keine tatsächliche hörbare Audioausgabe oder Safari-Darstellung. Firmware 1.2.0 und das neue LittleFS-Image wurden anschließend erfolgreich über USB auf den C3 übertragen; beide Images wurden per Flash-Hash verifiziert. Ein kompletter Safari-/Trainingsdurchlauf auf dem Gerät bleibt manuell zu prüfen.

## Optionale Notenvorschau · Firmware 1.3.0

Eine lokal erzeugte SVG-Ansicht stellt den aktuellen und die nächsten fünf Einsätze im Violin- und Bassschlüssel dar. Ein separater Schalter blendet Notennamen ein/aus. Beide Einstellungen werden browserlokal gespeichert. Die Ansicht zeigt Notenköpfe, Hilfslinien, einzelne Kreuzvorzeichen, Akkorde, Pausen, Oktavierungshinweise und Einsatzabstände. Sie ist eine Tonhöhen-Vorschau, keine Rekonstruktion einer vollständigen Partitur mit Stimmen, Taktart und originalen Notenlängen.

`TrainingController::status()` liefert ein begrenztes `upcoming`-Fenster direkt aus der laufenden Gerätesequenz, auch für eingebaute Übungen. Pause behält die Vorschau, freie Wiedergabe und Abschluss liefern keine folgenden Schritte. Der Client verwendet keine zweite Übungsfolge und zeichnet bei unveränderter Vorschau nicht neu.

Bestanden: 16 native Tests und 26 Node-Tests (18 DOM/Audio/Notation, 8 Parser), C3-Firmwarebuild, Format-/Syntaxprüfung. Drei zusätzliche DOM-Tests prüfen die optionalen Ansichten, zehn Notenlinien, konkrete Tonhöhenpositionen (E4, C4, G2, H3), Akkorde, Vorzeichen, Pausen, Notennamen, sechs Schritte Vorschau, Fortschritt/Pause/Stop/Abschluss und Oktavierung für MIDI 0/127. Die Tests sind keine visuelle Safari-Prüfung. Firmware: 43.068 Bytes statischer RAM, 864.702 Bytes Flash. Firmware 1.3.0 und die neue LittleFS-Weboberfläche wurden auf den angeschlossenen C3 übertragen und beide Flash-Hashes erfolgreich verifiziert. Die sichtbare Darstellung auf Safari und das Spielen mit dieser Vorschau sind noch manuell zu prüfen.

## Ausblendbare Navigation

Die ☰-Schaltfläche im Kopfbereich blendet die Navigation vollständig aus und wieder ein. Die verbleibende Hauptspalte nutzt dann die verfügbare Breite; auch die mobile Navigationsleiste kann ausgeblendet werden. Der Zustand wird browserlokal gespeichert. `hidden`, `aria-expanded`, Beschriftung und Fokus werden gemeinsam aktualisiert.

Geprüft: 16 native und 26 Node-Tests, Format-/Syntaxprüfung, C3-Build, LittleFS-Build. Zusätzlich wurde das Umschalten, Wiederherstellen des gespeicherten Zustands, ARIA und Fokus mit einem einmaligen jsdom-Durchlauf geprüft. Das neue LittleFS-Image wurde über USB hochgeladen und per Flash-Hash verifiziert. Die responsive Darstellung in Safari wurde hier nicht visuell geprüft.

## Netzwerkdiagnose, Hostname und mDNS · Firmware 1.4.0

Die WLAN-Seite zeigt Router- und Setup-IP-Konfiguration getrennt. Routerdaten umfassen die tatsächliche IPv4-Adresse, Subnetzmaske, Gateway, DNS-Server, MAC, Signalstärke, aktiven Hostnamen und mDNS-Status. Offline werden keine alten Routeradressen als aktuell angezeigt. Die Adressvergabe bleibt DHCP.

Der neue geschützte POST-Endpunkt `/api/network` validiert/normalisiert den Hostnamen, speichert ausschließlich diesen NVS-Wert und startet danach neu. WLAN-Zugangsdaten bleiben unabhängig davon erhalten. Hostnamen sind auf 31 Zeichen begrenzt, weil der lokale Arduino-ESP32-Core 2.0.17 einen 32-Byte-Cache verwendet. NUL, Leerzeichen, Punkte, nicht-ASCII-Zeichen und ungültige Bindestrichpositionen werden verworfen. Nach dem Boot wird der Hostname vor dem WLAN-Start gesetzt. Bei Routerverbindung startet ESPmDNS mit HTTP-Dienst; Fehler werden mit mindestens zehn Sekunden Abstand erneut versucht. Verbindungsabbruch beendet mDNS, Wiederverbindung startet es neu.

Bestanden: 17 native Tests, 29 Node-Tests (21 DOM/Audio/Notation, 8 Parser), Format-/Syntaxprüfung und C3-Firmwarebuild. Neue Hostnamenprüfungen decken gültige Namen, Grenzen 31/32, Sonderzeichen und eingebettete NUL ab. Neue DOM-Prüfungen decken IP-/DNS-/mDNS-Anzeige, Normalisierung/Übertragung des Hostnamens ohne WLAN-Zugangsdaten, Neustarthinweise, Erhalt ungespeicherter Eingaben und getrennte Offline-/AP-Daten ab. Ein anfangs paralleler PlatformIO-Lauf erzeugte Meldungen beim Löschen veralteter Build-Artefakte; anschließend wurde der aktuelle Firmwarestand sequenziell erfolgreich gebaut.

Firmware 1.4.0 und das neue LittleFS-Image wurden erfolgreich auf den C3 übertragen und per Flash-Hash verifiziert. Anschließend antwortete `/api/status` sowohl über `http://192.168.100.127/` als auch über `http://midi-trainer.local/`: Firmware 1.4.0, Routerverbindung aktiv, Hostname `midi-trainer`, mDNS aktiv, Setup-AP aus. Damit ist die tatsächliche Namensauflösung vom verwendeten Mac im aktuellen Netzwerk bestätigt. Ein benutzerseitiger Namenswechsel samt NVS-Erhalt und das Verhalten nach WLAN-Ausfall sind noch separat am Gerät zu prüfen.

Die Nextcloud-Planung wurde präzisiert: festes MIDI-Verzeichnis in den Einstellungen, enthaltene MIDI-Dateien automatisch in der Auswahlliste. Die Nextcloud- und MIDIsss-Anbindungen sind weiterhin nicht implementiert.

## MIDI-Bibliothek, kompakte Oberfläche und Anhören · Firmware 1.6.0

Implementiert: persistentes festes Nextcloud-WebDAV-Verzeichnis, Dateiliste beim Öffnen des Trainings, Aktualisieren, MIDIsss-Suche mit Metadaten, Download/Abbruch und gemeinsamer MIDI-Import. Zugangsdaten werden nicht per API zurückgegeben. Remote-Jobs laufen einzeln in einem Hintergrundtask mit 16-KiB-Ringpuffer; der Browser erhält wiederholbare 4096-Byte-Blöcke. Ganze Dateien bleiben im Browser, nicht im ESP-Flash. Grenzen: MIDI 2 MiB, Listen 256 KiB, Zeitlimit etwa drei Minuten. Zertifikatsprüfung erfolgt mit SDK-CA-Bundle oder gespeicherter privater CA; bei fehlender Uhrzeit wird NTP versucht. Keine automatische Weiterleitung an fremde Hosts.

LED-Aufbau und Tests sind auf einer Seite zusammengeführt, die Notenzuordnung ist aufklappbar; Abstände und Bedienelemente sind kompakter. Alte Links auf `#config` führen zur gemeinsamen LED-Seite. Eine vorhandene mobile CSS-Regel mit negativen Black-Key-Rändern aus dem früheren Flex-Layout wurde entfernt, damit die absolute Tastengeometrie mit den LED-Mitten übereinstimmt.

MIDI-Anhören: kompletter Notenablauf mit Note-Off-Dauern, Velocity, Originaltempo und Tempoänderungen, getrennten gleichnamigen Noten verschiedener Kanäle und begrenzten Ersatzdauern bei fehlendem Note Off. Lokaler Synthesizer mit bis zu 32 Stimmen und kleinen Planungsfenstern, Pause/Fortsetzen, Stopp, Lautstärke und Freigabe bei Fokusverlust/Seitenwechsel. Keine Trainingsanschläge oder LED-Note-On-Ereignisse aus der Wiedergabe; Kanal/Transposition gelten, Tastatur-/Abschnittsgrenzen nicht. Originalinstrumente, Pedal und Pitch Bend fehlen. Die bereitgestellte Metallica-Datei wurde zusätzlich als vollständige Wiedergabe gelesen: 13.060 Noten, 473,18 Sekunden.

Bestanden: **18 native Tests und 40 Node-Tests**, Format-/Syntaxprüfung und Firmwarebuild. Neue Prüfungen betreffen URL-/Dateinamenbegrenzung, UTF-8-URL-Encoding, Nextcloud-XML mit fremden oder verschachtelten Links, MIDIsss-Antworten, Block-Wiederholung nach Netzwerkfehler, Größenlimit/Abbruch, persistente Formularübertragung ohne Passwort-Rückgabe, automatische Liste, beide Importquellen sowie Wiedergabe mit Tempoänderung, Note Off, Kanalüberlagerung, Tonhöhe und Pause/Stopp. Die Audio-Tests verwenden einen AudioContext-Testdouble; sie bestätigen keine hörbare Ausgabe auf iPhone/Safari.

### Tatsächlich am C3 geprüft

- Firmware und LittleFS-Image wurden über USB hochgeladen, Flash-Hashes jeweils verifiziert.
- Ein temporärer authentifizierter HTTP-WebDAV-Testserver lieferte eine Verzeichnisliste (238 Bytes) und eine selbst erzeugte MIDI-Datei mit 128.026 Bytes. Authentifizierung und `Depth: 1` wurden geprüft. Das Gerät übertrug die Datei unverändert in 6,13 Sekunden, einschließlich Wiederholung eines bereits abgeholten Blocks. SHA-256: `ee6a82a027c2a7620e608b96b6c0bc1c19508337a0f71150f512393fb92e621a`. Status-HTTP blieb während der laufenden Übertragung abfragbar. Test-Einstellungen wurden anschließend wieder entfernt; Routerdaten blieben erhalten.
- Echte MIDIsss-HTTPS-Suche `piano`: drei Treffer, 192 Bytes; erster MIDI-Download: 5.863 Bytes. Damit sind TLS inklusive Zertifikat-/Zeitprüfung und Binärtransfer auf dem C3 bestätigt.
- Ein jsdom-Durchlauf lud die echte Geräte-Weboberfläche über HTTP, suchte MIDIsss, übernahm den Treffer „Electricity“, parste 128 von 356 Übungsschritten und startete die importierte Übung tatsächlich auf dem C3. Danach wurde freies Spiel wiederhergestellt. Dies war ein DOM-/API-Durchlauf, keine visuelle Safari-Prüfung.
- Aufbauillustrationen wurden mit dem eingebauten Imagegen-Werkzeug erstellt und ins Repository kopiert. Das separat gezeichnete SVG-Anschlussschema wurde gerendert und visuell auf Beschriftung und Leitungsführung geprüft. Die Bilder sind keine Fotos eines real geprüften Aufbaus; ihre Prompts und Grenzen stehen unter `docs/images/GENERATED.md`.

Offen bleiben die eigene Nextcloud-Installation (einschließlich öffentlicher Freigabe/private CA), sichtbare Safari-Darstellung und tatsächliches Anhören auf dem Zielgerät. Die Implementierung der beiden Quellen ist abgeschlossen; diese installationsabhängigen Prüfungen sind in TODO.md als offen gekennzeichnet.

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

## Mobilansicht, MIDICollection und Wiedergabe-LEDs · Firmware 1.7.0

Die Start-/Anhörsteuerung steht gemeinsam oben. Selten benötigte Übungsoptionen, Bibliothek und lokaler Import sind aufklappbar. Auf Displays bis 1000 Pixel Breite ist das Menü beim ersten Besuch eingeklappt; eine gespeicherte Auswahl hat Vorrang. Die mobile Navigation scrollt horizontal. Engere Karten- und Kennzahlenabstände sparen Platz, Touch-Bedienelemente bleiben mindestens 44 Pixel hoch. Die Darstellung ist weiterhin nicht visuell auf iPhone/iPad geprüft.

MIDICollection verwendet das öffentliche HTML-Suchformular mit Seitenwechsel und die dort genannten Dateipfade. Ein Formatwechsel der externen Seite kann die Anbindung beeinträchtigen. Parser- und native Prüfungen verwerfen fremde Hosts, unzulässige Dateipfade und kodierte Pfadwechsel. Leere Suchergebnisse werden unterstützt.

Der Browser sendet während des Anhörens die aktuell klingenden Noten an den authentifizierten Endpunkt `POST /api/playback`. Die nächste Audio-Planung wird nicht vorzeitig an die LEDs gemeldet. Mehrfach belegte Tonhöhen werden mit höchster Velocity zusammengefasst, gleiche Zustände nur als Lebenszeichen erneut gesendet. Es läuft höchstens eine LED-Anfrage gleichzeitig, überholte Zustände werden zusammengefasst. Trainingsanschläge werden dabei nicht gewertet. Pause/Stopp geben die Vorschau frei, ausbleibende Aktualisierungen beenden sie nach drei Sekunden. Die Übertragung erfolgt per WLAN und ist nicht samplegenau mit dem Browserton synchron.

Bestanden: **18 native Tests und 42 Node-Tests**, C3-Firmwarebuild, LittleFS-Build, Format-/Syntaxprüfung. Zusätzliche Tests prüfen MIDICollection-HTML mit Seitenmetadaten, fremden Links, Duplikaten und leeren Ergebnissen; aktuelle statt vorausgeplanter Audiostimmen; zusammengefasste Wiedergabe-LED-Zustände und Freigabe ohne simulierte Trainingsanschläge.

Tatsächlich am C3 mit Firmware 1.7.0 geprüft:

- Firmware und LittleFS per USB übertragen, Flash-Hashes verifiziert.
- Authentifizierter WebDAV-Testserver erneut erfolgreich: 238 Bytes Liste und 128.026 Bytes unveränderte MIDI-Daten samt wiederholtem Datenblock, Dateiübertragung 6,65 Sekunden. Temporäre Nextcloud-Einstellungen danach entfernt.
- MIDIsss erneut erfolgreich: drei Suchtreffer und 5.863 Bytes MIDI-Download.
- MIDICollection: echte HTTPS-Formularsuche nach `metallica`, 25 Dateien in 17.046 Bytes HTML, anschließender Download einer gültigen MIDI-Datei mit 55.354 Bytes.
- Wiedergabe von MIDI-Note 60: Vorschau aktiv, Note im Gerätezustand und LED-Ausgabepuffer sichtbar, Trainingszähler unverändert. Explizites Beenden und Ablauf nach 3,3 Sekunden ohne Lebenszeichen setzen den LED-Puffer wieder auf Aus.

Die Prüfung des Ausgabepuffers bestätigt den Softwarepfad, kein optisch beobachtetes Leuchten. Hörbare Browserausgabe, sichtbare Safari-Darstellung und eine konkrete Nutzer-Nextcloud bleiben manuelle Prüfungen.


## Korrektur: vorzeitiger Wiedergabestopp bei Fokusverlust

Nach der Rückmeldung „Ton stoppt, Status Gestoppt“ wurde der direkte `midiPlayer.stop()` im Fenster-Blur-Handler gefunden. Ein solcher Fokusverlust setzte bislang die Wiedergabe auf Anfang zurück. Der Handler gibt jetzt weiterhin manuelle Tasten frei und pausiert aktives Training, lässt den Datei-Player jedoch laufen. Erst eine tatsächlich versteckte Seite pausiert die Wiedergabe mit erhaltener Position. Der Status nennt den Grund; auch Tasteneingabe, Übungsstart, Dateiauswahl und bewusstes Stoppen sind als Auslöser erkennbar.

Regression: Datei-Player bei Sekunde sieben, Fenster-Blur ohne Stopp, Hintergrundwechsel mit Pause und LED-Freigabe, Fortsetzen bei Sekunde sieben und explizites Stoppen mit sichtbarer Begründung. Der Audio-Unit-Test läuft zusätzlich über 18 Sekunden einer zweiminütigen Folge und endet erst am vorgesehenen Dateiende. Diese Prüfungen verwenden jsdom und einen AudioContext-Testdouble. Der konkrete Fokusauslöser auf dem Nutzergerät ist damit noch nicht beobachtet.


## Lokale Klavier-Samples · Firmware 1.7.1

Player und virtuelle Tasten verwenden 16 lokal ausgelieferte MP3-Samples, ausgewählt aus dem FluidR3-Klavier von MIDI.js Soundfonts. Quellnachweis und Lizenz stehen zusätzlich als Textdatei auf dem Gerät zur Verfügung. Das Klangpaket ist 361.613 Bytes groß, SHA-256 `947049d21d15a778085beb0f6eccd37aa507b7ec3ede92ca2bca3002510cfd4e`. Der Builder prüft den Quell-Hash, liest lediglich die Datentabelle und kopiert die ausgewählten MP3-Bytes unverändert.

Der Browser lädt das Paket einmal pro Seite und dekodiert es pro AudioContext einmal. Er wählt den nächsten Stützton, transponiert per Wiedergaberate und steuert Lautstärke und Filter mit der Velocity. Sanfte Attack-/Release-Hüllkurven vermeiden harte Tonenden. Außerhalb MIDI 21–108 und bei Lade-/Dekodierfehlern bleibt der Synthesizer verfügbar. Erste Aktivierung zeigt den Ladevorgang an; eine inzwischen versteckte Trainingsseite startet die Wiedergabe nach dem Laden nicht automatisch.

Bestanden: 18 native und 46 Node-Tests, darunter Paketgrenzen, Wiederholung nach Ladefehlern, gemeinsamer Download für zwei AudioContexts, korrekte Transposition, Velocity und Release sowie ein DOM-Durchlauf für Sample-Ausgabe über virtuelle Tasten und MIDI-Player. Alle 16 MP3-Daten wurden zusätzlich mit FFmpeg vollständig dekodiert. Der Browser-AudioContext in den Tests ist simuliert; hörbare Qualität und Safari-Ausgabe sind noch am Nutzergerät zu prüfen.

Die vorherige 90-Sekunden-USB-Aufnahme zeigte die anfängliche USB-Reset-/Startsequenz und danach keine weiteren protokollierten Neustarts oder HTTP-/WLAN-Fehler. Die parallel abgefragte Gerätelaufzeit stieg durchgehend, die WLAN-Signalstärke lag etwa bei −58 bis −61 dBm. Die Stichproben zeigten keine aktive Wiedergabe-LED-Vorschau; damit wurde kein Abbruch während einer aktiven Wiedergabe erfasst. Der Nutzer meldete anschließend, dass es beim erneuten Versuch zu funktionieren scheint. Eine eindeutige Ursache ist daraus nicht bewiesen.

Firmware 1.7.1 und das neue LittleFS-Image wurden per USB übertragen; beide Flash-Hashes wurden verifiziert. Danach wurde `piano-samples.bin` tatsächlich über die geschützte Geräte-HTTP-Route geladen: 361.613 Bytes, bytegleich mit der lokalen Datei und identischer SHA-256. Die Statusabfrage meldete Firmware 1.7.1 und bereites Dateisystem. Eine parallel zum Klangpaket laufende Statusabfrage lief zunächst in ein Vier-Sekunden-Zeitlimit; nach Abschluss des Downloads antwortete sie wieder erfolgreich. Der synchrone Webserver kann während dieses einmaligen größeren Transfers andere Anfragen verzögern. Es wurde keine hörbare Ausgabe auf Safari geprüft.


## Projektangaben und Noten beim Anhören · Firmware 1.8.0

Die Fußzeile und Systeminformationen zeigen die Firmware-Version und Urheberangabe; GitHub ist direkt verlinkt. Gemeinsame Metadaten liegen in `include/AppInfo.h`; auch der ausgehende HTTP-User-Agent verwendet diese Version. Der API-Status liefert zusätzlich `author` und `repository`.

Für die Wiedergabe behält der MIDI-Parser die ursprüngliche Viertelschlag-Position jedes Noteneinsatzes bei. Der Player gruppiert gleichzeitige Tonhöhen und berechnet einmalig die Einsätze. Ein binär gesuchtes Fenster zeigt höchstens sechs Gruppen. Audio-Vorplanung verändert die angezeigte aktuelle Note nicht vorzeitig; die Vorschau nutzt die Playerposition. Pausierter Trainingsstatus überschreibt die Wiedergabenoten nicht. Pause hält die Position, Stopp stellt die Übungsvorschau wieder her; das Dateiende leert die Vorschau mit Abschlussmeldung. Noten werden beim Start einer Dateiwiedergabe automatisch sichtbar und bleiben ausblendbar.

Bestanden: **18 native und 49 Node-Tests**, einschließlich Tempoänderungen mit gleichbleibendem Viertelabstand, Akkordgruppierung/Duplikaten, begrenztem Vorschaufenster bei fortgeschrittener Playerposition, Playerpause und Abschluss sowie Wechsel zwischen Trainings- und Player-Snapshots. Die bereitgestellte Metallica-Datei wurde zusätzlich vollständig durchlaufen: 13.060 Noten, 3.931 Einsatzgruppen, 473,18 Sekunden; bei Sekunde 120 erscheint das Fenster 1070–1075. Die Gruppierung benötigte auf dem Entwicklungsrechner rund 10 ms; daraus folgt keine Laufzeitzusage für Mobilgeräte. Footer/Versionsanzeige und GitHub-Ziel wurden im DOM geprüft. Sichtbare Darstellung und Synchronität am iPhone/iPad sind weiter manuell zu prüfen.

Firmware 1.8.0 und LittleFS wurden nach einem zunächst kurzzeitig nicht verfügbaren USB-Port erfolgreich übertragen und jeweils per Flash-Hash geprüft. Anschließend bestätigte die tatsächliche Status-API `firmware: 1.8.0`, `author: okuemmel`, die korrekte Repository-Adresse und bereites Dateisystem. Die über HTTP abgerufene Startseite ist bytegleich mit `data/index.html`. Eine zunächst fehlgeschlagene Verbindung zur Startseite war beim direkten Wiederholungsversuch erfolgreich.
