# Geplante Erweiterungen

Stand: 31. Oktober 2026. Die folgenden Importquellen sind geplant und noch nicht implementiert.

## Nextcloud: MIDI-Verzeichnis lesen und importieren

- [ ] Unter Einstellungen ein festes Nextcloud-MIDI-Verzeichnis hinterlegen (Adresse/Ordner und erforderlicher Zugriff).
- [ ] Zugriffsweg festlegen und prüfen: angemeldeter WebDAV-Zugriff oder freigegebener Ordner.
- [ ] Die im hinterlegten Verzeichnis enthaltenen `.mid`/`.midi`-Dateien automatisch in der MIDI-Auswahlliste anzeigen.
- [ ] Die Liste beim Öffnen laden und über „Aktualisieren“ erneut einlesen. Keine manuelle Verzeichnisauswahl pro Import.
- [ ] Ausgewählte Datei herunterladen und in den bestehenden MIDI-Importer übernehmen.
- [ ] Kanalwahl, Transposition, Tastaturfilter und Abschnittsauswahl weiterverwenden.
- [ ] Ladezustand, leere Ordner und Verbindungs-/Anmeldefehler anzeigen.

Für die Umsetzung fehlen noch die konkrete Nextcloud-Adresse, der Ordnerpfad und die gewünschte Zugriffsart. Zugangsdaten gehören nicht in den Quelltext oder ins Git-Repository.

## MIDIsss: MIDI-Suche und Import

- [ ] Suchfeld und Ergebnisliste im Training ergänzen.
- [ ] Suche über `GET https://midisss.com/api.php?action=search&q={Suchbegriff}` anbinden; Suchbegriff URL-kodieren.
- [ ] Ergebnisse mit ID, Namen, Beschreibung (`notes`) und Bewertung (`average_rating`) darstellen.
- [ ] Gewählte MIDI-Datei über `GET https://midisss.com/api.php?action=get_midi&id={ID}` laden.
- [ ] Binärdaten in denselben MIDI-Importer wie lokale Dateien und Nextcloud-Dateien geben.
- [ ] Keine Treffer, API-Fehler und fehlende Dateien verständlich behandeln; Suchanfragen verzögern und parallele Anfragen begrenzen.

Quelle: [MIDIsss API-Dokumentation](https://midisss.com/api_explain.php), am 31. Oktober 2026 gelesen. Such- und Download-Endpunkte sind dokumentiert; die tatsächlichen API-Antworten und die Browseranbindung wurden noch nicht getestet.

## Gemeinsame Umsetzung und Prüfung

- [ ] Browserzugriff vom lokalen Trainer aus prüfen, insbesondere CORS und Authentifizierung; bei Bedarf einen passenden Vermittlungsweg festlegen.
- [ ] Verbindung aus dem normalen WLAN prüfen; externen Import ohne Internetverbindung verständlich behandeln.
- [ ] Dateigröße und MIDI-Inhalt vor der Übernahme mit den bestehenden Importgrenzen prüfen.
- [ ] Große Dateien weiter im Browser verarbeiten und nur den gewählten Trainingsabschnitt an den C3 senden.
- [ ] Beide Quellen auf iPhone/iPad mit Notenvorschau und LED-Anzeige prüfen.

Ein Wechsel auf den S3 ist hierfür zunächst keine Voraussetzung; die Anbindung und der Ressourcenbedarf sollen zuerst mit dem vorhandenen C3 geprüft werden.
