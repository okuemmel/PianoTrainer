# 2.0.0-alpha.1 · Entwicklungsartefakte

**Softwareport, keine S3-Hardwarefreigabe.** Zielboard noch im Zulauf; keine Uploads oder reale Funktionsabnahme durchgeführt. Es gibt keinen finalen v2-Release-Tag.

- [s3_n16r8](s3_n16r8/INSTALLATION.md): nur für ESP32-S3-WROOM-1-N16R8, 16-MiB-Layout, QSPI-Flash/OPI-PSRAM. Modul/Ports/Pinout vor Nutzung prüfen.
- [c3_supermini](c3_supermini/INSTALLATION.md): separater C3-Regressions-/Datenexport-Helferbuild. Nur dieses Chipziel darf für den alten C3 verwendet werden; die stabile C3-Version bleibt v1.15.1.

Je Verzeichnis: `firmware.ptupdate`, optionales Sampleimage `littlefs.ptupdate`, USB-Erstinstallation als ZIP, Anleitung und `SHA256SUMS.txt`. Nicht zwischen den Verzeichnissen mischen. Vor Gerätewechsel JSON-Backup und Browserfavoriten sichern; WLAN/Passwörter/Webschutz separat neu einrichten.

Vollständiger Status und Migrationsschritte: [V2_S3_PORT.md](../../docs/V2_S3_PORT.md). Prüfungen und offene Hardwarefälle: [V2_TEST_PLAN.md](../../docs/V2_TEST_PLAN.md).
