# PianoTrainer v2 – Migrationsplan und Freigaben

Stand: 1. November 2026. **Planung in Phase 0. Keine Änderung an Firmware, APIs, Gerätekonfiguration oder Buildprofilen.**

Referenz: v1.15.1, Commit `6e8206f0dfab4b182a6550b6aa9f3f70d67e2457`. Branch `develop/v2`. Verbindlich sind [Feature-Matrix](V2_FEATURE_PARITY.md), [Architekturentscheidungen](V2_ARCHITECTURE.md) und [Testplan](V2_TEST_PLAN.md).

## 1. Migrationsprinzip

Die C3-Version bleibt am bestehenden Tag mit ihren geprüften Paketen erhalten. S3-Code entsteht erst nach Freigabe, auf `develop/v2` bzw. Feature-Branches mit Pull Requests dorthin. **Kein automatischer Merge nach `main`, keine v2.0.0-Freigabe aus einem erfolgreichen Build.** Phase 0 erzeugt nur die vier Planungsdokumente und einen eindeutig als Planung bezeichneten Changelog-Eintrag. Die aktuelle AppInfo-Version bleibt 1.15.1; es wird kein vermeintlich fertiges v2-Artefakt erzeugt.

Das Zielboard wurde vom Nutzer als **ESP32-S3 DevC-1-N16R8-S3** genannt. Die Modul-Speicherklasse ist in der Architektur dokumentiert. Hersteller/Revision, reale Speichererkennung, Host-VBUS und Pinbeschaltung bleiben konkrete Prüfpunkte. Phase 1 darf damit nicht still ein beliebiges DevKit mit 8-MB-/No-PSRAM-Standardprofil verwenden.

## 2. Dateninventar – was tatsächlich wo liegt

| Bestand | v1-Ort und Schema | Auf demselben Gerät | Physischer C3→S3-Umzug |
|---|---|---|---|
| LED-/Tastaturdaten | Preferences-Namespace `trainer`, kanonisch JSON `profile`, Backup `led`: `count,pin,brightness,first,keys,baseNote,reversed,rgb,channel,mapping[128]` | vollständig erhalten und validieren | logische Zuordnung, Bereich, Farbenreihenfolge, Offset und Helligkeit übernehmen; physische GPIO-Freigabe separat |
| Hostname | `profile.hostname`, früher NVS-Key `hostname` | bisherigen Wert erhalten | sichtbar übernehmen oder wegen gleichzeitig betriebenem Altgerät bewusst ändern; mDNS-Konflikte vermeiden |
| Nextcloud-Metadaten | `profile.cloud`: `folder,user,ca,password`; früher `cloud` | Account-/Originbindung der Secrets erhalten | öffentliche Metadaten/CA aus Backup; Passwort neu eingeben |
| Lernfortschritt | `profile.lessons.<stabile ID>.{runs,best}`; früher `lessons` | keine Umnummerierung/Neuberechnung; Runs saturierend, Bestwert bewahren | vollständige 20 Datensätze aus Backup übernehmen; zukünftig neue IDs ergänzen |
| WLAN | separater NVS-Key `network`, JSON mit SSID und Passwort | bleibt von Restore unberührt | nicht im öffentlichen Backup; WLAN auf neuem Gerät einrichten |
| Anmeldung | NVS `access`, `auth-enabled`, Initialisierungsmarker `auth-v1` | Aktivierung, Passwort und Marker erhalten; kein erneutes admin-Reset | nicht im öffentlichen Backup; Anmeldung/Passwort bewusst neu provisionieren, fehlenden Import klar anzeigen |
| Virtuelle Tastaturparameter | Sendekanal/Velocity im Browserformular, Filter im LED-Profil | Filter persistiert; Formularwerte wie v1 | keine erfundene persistente Einstellung versprechen |
| Lokale UI-Präferenzen | localStorage `language`, `navigationCollapsed`, `showScore`, `scoreLabels`, `trainingDisplay` | bei gleichem Origin unverändert | IP-/Hostnamenwechsel schafft anderen Origin; eigener Transfer nötig oder im Browser manuell setzen |
| Falling-Notes-Vorschau/Trennnote/Fokus | Browser-RAM | wie v1 nicht dauerhaft | keine verloren gegangene Geräte-NVS-Einstellung; neue Defaults bleiben kompatibel |
| MIDI-Favoriten | IndexedDB `piano-trainer-favorites` v1; `meta`/`midi`, IDs und ArrayBuffer | Datenbankname/-schema nicht unnötig ändern | alte Daten verbleiben am alten Origin; Export/Import oder nachvollziehbarer Origin-Erhalt erforderlich |
| Gewählte MIDI-Datei/Übung/Playerposition | Browser-/ESP-RAM | Neustart startet wie v1 ohne laufende Sitzung | nicht Teil des heutigen Gerätebackups; Quellfile erneut öffnen |
| Samplebank | LittleFS `/piano-samples.bin`, 361.613 B, PTPN-Format | Firmwareupdate erhält sie | passende S3-FS-Erstinstallation; Klangquellen-/Lizenzhinweise mitnehmen |
| Remote-MIDIs | konfigurierte Nextcloud bzw. fremde Downloadquelle | unverändert | nicht löschen/verschieben; dieselben Dateien wieder lesen, Favoriten unabhängig behandeln |
| Sessiontoken / Jobs / Fehlerzustände | RAM; Session 32 Hexzeichen und 30-s-Lease | Neustart verwirft sie bewusst | niemals als aktive Autorisierung importieren |

**Das öffentliche v1-Backup ist kein vollständiger Flash-, Secret- oder Browserdatenexport.** Ein Hardwarewechsel kann diese ausgeschlossenen Informationen nicht automatisch rekonstruieren. Das ist eine Eigenschaft der Referenz, kein Anlass, Passwörter entgegen AGENTS über HTTP zu exportieren.

## 3. Bestehendes Backup und kompatible Schema-Migration

### 3.1 Heute implementiert

`GET /api/backup`: `format:"piano-trainer-backup"`, `schema:1`, `hostname`, `led`, `cloud` ohne Passwort und alle 20 `lessons`; die Route ergänzt `firmware`. WLAN-/Geräte-/Cloudpasswörter, Auth-Aktivierungszustand, Browserfavoriten und Sprachpräferenz werden nicht exportiert.

`POST /api/restore` verlangt `confirm:"RESTORE"`, validiert Format, Typen, Grenzen, Mapping, Hostname, Cloud/CA und jeden Lektionsdatensatz. Erst anschließend speichert `applyProfile` den kanonischen Profilblob. Legacy-Keys `led`, `hostname`, `cloud`, `lessons` werden nach erfolgreichem Commit entfernt; `network`/`access`/`auth-enabled` bleiben. Ein bestehendes Cloudpasswort bleibt auf demselben Gerät nur bei gleichem Origin und Benutzer erhalten. Ein vom öffentlichen Backup mitgeliefertes Passwort wird nicht importiert. Die Aufrufgrenze beträgt 16 KiB für Restore, der JSON-Arbeitsbereich 24 KiB.

Der vorhandene Migrationspfad ist mit Tests und historischen C3-Hardwareprotokollen belegt. Stromausfallsicherheit und S3-Parität sind erneut zu prüfen, nicht aus der Reihenfolge der C++-Anweisungen als bestanden abzuleiten.

### 3.2 Geplanter S3-Importer

1. Eingabedatei begrenzen; `format`, Schema und alle bekannten Datentypen vor jeder Persistenz prüfen. Schema 1 ausdrücklich weiter akzeptieren, unbekannte zukünftige Schemata verständlich ablehnen.
2. In ein temporäres, hardwareunabhängiges Domänenprofil dekodieren. `runs/best` anhand stabiler Lektions-IDs zuordnen; neue Lektionen mit neutralen Werten ergänzen, bekannte alte nie überschreiben/umbenennen. Unbekannte Erweiterungsdaten nur in einem definierten, nicht ausführbaren Erweiterungsbereich erhalten; kein Übernehmen fremder Auth-/Hardwarekommandos.
3. Hardwarefelder gesondert prüfen. Die C3-Pinnummer ist keine automatische S3-Verdrahtung. Falls ungültig/belegt: vor Commit einen konkreten Migrationsbericht mit alter/neuer GPIO-Zuordnung und erhaltenen logischen LED-Daten anzeigen. Eine bloße Fehlermeldung ohne Übernahmeweg reicht für den zugesagten v1-Backupimport nicht. Keinen Streifen mit ungeprüftem Pin ansteuern.
4. Wiederherstellungsbestätigung nutzen, danach das gesamte validierte Profil committen. Bei Parse-/Validierungs-/Speicherfehler bleiben alte Daten und betriebsfähige Konfiguration erhalten. Kein halber Import einzelner Felder.
5. Exkludierte Secrets auf dem neuen Gerät neu einrichten. Nach Import ausdrücklich prüfen/anzeigen, ob WLAN, Cloudzugriff und Webschutz bereit sind. Keine automatische Freigabe einer vorher geschützten Installation als „vollständig migriert“ darstellen.
6. Gerät neu starten und semantischen Vorher/Nachher-Vergleich durchführen: Mapping[128], Keys/Basisnote, Helligkeit/Offset/Reverse/RGB, Hostname, Cloud-Metadaten und alle Runs/Bestwerte. Abweichungen nur aus bewusst bestätigter Hardwareübersetzung.

Phase 1 hält das Profil zunächst schema-1-kompatibel, solange keine neuen Datenfelder nötig sind. Für späteres Schema 2: eigener versionierter Namespace/Key bzw. Migrationsjournal, vollständige v1-Sicherung **vor** Wechsel, getesteter Wiederanlauf nach Abbruch. Niemals ein v2-Schema in das einzige vom Rückfallbuild lesbare Profil schreiben. Alte Firmware kann einen unbekannten `profile.schema` heute nicht lesen und startet dann nicht regulär.

Die bestehende Backup-API bleibt erhalten. Eine zusätzliche v2-Sicherung für Quellen-, Farb-,Track- und Transportkonfiguration ist additiv zu versionieren; v1-kompatibler Export muss bekannte Daten weiterhin liefern. Weder eine Firmware-Rückkehr noch das Zurückkopieren eines alten Profilblobs garantiert automatisch den Erhalt neu hinzugekommener v2-Daten – diesen Fall durch Export-/Rollbacktests und klaren Bericht behandeln.

### 3.3 Browserdaten und Dateibesitz

Ein neuer Controller erhält oft eine andere IP; auch HTTP↔HTTPS oder ein anderer Hostname ändert den Browser-Origin. Die alten Favoriten sind dann nicht gelöscht, aber für die neue Seite unsichtbar. Gleiche DB-/localStorage-Namen allein sind kein Importweg.

Vor dem physischen Umzug braucht es einen konkret getesteten, lokal ausführbaren Export-/Importweg für Favoriten samt **vollen MIDI-Bytes**, Metadaten und den genannten UI-Präferenzen. Kandidat: versioniertes Manifest plus einzelne MIDI-Dateien/Archiv; Größe und Hash jedes Eintrags prüfen, 32 Dateien/32 MiB atomar bzw. nachvollziehbar schrittweise importieren, Kollisionen/Quota/Abbruch behandeln. Große Base64-Gesamt-JSONs vermeiden. Der Ausfuhrweg muss noch am alten Origin erreichbar sein, nötigenfalls als separat geprüfter v1-Helfer; **keine Änderung an main ohne Freigabe**. Bis dieser Weg oder ein real geprüfter gleichbleibender Origin existiert, bleibt Datenmigrationsparität offen.

Neue Hardware zunächst mit eigenem Hostnamen betreiben, wenn der C3 parallel im selben Netz bleibt. Erst nach verifiziertem Transfer aufräumen; keine Browserdatenbank löschen. Original-MIDI-Dateien und Nextcloud-Dateien werden nicht still durch quantisierte Übungsabschnitte ersetzt.

## 4. OTA-/Buildmigration und Hardwaretrennung

### Aktuelles Format und seine harten C3-Bindungen

| Ort | Zu portierende Bindung |
|---|---|
| `tools/build_update.py` | Manifest target ist fest `esp32c3`, 256-B-Header mit MD5/Größe/Version/Kind |
| `tools/platformio_update.py` | paketiert Firmware und LittleFS aus aktuellem Build; Profil-/Targetdaten müssen explizit werden |
| `data/maintenance.js` | festes C3-Ziel, Appmaximum 1.572.864 B, FS exakt 983.040 B |
| `src/MaintenanceRoutes.cpp` | `target==esp32c3`, Image-Chipkennung an Headerbytes 12/13 ist C3-ID 5, OTA-/FS-Partitionsabfragen |
| `tools/build_release.py` | C3-Targetvalidierung, C3-USB-ZIP-Name, Chipargument und feste Installationsoffsets |
| `BoardProfile.h`, `platformio.ini`, `partitions.csv`, `main.cpp` | C3-Allowlist, Flash-/USBmodus, 4-MB-Partitionen, BOOT-Pin/Konsolenannahmen |
| UI/Tests/Dokumentation | C3-Bezeichnungen, Beispiele, Paketfixtures, Größenlimits, Befehle und README-Bilder dürfen nicht als verifiziertes S3-Pinout erscheinen |

### Geplanter Sicherheitsvertrag

- Buildprofile liefern eine eindeutige Target-/Board-/Layoutkennung. Ein S3-Paket enthält `target:esp32s3`, passendes Boardprofil/Partitionslayout und eine nachvollziehbare Version. Keine C3-Binärdatei neu etikettieren.
- **Beide Richtungen prüfen:** C3 lehnt S3-Paket ab; S3 lehnt C3-Paket ab. Server prüft Manifest, tatsächlichen kompilierten Chip, Image-Chip-ID, Partitionsgrößen, Länge, Prüfsumme und Board-/Layoutverträglichkeit. Frontend prüft zusätzlich anhand echter Geräte-Capabilities, nicht als alleinige Schutzinstanz.
- Nicht ungeprüft Image-ID-Zahlen aus Internetbeispielen übernehmen: aus dem gepinnten SDK/Esptool prüfen und negative Testimages erzeugen. Paket für anderen S3-Speichertyp/Board darf nicht allein wegen gleichem Chip akzeptiert werden.
- Zwei ausreichend große App-Slots für Firmware **einschließlich** gzip-UI/DE/EN; NVS/otadata und optionale LittleFS-Samples erhalten. Für 16-MB-Flash zunächst Budget/Größen ermitteln, keine hier geratenen Offsets oder Partitionstabellen implementieren.
- Erstinstallation verwendet S3-Bootloader/Partitionsdaten/Chipargumente und passende Speichermodi. Nachweislich 16-MB-Flash und PSRAM erkennen; falsches N8-Standardprofil nicht ausliefern.
- Firmwareupdate aktiviert den neuen Slot erst nach korrekter Prüfung. Der schon vorhandene Uploader/Recoveryweg und Backup vor Update bleiben erhalten. LittleFS hat heute eine Kopie; einen möglichen FS-Verlust bei Abbruch nicht als atomar tarnen.
- MD5/Datei-SHA-256 belegen Integrität, nicht die Herkunft eines Images. Signatur/Secure-Boot-/Anti-Rollback-Entscheidungen sind gesondert zu dokumentieren; keine eFuses in dieser Migration nebenbei verändern.
- Ein Post-Boot-Rollback ist in v1 nicht eingerichtet. Vor S3-Release entweder echten Rückfall mit Boot-Bestätigung testen oder einen dokumentierten, tatsächlich ausgeführten ROM-/UART-Recoveryweg als akzeptierte Einschränkung abnehmen. `/recovery` benötigt eine noch laufende Firmware und rettet keinen beliebigen Bootcrash.

## 5. Technischer MIDI-Integrationsplan

1. Bestehende virtuelle Route und Lernregression einfrieren. `MidiEvent` additiv um Quelle/Zeit/Typ erweitern; Adapter erzeugen dieselbe Normalform, alte REST-Felder weiter akzeptieren.
2. Bounded Queue und Quellenledger mit Zeitstempeln, Source-Epoch, Overflowzähler und definiertem Panic-/Disconnect-Verhalten portabel testen. Einen Hardware-Notenstrom nicht mit einem ausgefallenen Browserheartbeat freigeben.
3. DIN-Parser als portable Zustandsmaschine; UART-Ringbuffer/Optokoppler erst danach anbinden. Running Status, Velocity 0, Realtime-Interleaving, SysEx-/Fehlerresync, wiederholte Anschläge und Kanaltrennung testen.
4. USB-Host-Spike am Zielboard: Hostport/VBUS/Debugpfad und Klassentreiber durch echte Enumeration belegen. MIDI-1.0-Deskriptor-/Paketvalidator ohne Universal-Kompatibilitätsversprechen, Hotplug und Generationen behandeln.
5. v2-UI ergänzt Quelle, Status, letzte Note/Kanal, Aktivität und klar definierte interne Latenz; DE/EN. Keine vorhandene MIDI-Konfigurationsseite entfernen. Unsupported USB-Geräte und fehlende Messwerte als solche anzeigen.
6. Freies Spiel/Chordledger mit mindestens zehn gleichzeitigen Eingängen prüfen. Danach die heutige 8er-Trainingsgrenze koordiniert in Engine, Browserparser, API-Validierung, Speicher und Tests erweitern; kein bloßes Ändern einer Konstante mit verbleibenden widersprüchlichen Limits.
7. Erst nach stabilen echten Quellen Task-/LED-Treiberoptimierung und Geräte-Transportuhr integrieren. Die genaue Verarbeitung und Zeitprotokollfelder sind in der Architektur beschrieben.

## 6. Implementierungsreihenfolge und überprüfbare Meilensteine

| Phase / Meilenstein | Konkrete Arbeiten nach Freigabe | Erforderlicher Abnahmebeleg | Nicht vorwegnehmen |
|---|---|---|---|
| P0 – Bestandsaufnahme | Diese vier Dokumente, komplette Matrix/API-/Dateninventare, Referenz-SHA, Alternativen/Risiken, Hardwarefragen und Baselineprüfung | Dokumente prüfbar; ausschließlich Dokumentationsdiff auf develop/v2 | **Hier stoppen und Freigabe abwarten** |
| P1a – Zielhardware/Toolchain | Modul/Revision/USB/VBUS und Pins prüfen; eigenes `s3_devc1_n16r8`-Environment mit verifiziertem Speicher-/USBprofil; AGENTS-S3-Regeln ausdrücklich ergänzen; Board-/SDK-ADR bestätigen | Boot-, Flash-/PSRAM-, WLAN-, Konsolen- und Minimal-LED-Protokoll; reproduzierbarer Build mit gepinnten Versionen | Keine physische S3-Eigenschaft aus C3-Test ableiten |
| P1b – Feature-/Datenport | Bestehende UI, Lernkataloge, LEDs/Effekte, Parser/Player, Quellen/Favoriten/Sprachen übernehmen; neue Package-/Backup-/Browserumzugsprüfung | Alle F01–F51 am S3 bewertet; APIs und v1-Backupmigration, Upgrade/Recovery ausgeführt; M01–M22 dokumentiert | Kein großer Core-/Audio-Rewrite vor erhaltener v1-Parität |
| P1c – Portierungsmeilenstein | Noch offene Paritätsabweichungen beheben; Framework-/Host-/RMT-Spike ggf. isoliert und danach Regression | **Sämtliche v1-Funktionen auf realem S3**, keine offenen F-Regressionen; Artefakt-/Hardwarebericht | Build allein erfüllt P1 nicht |
| P2a – gemeinsame MIDI-Schicht/DIN | Eventmodell, Quellenledger, Queue, UART-Parser, Optokoppler, Diagnose-UI | U01–U04 und H01/H02; echte zehnnotige freie Akkorde, keine hängenden Töne, Kanal-/Repeat-Tests | Keine getrennte Lernengine pro Quelle |
| P2b – USB-MIDI-Host | gewählten Hoststack integrieren, kompatible Keyboardliste, Hotplug-/Fehlerpfade | H03 mit konkretem Modell/VID/PID, Stromversorgung, WLAN und Wiederverbindung | Kein „jedes USB-MIDI geht“ |
| P3 – Echtzeit/LED/Messung | Single-Owner, geplante Tasktrennung, Dirty-Frames, RMT/DMA falls nachgewiesen; Histogramme/Stacks/Heap | U08/H04/H06, reproduzierbarer Dauerlastbericht mit P95/P99/Max/Verlusten | Keine erfundenen Laufzeitwerte/garantierten 60 FPS |
| P4a – gemeinsamer Transport | S3-Master mit Tempo-Map, Start/Stop/Pause/Resume/Seek/Rate, synchrones Audio-/LED-/Canvasprotokoll | U05/H05; Drift/Seek/Wait unter WLAN-Jitter und Browserwechsel geprüft | Kein paralleles eigenständiges Browser-Transportmodell |
| P4b – erweiterte Lernfunktionen | Spur-/Handwahl, ≥10er-Trainingsakkorde, explizite Halte-/Toleranzpolicy, Begleitspurrollen und Previewfarben; alle v1-Modi behalten | U06/U07/H05, DE/EN und kompatible Backups | Adaptive Begleitung bleibt separater Zukunftsentwurf |
| P5 – RC/Stabilisierung | vollständiger Testplan, Datenmigration, reale iOS-/Desktop-Prüfung, Stromausfall/Recovery, Langlauf, Dokumentation/Downloads | keine offenen F-Regressionen, alle Muss-Tests und Einschränkungen explizit bewertet, RC-Artefakthashes und reale S3-Logs | Kein v2.0.0-Tag vor tatsächlicher Abnahme |

Die Schritte verwenden Feature-Branches/PRs nach `develop/v2`. Änderungen am Framework, an Quelle/Queue, am LED-Treiber und am Transport sind getrennte, nachvollziehbare Änderungen. Ein temporärer C3-Buildcheck schützt gemeinsame Dateien während der Übergangsphase; eine dauerhafte parallele C3-Produktlinie wird nicht vorausgesetzt. Dokumentations-/Build-/Hardwarestatus bleibt je Commit zuordenbar.

## 7. Freigabecheckliste

**Phase 0:** Referenz verifiziert, Feature-/APIinventar vollständig, wiederverwendbare Komponenten und tatsächliche Lücken benannt, Hardwareangabe aufgenommen, Daten-/Packagebindung und SDK-Alternativen offengelegt, Prüfungen korrekt klassifiziert. Keinerlei Firmware auf den S3 oder den C3 übertragen.

**Vor Phase 1:** Nutzerfreigabe des hier vorliegenden Phase-0-Ergebnisses; konkret benötigte Hardwareunterlagen/Messzugang festhalten. Offene Boarddetails werden in P1a vor verbindlichen Pins/USB-Versorgung geklärt; sie rechtfertigen keine geratenen Treibereinstellungen.

**Vor v2.0.0:** Matrix ohne offene Regressionen, reale S3- und MIDI-/LED-/Sync-Tests bestanden, alle UI/API-/Sprach-/Bibliotheksfunktionen vorhanden, Datenmigration und OTA/Recovery tatsächlich geprüft, Messziele mit Rohdaten bewertet, bekannte Einschränkungen sichtbar und Release Candidate abgenommen. Eine Abweichung bleibt offen, bis sie behoben oder ausdrücklich als geänderter Auftrag freigegeben wird.
