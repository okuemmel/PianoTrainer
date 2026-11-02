# Phase 2 · MIDI-Vorbereitung · 2.0.0-alpha.2

Stand: 1. November 2026. Nutzerfreigabe: „dannlos“ nach Besprechung der vorgezogenen Phase-2-Vorbereitung. Aufbau auf dem noch nicht hardwareabgenommenen S3-Port aus PR #1. Das Board WROOM-1-N16R8 ist weiterhin im Zulauf. **Keine Uploads oder realen MIDI-/USB-/Latenztests durchgeführt.**

## Implementierter Umfang

| Baustein | Implementierung | Nachweis / Grenze |
|---|---|---|
| Gemeinsames Ereignis | `MidiTypes.h`: Typ, Kanal 1–16, Note/Controller, Velocity/Wert, `receivedUs:uint64`, Quelle Web/DIN/USB; bisherige Vier-Argument-Note-Aufrufe bleiben gültig | native Tests und alle bestehenden Lernengine-Tests; Eingangsstempel beim Parsen im Loop, **kein Interrupt-/Drahtzeitstempel** |
| Quellenverwaltung | `MidiRouter.h`: fester Speicher für 3 Quellen × 16 Kanäle × 128 Noten; Note-Off/Panic löscht nur den eigenen Anteil; erst erster On/letzter Off erreicht die bestehende Lernengine | Quellen-/Kanalüberschneidung, Reset, Filterwechsel, wiederholte Anschläge, zehn freie Noten, Integration mit unveränderter `TrainingEngine` |
| Byteparser | `MidiByteParser.h`: MIDI-1.0-Kanalnachrichten, Running Status, Velocity 0 als Off, CC120/123, Realtime/Active Sensing/Reset, SysEx ohne Datenablage, System-Common-Längen, fehlerhafte/unvollständige Sequenzen | 10.000 On/Off-Paare ohne zurückbleibende Noten im Hosttest; **keine Hardware-Durchsatzmessung** |
| DIN-UART | `MidiInput.h`: S3-UART1, 31.250 Baud, 8N1, 2.048-B-RX-Puffer, Ereignisqueue 8, höchstens 128 Bytes und 8 UART-Ereignisse pro Loop | S3-Compiler-/Linknachweis; elektrischer Empfang, Fehlerereignisse und Laufzeit noch offen |
| Empfangsfehler | UART-Overflow/Framing/Parity/Break: Puffer leeren, Parser und DIN-Anteil zurücksetzen; Active Sensing ab erstem FE, nach >300 ms ohne MIDI-Bytes DIN-Anteil freigeben | Parser/Router portabel getestet; UART-Fehler-/Watchdogintegration muss real geprüft werden |
| USB-Pakete | `UsbMidiProtocol.h`: begrenzte 4-Byte-USB-MIDI-1.0-Pakete, CIN-/Status-/Datenvalidierung, SysEx-Kontext, Kabel 0; andere Kabel gezählt und verworfen | native Paket-/Fehler-/SysEx-Tests; noch **nicht** an USB-Transfers angeschlossen |
| USB-Deskriptoren | Konfiguration bis 4 KiB, MIDIStreaming 1.0, Alternate 0, ein Bulk-IN-Endpunkt mit max. 64 B und einem eingebetteten MIDI-OUT-Jack; Grenzen/IDs validieren | künstliche gültige/beschädigte Deskriptoren inklusive Composite-Schnittstellen; kein Beweis für OTraki-Kompatibilität |
| Diagnose/UI | DE/EN: aktuelle Quelle, letzte Note/Kanal/Velocity/Alter, Aktivität, gehaltene Töne, Ereignis-/Filter-/Parser-/UART-/Sensingzähler; optionale USB-VID/PID und Probezustand | jsdom mit vorhandener UI/Training/Player/Backup und Sprachwechsel; kein Echtzeit-/FPS-Nachweis |

Im laufenden Produktbuild wird **eine Quelle ausgewählt**, standardmäßig Web. Die Routerlogik ist bereits für mehrere Quellen vorbereitet; gleichzeitige Hardwarequellen und Gerätegenerationen werden erst mit der USB-Empfangsintegration freigegeben. Die Lernengine bleibt quellunabhängig. Zehnnotige freie Akkorde sind im Router unterstützt; die bestehenden Übungssequenzen behalten ihr **8-Noten-Limit** bis zur geplanten gemeinsamen Erweiterung.

Doppelte Note-Ons derselben Quelle/Kanal/Note erzeugen keinen weiteren Lernanschlag. Neue Anschläge benötigen wie v1 ein zwischenzeitliches Off. Es gibt keine unbegrenzten Voice-Zähler. CC120/123 löschen den betroffenen Quellkanal; Sustain-/Sostenuto-/Ausdruckssteuerung und SysEx-Auswertung sind nicht implementiert. Andere Nachrichten werden ohne Desynchronisierung überlesen.

## Bedienung und additive API

Unter MIDI-Konfiguration kann auf S3 zwischen **Virtueller Tastatur** und **DIN · UART** umgeschaltet werden. Für DIN ist ein GPIO ausdrücklich zu wählen: nur konservative Boardkandidaten, nicht der aktuelle LED-Pin. DIN benötigt den separat geplanten Optokoppler-/3,3-V-UART-Eingang; der OTraki wird stattdessen über USB angeschlossen. Ein Eingang darf niemals direkt aus einer beliebigen 5-V-Leitung abgeleitet werden.

`POST /api/midi/input` benötigt die bestehenden Auth-/Session-/X-Trainer-Header. Beispiele:

```json
{"source":"web"}
```

```json
{"source":"din","rxPin":5}
```

GPIO 5 ist **nur ein JSON-Beispiel**, keine festgelegte Verdrahtung. Gesperrte/belegte Pins und C3-DIN werden abgelehnt. Ein erfolgreicher Wechsel lässt Noten los, pausiert eine laufende Übung und startet gegebenenfalls UART. Bei UART-Startfehler bleibt Web aktiv. Während DIN aktiv ist, blockiert die LED-Konfiguration eine Belegung desselben Pins. Nach Neustart gilt wieder Web; es wird **kein neues NVS-Schema und keine Quellenpersistenz** eingeführt. Backups, Lernfortschritt, WLAN und Passwörter behalten ihr bisheriges Format und Verhalten.

`GET /api/status` ergänzt `midi` und `usbProbe`, bestehende Felder bleiben erhalten. `midi.events` zählt normalisierte Noten-/CC-/Sensing-/Resetereignisse, nicht alle MIDI-Bytes; `dinBytes` ist der Bytezähler, `overruns` zählt UART-Fehlerereignisse und ist keine exakte Zahl verlorener Noten. `lastAgeMs` ist **Alter der letzten Note**, `activityAgeMs` Alter der letzten Eingangsaktivität; beides keine Eingabelatenz. MIDI-Diagnose pollt auf ihrer eigenen Seite alle 250 ms. Bestehende Trainings-/Wiedergabeuhren werden nicht umgebaut.

Die virtuelle `/api/midi`-Route und ihr Format bleiben bestehen. Im Webmodus entspricht sie dem bisherigen Verhalten. Im DIN-Modus werden virtuelle Noten ausdrücklich mit 409 abgelehnt; `release` befreit ausschließlich Webnoten, ein virtueller Heartbeatausfall kann dann keine Hardwarequelle loslassen oder pausieren. Explizite globale Bedienaktionen wie Pause, Stop, LED-Test und Sitzungsübernahme behalten ihre bisherigen Wartungs-/Freigaberegeln.

## USB-Stack-Entscheidung und separater Probelauf

Die gepinnte Arduino-2.0.17-/IDF-4.4.7-Installation enthält die öffentliche USB-Host-API, Header und `libusb.a` bereits. Der separate Build **`s3_usb_probe`** bindet `usb_host_install`, Clientregistrierung, Ereignisverarbeitung, Gerät öffnen/schließen und Lesen von Gerät-/Konfigurationsdeskriptoren erfolgreich ein. Daher wird vorerst **ESP-IDF Host Library + eigener schmaler MIDI-1.0-Empfangstreiber** vorbereitet; kein SDK-Wechsel und kein zweiter USB-Stack in diesem Schritt.

Alternativen: TinyUSB-Host würde einen zusätzlichen Integrations-/Controller-Nachweis benötigen; ein SDK-Wechsel beträfe auch WLAN, RMT und die gesamte Regression. Ein USB-MIDI-Device-Beispiel ersetzt keinen Host. Die [IDF-4.4.7-Dokumentation](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32s3/api-reference/peripherals/usb_host.html) bezeichnet die Host-API als beta, unterstützt in diesem Stand ein Gerät und asynchrone Transfers ohne Transfer-Timeouts. Diese Grenzen gelten auch für unseren Ansatz. Paket-/Deskriptorregeln stammen aus [USB-IF MIDI Devices 1.0](https://usb.org/sites/default/files/midi10.pdf).

Der normale S3-/C3-Build installiert **keinen Host**. Der Probe-Build deaktiviert USB-CDC beim Boot und verwendet UART0 als Konsole; dadurch bleibt der native PHY für den später explizit gestarteten Host frei. Vor einem physischen Versuch müssen USB-UART-Buchse/Debugpfad, OTG-Buchse, Hostadapter, 5-V-VBUS, Strombegrenzung und Rückspeiseschutz am tatsächlichen Board geklärt sein. Keine eFuse- oder geratenen VBUS-GPIO-Änderungen.

```sh
pio run -e s3_usb_probe
```

**Nur bauen, noch kein automatischer Upload.** Nach späterer Hardwareprüfung kann die speziell identifizierte S3-Testhardware damit über den geprüften Debugpfad bespielt werden. UART-Konsole 115200 öffnen und `U` senden: erst dann Host installieren. Ein Daemon bedient Bibliotheksereignisse; sämtliche Client-APIs/Callbacks laufen weiterhin im Arduino-Loop. Gerätekennung und eingeschränkte MIDIStreaming-Erkennung erscheinen in Serial und `usbProbe`. `midi1-candidate` bedeutet **Deskriptor erkannt**, nicht „Notenempfang funktioniert“. Disconnect schließt das geöffnete Gerätehandle; erneutes Anstecken wird zur Prüfung erneut geöffnet. Dies wurde noch nicht physisch getestet.

Der Probe-Build fordert kein Interface an und überträgt keine MIDI-Daten. Er bleibt bis zum Reset installiert. Es werden **keine `.ptupdate`-Dateien aus diesem Environment erstellt**; es gehört nicht in die normalen OTA-/Installationspakete. Die normalen `s3_n16r8`-/`c3_supermini`-Entwicklungsartefakte bleiben getrennt.

## Danach noch zu implementieren und zu prüfen

1. Board/Ports/VBUS prüfen; OTraki-Modell, VID/PID und reale Deskriptoren erfassen. Keyboard MIDI OUT → OTraki MIDI IN → geprüfter S3-Hostanschluss. Herstellerabhängige Beschriftungen kontrollieren.
2. Auf dem verifizierten Kandidaten Interface claimen, begrenzte asynchrone Bulk-IN-Transfers und Transferpuffer integrieren. Callbackdaten über begrenzte Queue an den bisherigen Owner liefern; nie Training/LEDs aus USB-Callbacks verändern.
3. Gerätegenerationen und Queue-Überlauf behandeln: verlorenes Off darf keine hängende Note erzeugen. Bei Disconnect/Error Endpoint halt/flush, ausstehende Callbacks abschließen, Interface/Transfers/Gerät freigeben, nur USB-Anteil zurücksetzen; anschließend Reconnect. Keine alten Callbacks auf neue Geräte anwenden.
4. Erst dann USB im Quellenauswahlfeld anbieten. Kabel/Alternate-Settings/MIDI-2.0 bleiben ausdrücklich eingeschränkt, bis gezielt erweitert und geprüft.
5. Reale UART-/USB-/Optokoppler-/LED-/WLAN-/Browser- und Auth-/Sessionregressionen, Active-Sensing-Ausfälle, Hotplug und Langlauf ausführen. Die offene Phase-1-Hardwareabnahme läuft parallel weiter. Messungen/Tasks/Single-Owner-Ausbau und gemeinsame musikalische Zeit bleiben Phase 3/4.

Die unten bzw. im [Testplan](V2_TEST_PLAN.md) verzeichneten Hosttests schließen keinen dieser Hardwarefälle. Phase 2 insgesamt ist **noch nicht abgeschlossen**.

## Automatisierter Prüfstand

91 Node-, 68 native (34 je Boardprofil) und 7 Python-Tests bestehen. S3-, C3- und isolierter USB-Probe-Firmwarebuild bestehen; Details/Linkergrößen im [Testplan](V2_TEST_PLAN.md). Kein Hardwarelauf und keine gemessene Latenz. Normale Entwicklungsdateien unter `dist/v2.0.0-alpha.2/{s3_n16r8,c3_supermini}/`; der Probe-Build wird dort nicht ausgeliefert.
