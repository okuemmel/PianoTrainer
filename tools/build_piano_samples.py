"""Repack the documented FluidR3 MP3 source, without executing its JavaScript.

Usage: python3 tools/build_piano_samples.py acoustic_grand_piano-mp3.js
Source URL and attribution: data/piano-credits.txt.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import struct

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
args = parser.parse_args()
raw = args.source.read_bytes()
# Pin the source content rather than execute or trust a moving JS resource.
expected = '00eebe0214c12ff8f32c47c2f7ac92ef352800e868ab0f883b80854486ac4ca6'
if hashlib.sha256(raw).hexdigest() != expected:
    raise SystemExit('Unexpected source hash; review source and attribution before updating.')
text = raw.decode('utf-8')
start = text.index('{', text.index('MIDI.Soundfont.acoustic_grand_piano ='))
notes = json.loads(re.sub(r',\s*}', '}', text[start:text.rfind('}') + 1]))
roots = [('A0', 21)] + [
    (('C' if n % 12 == 0 else 'Gb') + str(n // 12 - 1), n)
    for n in range(24, 109, 6)
]
index, chunks, offset = [], [], 0
for name, note in roots:
    data = base64.b64decode(notes[name].split(',')[1], validate=True)
    index.append(dict(note=note, offset=offset, length=len(data)))
    chunks.append(data)
    offset += len(data)
header = json.dumps(index, separators=(',', ':')).encode()
pack = b'PTPN' + struct.pack('<I', len(header)) + header + b''.join(chunks)
output = Path(__file__).resolve().parents[1] / 'data' / 'piano-samples.bin'
output.write_bytes(pack)
print(f'{output}: {len(pack)} bytes, SHA-256 {hashlib.sha256(pack).hexdigest()}')
