# ESP32-S3-Port · 2.0.0-alpha.1

Stand: 1. November 2026. Phase 1 wurde mit „dnn los“ freigegeben. Softwareport auf `feature/v2-s3-port`, Integration per Pull Request nach `develop/v2`. **Keine Hardwareabnahme und kein finales v2-Release.** Das Board ist noch im Zulauf; es wurde kein Gerät geflasht. Referenz bleibt v1.15.1, Commit `6e8206f0dfab4b182a6550b6aa9f3f70d67e2457`.

## Hardware und Grenzen der Angaben

Nutzerangabe: ESP32-S3 DevC-1-N16R8-S3. Produktlink: [Amazon B0GVJ5WMR1](https://www.amazon.de/dp/B0GVJ5WMR1). Die vom Nutzer eingefügte Anbieterbeschreibung nennt **WROOM-1-N16R8**, 16 MB Flash, zwei USB-C-Buchsen. Keine eigene Sichtprüfung; der Produktlink war im Recherchewerkzeug nicht abrufbar. Marketingangaben zu anderen Peripheriefunktionen werden nicht ungeprüft als Hardwarefähigkeit übernommen.

Das Profil verwendet für WROOM-1-N16R8 **QSPI-Flash und OPI-PSRAM** entsprechend der [Espressif-Speichertabelle](https://docs.espressif.com/projects/arduino-esp32/en/latest/troubleshooting.html). Die reale Erkennung von 16 MiB Flash und 8 MiB PSRAM muss das Bootlog bestätigen. `ESP.getPsramSize()` und freies PSRAM stehen zusätzlich in `/api/status` und der Systemansicht. 512 KB interner Chip-RAM ist nicht die PSRAM-Größe und nicht der frei verfügbare Anwendungsheap.

PlatformIO-Basis ist `esp32-s3-devkitc-1`, dessen N8-/No-PSRAM-Defaults ausdrücklich durch `s3_n16r8` überschrieben werden. Der PlatformIO-Banner kann noch den Namen des Basisboards zeigen; maßgeblich sind `qio_opi`, `BOARD_HAS_PSRAM`, `--flash_size 16MB` und die eigene Partitionstabelle. `upload.maximum_size=4194304` bezeichnet den **OTA-Appplatz**, nicht die physische Flashgröße.

GPIO-Kandidaten: **1, 2, 4–18, 21**. GPIO 4 bleibt der vorhandene LED-Standard. Das ist eine konservative Modulauswahl, keine Freigabe unbekannter Trägerplatinen. Strapping (0/3/45/46), USB (19/20), Flash-/PSRAM-Pins, mögliche Board-LEDs (38/48), Debug-/UART-Pins sind aus dieser LED-Auswahl ausgeschlossen. Insbesondere 35–37 stehen bei Octal-Speicher nicht extern zur Verfügung; siehe [Espressif DevKitC-1](https://documentation.espressif.com/esp-dev-kits/en/latest/esp32s3/esp32-s3-devkitc-1/user_guide_v1.1.html). BOOT-Recovery nutzt beim S3 GPIO 0, beim C3 weiterhin GPIO 9; acht Sekunden im laufenden Betrieb setzen NVS zurück.

Die Konsole verwendet vorläufig USB Serial/JTAG (`ARDUINO_USB_MODE=1`, CDC beim Boot). **Das aktiviert keinen USB-MIDI-Host.** Welche Buchse USB-UART und welche natives USB führt, muss am tatsächlichen Board geprüft werden. Für Phase 2 ist ein **OTraki MIDI-USB-Konverter, 5-polig IN/OUT**, vorgesehen: Keyboard MIDI OUT → Adapter MIDI IN → S3-USB-Host. Exakter Modellcode, VID/PID, Deskriptoren, Class-Compliance, Strombedarf, eventuelle galvanische Trennung, VBUS-Schutz und nötige Adapter sind offen. Nicht aus zwei USB-C-Buchsen auf sichere Hostversorgung schließen. Direktes DIN-UART-MIDI bleibt eine gesonderte Implementierung mit Optokoppler.

## Softwareumfang

Arduino 2.0.17 / IDF 4.4.7 und PlatformIO espressif32 6.10.0 bleiben als Referenztoolchain erhalten. Alle vorhandenen Lernmodi, 20 Lektionen, 19 Vorlagen, Browser-MIDI-/Audio-/Falling-Notes-Funktionen, LED-Effekte, Nextcloud/Onlineimporte, Auth-/Sessionsteuerung und Sprachen werden weiterverwendet. Es gibt keinen neuen Transportmaster, USB-Host oder RMT-DMA-Treiber in dieser Phase.

Additive Änderungen:

- Boardprofil mit S3-Pinkandidaten, Chip-/Layoutkennung und BOOT-Pin; C3-Profil für Regression und Datenexporthilfe bleibt vorhanden.
- `/api/status` ergänzt `psram`, `freePsram`, `update:{target,layout,firmwareMax,filesystemSize}`. Grenzwerte stammen aus den tatsächlichen Partitionen. Vorhandene Felder und Routen bleiben erhalten; Boardname in der Navigation folgt dem Gerät.
- Paketbauer, Browser und Firmware prüfen Chipziel und Layout. Die Firmware prüft zusätzlich die Chip-ID im ESP-Anwendungsimage; Compilezeitprüfung bindet sie an die SDK-Konstanten. Releasewerkzeuge validieren auch Bootloader-Chip und binäre Partitionstabelle.
- `/api/restore/preview` validiert das komplette schema-1-Profil mit bestehendem Validator, ohne NVS-/Konfigurationsänderung. Auth und Session entsprechen Restore. Die Oberfläche prüft vor dem Stoppen von Player/Training. Nicht freigegebene alte LED-Pins erfordern manuelle, validierte Auswahl; keine automatische Umverdrahtung.
- Separates binäres Browserbackup mit vollen MIDI-Bytes, Namen/IDs/Speicherzeit und fünf UI-Präferenzen. Keine Passwörter, Sessiontokens, Authdaten oder Geräte-NVS.

## Flash- und Updateformat

| Partition | Offset | Größe |
|---|---|---|
| NVS | `0x9000` | `0x5000` |
| OTA-Metadaten | `0xe000` | `0x2000` |
| App 0 | `0x10000` | `0x400000` (4 MiB) |
| App 1 | `0x410000` | `0x400000` (4 MiB) |
| LittleFS | `0x810000` | `0x7f0000` (8.325.072 Bytes) |

Summe endet exakt bei 16 MiB, ohne Überschneidungen. NVS-/OTA-Metadatenoffsets bleiben gleich; **das ist keine Erlaubnis, C3-Rohflash oder NVS auf den S3 zu klonen**. Hardwarewechsel erfolgt über JSON-/Browserexporte und neue USB-Erstinstallation.

Der 256-Byte-JSON-Kopf bleibt schema 1, ergänzt `layout`. S3 verlangt `target:esp32s3`, `layout:s3-n16r8-v1`, Chip-ID 9. C3 nutzt `target:esp32c3`, `layout:c3-v1`, Chip-ID 5; alte v1-C3-Pakete ohne Layout bleiben ausschließlich beim C3 zulässig. Beide Profile prüfen Größe/MD5 und lehnen das jeweils andere Chipziel ab. Dateien werden nur nach dem zugehörigen Imagebau verpackt; ein altes Image wird beim Projektladen nicht mit einer neuen Version beschriftet.

MD5/CRC32 dienen der Erkennung von Übertragungsfehlern, nicht der Authentizität. Nur vertrauenswürdige Builds verwenden. OTA schützt einen unvollständigen Upload durch den getrennten Appplatz; ein automatischer Rückfall nach jedem Bootfehler ist weiterhin nicht zugesichert. LittleFS bleibt eine einzelne Kopie; `/recovery` und die normale Oberfläche sind in Firmware eingebettet und bleiben ohne Sampledateisystem erreichbar, solange die App läuft.

## Datenumzug vom C3

1. Am alten Gerät JSON-Backup herunterladen. Es enthält Hostname, LED-/Tastaturzuordnung, Nextcloud-Ordner/Benutzer/CA und sämtliche 20 Lektionsergebnisse. WLAN, Webschutz und Passwörter werden nicht exportiert.
2. Browserfavoriten gehören zum **alten Origin**. Der v1.15.1-Browser besitzt noch keinen Archivexport. Dafür gibt es einen getrennten **C3-Entwicklungsbuild dieser Änderung**: vor Nutzung das JSON-Backup erstellen, nur das C3-`firmware.ptupdate` installieren und dieselbe alte Adresse mit demselben Browser öffnen. Kein Sampleupdate nötig. Dieser Helferpfad ist noch nicht am realen C3 geprüft; es wurde nichts automatisch übertragen. Stable-Tag und `main` bleiben unverändert.
3. Unter System „Browser-Favoriten & Ansicht sichern“ herunterladen. `.ptbrowser` enthält einen `PTBRW001`-Kopf, begrenztes JSON-Manifest und binäre MIDIs ohne Base64-Aufblähung. Pro Datei werden Größe und CRC32 geprüft. Präferenzen: `language`, `navigationCollapsed`, `showScore`, `scoreLabels`, `trainingDisplay`.
4. Neues Board vor Installation identifizieren: Modulaufdruck, Flash/PSRAM, Buchsen, Pinout. S3-Paket ausschließlich auf S3 installieren. Mit Setup-WLAN verbinden, WLAN neu konfigurieren.
5. JSON auf neuem Gerät importieren. Falls der alte GPIO gesperrt ist, bewusst einen passenden, tatsächlich angeschlossenen GPIO wählen. Vorabprüfung und RESTORE-Bestätigung müssen erfolgreich sein. Danach neu verbinden und alle Mappingwerte und Lektionsergebnisse vergleichen.
6. Browserarchiv am neuen Origin importieren. Alle Dateien werden vor der ersten Schreibtransaktion geprüft. Favoriten werden atomar zusammengeführt: identische IDs ersetzt, andere behalten; höchstens 32 Dateien/32 MiB, 2 MiB pro Datei. Fehler/Quota brechen den Favoritenimport vollständig ab. UI-Präferenzen werden anschließend gespeichert; ein Fehler dabei wird als teilweise erfolgreiche Übernahme gemeldet. Neu laden übernimmt die Ansicht.
7. **WLAN, Nextcloud-App-Passwort und optionalen Webschutz neu einrichten.** Gerätewechsel überträgt keine Secrets und aktiviert nicht automatisch den bisherigen Zugriffsschutz. Auth-/Passwortzustand und Cloudzugriff ausdrücklich prüfen. Das alte Gerät/Backup erst nach erfolgreichem Vergleich aufgeben.

## Reproduzieren und installieren

```sh
npm install
npm test
npm run format:check
python3 -m unittest discover -s test -p test_tools.py
pio test -e native -e native_s3
pio run -e s3_n16r8
pio run -e s3_n16r8 -t buildfs
python3 tools/build_release.py --board s3_n16r8
# Regression / optionaler Datenexport-Helfer:
pio run -e c3_supermini
pio run -e c3_supermini -t buildfs
python3 tools/build_release.py --board c3_supermini
```

Die getrennten Pakete liegen unter `dist/v2.0.0-alpha.1/{s3_n16r8,c3_supermini}/`, jeweils mit `INSTALLATION.md`, Prüfsummen und USB-ZIP. Vor Nutzung die SHA-256-Prüfsummen vergleichen. Es gibt **kein finales v2-Release**, keinen Upload auf die angeschlossene C3-Hardware und keinen Merge nach `main`. Auch das Installieren des C3-Helfers ist eine bewusste manuelle Entwicklungsinstallation, kein unbemerkter Produktwechsel.

## Noch offene Abnahme

Alle manuellen Fälle M01–M22 und S3-Hardwarefälle im [Testplan](V2_TEST_PLAN.md) bleiben offen. Zuerst Modul-/Portidentifikation und echte Speichererkennung, dann LED-Test/Mapping, WLAN/AP und iOS-Audio/Canvas, Nextcloudoperationen, Lernfortschritt, schema-1-Restore samt gesperrtem GPIO, Auth-/Sessionübernahme, OTA/Recovery und Unterbrechungen prüfen. Erst diese Belege können P1 vollständig abschließen. OTraki-/USB-/DIN-Tests gehören zu Phase 2; Latenz-/DMA-Messungen zu Phase 3.
