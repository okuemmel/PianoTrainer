# 2.0.0-alpha.2 · Phase-2-Vorbereitung

**Entwicklungsstand, keine Hardwarefreigabe.** Board noch im Zulauf. Gemeinsame MIDI-Ereignisse, Quellenverwaltung, DIN-Parser/optionaler S3-UART-Eingang und DE/EN-Diagnose sind vorbereitet. Standard nach Neustart bleibt die virtuelle Tastatur; Quellenauswahl gilt nur bis zum Neustart. Kein neues NVS-/Backupschema.

- [S3 N16R8](s3_n16r8/INSTALLATION.md): nur WROOM-1-N16R8, 16-MiB-Layout, keine bereits geprüfte UART-/USB-Funktion behauptet.
- [C3 SuperMini](c3_supermini/INSTALLATION.md): Regression/virtuelle Eingabe; keine DIN-/USB-Hardwareeingänge angeboten.

Je Profil: Firmwarepaket, optionales Samplepaket, USB-Installations-ZIP, Anleitung und SHA-256-Prüfsummen. Nur das zum Chip passende Verzeichnis verwenden. Es wurde kein Gerät automatisch bespielt.

**Der separate `s3_usb_probe` ist nicht Bestandteil dieser Pakete.** Er wird nur für einen späteren geprüften Hardwareversuch gebaut, über einen gesonderten UART-Debugpfad bedient und installiert den Host erst nach `U`. Er prüft ausschließlich Enumeration/Deskriptoren, empfängt noch keine USB-Noten und erzeugt keine OTA-Pakete.

[Umfang, Grenzen und nächste Schritte](../../docs/V2_MIDI_PREPARATION.md) · [Testnachweise](../../docs/V2_TEST_PLAN.md). Kein finaler v2-Release-Tag.
