# Piano Trainer 1.15.1 · ESP32-C3 SuperMini, 4 MB

## Webupdate / Web update
1. System → Update, Backup & Restore öffnen / open.
2. firmware.ptupdate übertragen / upload. Neustart abwarten / wait for restart.
3. Seite neu laden / reload page. Firmware, Oberfläche und Sprachen sind gemeinsam aktualisiert.
   Firmware, interface and languages are updated together.

littlefs.ptupdate ist optional: nur für die Klaviersamples / only for the piano samples.
Für normale Updates NICHT nötig / NOT required for normal updates.
Ein vorhandener Samplebestand bleibt beim Firmwareupdate erhalten / existing samples are preserved.

Vor einem Update das JSON-Backup herunterladen. Während der Übertragung die
Stromversorgung verbunden lassen. Ein unvollständiger Firmwareupload aktiviert den neuen OTA-Slot nicht.
An incomplete firmware upload does not activate the new OTA slot.
Die Oberfläche funktioniert auch ohne LittleFS / the interface works without LittleFS.
/recovery bietet einen Firmwareupload / provides a firmware upload.
Das optionale Sampleupdate schreibt eine einzelne Dateisystemkopie; bei Abbruch ggf.
erneut übertragen oder USB verwenden / interrupted sample updates may need retry or USB.
Firmwareupdate erhält Einstellungen und Lernfortschritt. Passwörter werden nicht exportiert.

## USB-Erstinstallation / USB installation
USB-ZIP entpacken und im entpackten Verzeichnis ausführen / extract ZIP, run inside it:

python3 -m pip install esptool==4.5.1
python3 -m esptool --chip esp32c3 --port PORT --baud 460800 write_flash 0x0 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 firmware.bin 0x310000 littlefs.bin

PORT ersetzen / replace PORT, z. B. /dev/cu.usbmodem101 oder COM5.
Die Befehle verwenden das 4-MB-Layout dieses Projekts und schreiben die angegebenen
Partitionen. WLAN-/Geräteeinstellungen im NVS werden dabei erhalten.
Nach Neustart / after restart: MIDI-Trainer-Setup, Passwort/password piano123,
http://192.168.4.1/, ohne Webanmeldung / no web login by default.
Optional unter System aktivieren / enable under System if desired: admin / admin
(sofern Passwort nicht selbst geändert / unless password was changed).

Dokumentation/documentation: https://github.com/okuemmel/PianoTrainer
