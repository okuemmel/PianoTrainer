# v1.12.0 · Firmware und Oberfläche gemeinsam aktualisieren

Ein einziges `firmware.ptupdate` aktualisiert nun Firmware, Weboberfläche und sämtliche Sprachdateien gemeinsam. Die Oberfläche liegt komprimiert im Firmware-Flash und funktioniert auch bei fehlendem oder beschädigtem LittleFS. Der Upload schreibt den freien OTA-Slot; ein unvollständiger oder fehlerhaft geprüfter Firmwareupload aktiviert diesen Slot nicht.

## Installation

1. Unter **System → Update, Backup & Restore** ein Backup herunterladen.
2. `firmware.ptupdate` aus diesem Release auswählen und übertragen.
3. Neustart abwarten und die Seite neu laden.

Auch von Version 1.11.0 ist nur das Firmwarepaket erforderlich. Vorhandene Klaviersamples, Geräteeinstellungen und Lernfortschritt bleiben erhalten. Ohne Samples arbeitet der Browser mit dem Synthesizer-Fallback.

`littlefs.ptupdate` ist optional und wird nur für fehlende oder geänderte Klaviersamples benötigt. Dieses Paket schreibt weiterhin eine einzelne Dateisystemkopie; ein Abbruch kann einen erneuten Upload oder USB erfordern. Die neue Oberfläche ist davon unabhängig. `/recovery` bietet einen zusätzlichen Firmwareuploader.

Für die Erstinstallation ist das USB-ZIP mit allen nötigen Images vorgesehen. Offsets und Befehle stehen in `INSTALLATION.md`. Alle Downloads liegen außerdem versioniert unter `dist/v1.12.0/` im Repository. `SHA256SUMS.txt` enthält die Prüfsummen.

## Geprüft und offene Erprobung

- C3-Firmwarebuild und LittleFS-Build erfolgreich; Flashbelegung 80,3 %, statischer RAM 15,6 %.
- 63 Node-Tests, 20 native Tests und 4 Python-Werkzeugtests bestanden; Formatprüfung bestanden.
- Paketinhalt und Manifest gegen die aktuellen Images geprüft, SHA-256-Prüfsummen erzeugt.
- Noch kein Hardwareupload dieser Version: eingebettete HTTP-Auslieferung, Betrieb ohne LittleFS und das neue gemeinsame OTA-Paket sind am echten C3 noch nicht geprüft. Daher Vorabrelease.

Das Projekt ist vibe coded. Die dokumentierten Tests ersetzen keine vollständige Erprobung am Instrument. Ein automatischer Rollback nach einem Fehler beim Start einer neuen Firmware ist nicht eingerichtet.
