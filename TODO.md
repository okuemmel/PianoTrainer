# Umsetzungsstand und offene Prüfungen

Stand: 31. Oktober 2026. Nextcloud- und MIDIsss-Import sind ab Firmware 1.6.0 implementiert; Firmware 1.7.0 ergänzt MIDICollection, Wiedergabe-LEDs und die kompakte Mobilansicht. Die folgenden Punkte unterscheiden Implementierung und noch offene manuelle Prüfungen.

## Nextcloud: MIDI-Verzeichnis lesen und importieren

- [x] Unter Einstellungen ein festes Nextcloud-MIDI-Verzeichnis hinterlegen (Adresse/Ordner und erforderlicher Zugriff).
- [x] Zugriffsweg festlegen und prüfen: angemeldeter WebDAV-Zugriff oder freigegebener Ordner.
- [x] Die im hinterlegten Verzeichnis enthaltenen `.mid`/`.midi`-Dateien automatisch in der MIDI-Auswahlliste anzeigen.
- [x] Die Liste beim Öffnen laden und über „Aktualisieren“ erneut einlesen. Keine manuelle Verzeichnisauswahl pro Import.
- [x] Ausgewählte Datei herunterladen und in den bestehenden MIDI-Importer übernehmen.
- [x] Kanalwahl, Transposition, Tastaturfilter und Abschnittsauswahl weiterverwenden.
- [x] Ladezustand, leere Ordner und Verbindungs-/Anmeldefehler anzeigen.

Die eigene Nextcloud-Adresse, WebDAV-Verzeichnisadresse und Zugangsdaten werden jetzt in den Import-Einstellungen eingegeben. Die Einrichtung einer konkreten Nutzer-Nextcloud ist noch manuell zu prüfen; der WebDAV-Weg wurde am C3 mit einem authentifizierten Testserver geprüft. Zugangsdaten gehören nicht ins Git-Repository.

## MIDIsss: MIDI-Suche und Import

- [x] Suchfeld und Ergebnisliste im Training ergänzen.
- [x] Suche über `GET https://midisss.com/api.php?action=search&q={Suchbegriff}` anbinden; Suchbegriff URL-kodieren.
- [x] Ergebnisse mit ID, Namen, Beschreibung (`notes`) und Bewertung (`average_rating`) darstellen.
- [x] Gewählte MIDI-Datei über `GET https://midisss.com/api.php?action=get_midi&id={ID}` laden.
- [x] Binärdaten in denselben MIDI-Importer wie lokale Dateien und Nextcloud-Dateien geben.
- [x] Keine Treffer, API-Fehler und fehlende Dateien verständlich behandeln; Suchanfragen verzögern und parallele Anfragen begrenzen.

Quelle: [MIDIsss API-Dokumentation](https://midisss.com/api_explain.php), am 31. Oktober 2026 gelesen. Die echte HTTPS-Suche und ein MIDI-Download wurden am C3 getestet; die Oberfläche wurde zusätzlich per jsdom mit echter Geräte-API bis zum Start der importierten Übung durchlaufen.

## Gemeinsame Umsetzung und Prüfung

- [x] Browserzugriff vom lokalen Trainer aus prüfen, insbesondere CORS und Authentifizierung; bei Bedarf einen passenden Vermittlungsweg festlegen.
- [x] Verbindung aus dem normalen WLAN prüfen; externen Import ohne Internetverbindung verständlich behandeln.
- [x] Dateigröße und MIDI-Inhalt vor der Übernahme mit den bestehenden Importgrenzen prüfen.
- [x] Große Dateien weiter im Browser verarbeiten und nur den gewählten Trainingsabschnitt an den C3 senden.
- [ ] Alle drei Quellen auf iPhone/iPad mit Notenvorschau, hörbarer Audioausgabe und LED-Anzeige prüfen.
- [ ] Eigene Nextcloud-Installation einschließlich öffentlicher Freigabe / privater CA prüfen.

Die Anbindung wurde auf dem vorhandenen C3 geprüft; ein S3 ist für diese Importfunktionen nicht erforderlich.

## Weitere umgesetzte Wünsche

- [x] README benennt Vibe Coding und den Lernzweck mit aufgeklebter LED-Leiste.
- [x] LED-Konfiguration und Tests auf einer kompakteren Seite zusammenführen.
- [x] MIDI-Dateien über den Browser anhören, pausieren und stoppen.
- [x] Aufbau- und Anschlussbilder für GitHub ergänzen und Bildgenerierung dokumentieren.

- [x] MIDICollection-Suche mit Seitenwechsel, Import und Anhören.
- [x] Anhörfunktion neben Übungsstart; echte und virtuelle LEDs zeigen klingende Noten ohne Trainingswertung.
- [x] Handy-/Tablet-Layout: Navigation standardmäßig eingeklappt, aufklappbare Optionen und Importbereiche.

- [x] Kompakten lokalen Sample-Klavierklang für Player und virtuelle Tasten ergänzen (Firmware 1.7.1), mit Synthesizer als Rückfall.

- [x] GitHub-Link, Urheberangabe und aktuelle Firmware-Version in Fußzeile/Systeminformationen (1.8.0).
- [x] Mitlaufende, ausblendbare Notenvorschau beim Anhören vollständiger MIDI-Dateien.
- [x] 20 aufeinander aufbauende Lektionen mit Lernzielen, Empfehlungen, Sternen und dauerhaftem Lernfortschritt auf dem Trainer (1.9.0).
- [x] Tastaturprofile für 61, 76 und 88 Tasten neben 49 Tasten und individuellen Bereichen; passende virtuelle Tastatur, LED-Zuordnung und Lektionen.
- [x] Deutsch/Englisch zur Laufzeit umschalten; lokale JSON-Sprachdateien mit erweiterbarer Sprachliste, gespeicherter Browserpräferenz und übersetzten Lektionen (1.10.0).
- [x] Firmware und Weboberfläche per geprüftem lokalen Updatepaket aktualisieren (1.11.0).
- [x] Backup und validierte Wiederherstellung der Geräteeinstellungen und Lektionsergebnisse ohne Passwortexport.
- [x] Versioniertes Changelog anlegen und die laufende Pflege über Projektregeln und Hilfsskript verankern.
