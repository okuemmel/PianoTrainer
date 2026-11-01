"""Collect board-specific update packages, USB images and checksums."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile
import runpy

ROOT = Path(__file__).resolve().parents[1]
profiles = runpy.run_path(str(ROOT / 'tools/update_profiles.py'))
PROFILES = profiles['PROFILES']

def build(build_dir, output, boot_app0, version, board='c3_supermini'):
    profile = PROFILES[board]
    profiles['validate_partitions']((build_dir/'partitions.bin').read_bytes(), profile)
    profiles['validate_image']((build_dir/'bootloader.bin').read_bytes(), 'firmware', profile)
    verified = []
    for kind, stem in [('firmware','firmware'),('web','littlefs')]:
        image = (build_dir / (stem + '.bin')).read_bytes()
        packed = (build_dir / (stem + '.ptupdate')).read_bytes()
        metadata = json.loads(packed[:256])
        if (metadata.get('format') != 'piano-trainer-update' or metadata.get('schema') != 1 or
            metadata.get('target') != profile['target'] or metadata.get('kind') != kind or
            metadata.get('layout') != profile['layout'] or
            metadata.get('version') != version or metadata.get('size') != len(image) or
            metadata.get('md5') != hashlib.md5(image).hexdigest() or packed[256:] != image):
            raise ValueError('Stale or invalid update package: ' + stem)
        profiles['validate_image'](image, kind, profile)
        verified.append((stem, packed))
    # Verify every input before changing a previously generated output directory.
    output.mkdir(parents=True, exist_ok=True)
    assets = []
    for stem, packed in verified:
        target = output / (stem + '.ptupdate')
        target.write_bytes(packed); assets.append(target)
    instructions = f'''# Piano Trainer {version} · {profile['label']}

Ziel/target: {profile['target']} · Layout: {profile['layout']}
Entwicklerversionen (alpha/beta) sind keine Hardware-Freigabe.
Alpha/beta builds are development versions, not hardware acceptance.

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
python3 -m esptool --chip {profile['target']} --port PORT --baud 460800 write_flash 0x0 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 firmware.bin {hex(profile['filesystem_offset'])} littlefs.bin

PORT ersetzen / replace PORT, z. B. /dev/cu.usbmodem101 oder COM5.
Die Befehle verwenden ausschließlich das oben genannte Board-Layout und schreiben die angegebenen
Partitionen. WLAN-/Geräteeinstellungen im NVS werden dabei erhalten.
Nach Neustart / after restart: MIDI-Trainer-Setup, Passwort/password piano123,
http://192.168.4.1/, ohne Webanmeldung / no web login by default.
Optional unter System aktivieren / enable under System if desired: admin / admin
(sofern Passwort nicht selbst geändert / unless password was changed).

Dokumentation/documentation: https://github.com/okuemmel/PianoTrainer
'''
    install = output / 'INSTALLATION.md'; install.write_text(instructions, encoding="utf-8"); assets.append(install)
    usb = output / f'piano-trainer-{board.replace("_", "-")}-{version}-usb.zip'
    with zipfile.ZipFile(usb,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name in ['bootloader.bin','partitions.bin','firmware.bin','littlefs.bin']:
            archive.write(build_dir/name, name)
        archive.write(boot_app0,'boot_app0.bin')
        archive.writestr('README-USB.txt',instructions)
    assets.append(usb)
    sums = output/'SHA256SUMS.txt'
    sums.write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.name+'\n' for path in assets), encoding='utf-8')
    return assets+[sums]

if __name__ == '__main__':
    version = re.search(r'Version\[\] = "([^"]+)"',(ROOT/'include/AppInfo.h').read_text()).group(1)
    parser=argparse.ArgumentParser()
    parser.add_argument('--board',choices=PROFILES,default='s3_n16r8')
    parser.add_argument('--build-dir',type=Path)
    parser.add_argument('--output',type=Path)
    core=Path(os.environ.get('PLATFORMIO_CORE_DIR',str(Path.home()/'.platformio')))
    parser.add_argument('--boot-app0',type=Path,default=core/'packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin')
    args=parser.parse_args()
    build_dir = args.build_dir or ROOT/'.pio/build'/args.board
    output = args.output or ROOT/'dist'/('v'+version)/args.board
    for path in build(build_dir,output,args.boot_app0,version,args.board): print(path)
