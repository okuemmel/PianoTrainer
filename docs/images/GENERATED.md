# Abbildungen für GitHub

Die PNG-Dateien sind mit dem eingebauten Imagegen-Werkzeug erzeugte Illustrationen, keine Fotos eines getesteten Aufbaus. Die Telefonansicht ist symbolisch und kein Screenshot der Anwendung. Die verbindlichen Anschlüsse stehen im separat gezeichneten SVG-Funktionsschema und in der README-Tabelle.

- `keyboard-setup.png`: Übersicht mit am Keyboard befestigter LED-Leiste.
- `strip-mounting.png`: Nahansicht der Befestigung auf dem festen Gehäuseteil.
- `wiring.svg`: im Repository gezeichnetes Funktionsschema; GPIO 4 → 74AHCT125 → 330 Ω → DIN, externe 5-V-Versorgung und gemeinsame Masse. Keine maßstabsgetreue Platinen-Pinbelegung.

## Bildgenerierung

Werkzeug: eingebautes `image_gen`, kein CLI-Fallback. Die ursprünglichen Dateien liegen zusätzlich im lokalen Imagegen-Ausgabeverzeichnis; die für GitHub verwendeten Kopien sind hier im Repository enthalten.

### Prompt 1 · Aufbauübersicht

Use case: product-mockup. Asset type: GitHub README illustration, wide landscape, 1536x1024 composition. Primary request: clearly show a DIY MIDI LED piano learning trainer mounted on a real-looking unbranded electronic keyboard. A removable addressable LED strip is attached flat along the stationary rear lip immediately above the black and white keys, never on the moving key surfaces. Several green and blue LEDs indicate a few keys to learn. Include a tiny ESP32-C3 SuperMini controller in a separate simple enclosure beside the keyboard, one small 5V power adapter cable and a smartphone showing an abstract piano-note practice screen without readable text. Style: clean, polished educational isometric product illustration, realistic construction, dark neutral background with soft light, clear separation of components, uncluttered. The complete setup and the way the strip sits just above the keys must be easy to understand. This is an illustrative concept, not a circuit schematic. No logos, no brand names, no text, no people, no watermarks. Preserve a realistic alternating piano key pattern in groups of two and three black keys.

### Prompt 2 · Befestigungsdetail

Use case: scientific-educational. Asset type: GitHub README close-up assembly illustration, wide landscape. Primary request: demonstrate how an LED learning strip is temporarily attached to the fixed upper lip of an unbranded piano/keyboard, immediately behind the keys. Close oblique top view of about two octaves of correctly patterned black and white piano keys; show a short addressable LED strip parallel to the row of keys, its adhesive backing partly peeled off at one end and a small protective removable tape layer between the strip and the keyboard housing. A subtle inset close-up shows one green LED above a white key and one blue LED above a neighboring key as cues; not every physical LED needs to be assigned a key, unlit LEDs can remain between cues. Keep all parts off the moving keys and leave the full key travel unobstructed. Clean technical product illustration with soft realistic materials, matching a dark neutral DIY electronics documentation style. No circuit wiring details, no labels, no text, no logos, no watermark. This is an illustrative mounting concept, not a measured drawing.
