"""Create deterministic gzip companions; editable JSON remains the source of truth."""
import gzip
import json
from pathlib import Path


def compress(directory):
    for source in sorted(Path(directory).glob("*.json")):
        original = source.read_bytes()
        json.loads(original)
        packed = gzip.compress(original, compresslevel=9, mtime=0)
        target = source.with_suffix(".json.gz")
        if not target.exists() or target.read_bytes() != packed:
            target.write_bytes(packed)


if __name__ == "__main__":
    import sys
    compress(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "data/i18n")
