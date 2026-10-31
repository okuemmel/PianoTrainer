"""Wrap a PlatformIO image with a bounded, checked C3 update manifest."""
import hashlib
import json
from pathlib import Path


def package(source, kind, version):
    source = Path(source)
    data = source.read_bytes()
    metadata = {"format": "piano-trainer-update", "schema": 1, "target": "esp32c3",
                "kind": kind, "size": len(data), "md5": hashlib.md5(data).hexdigest(), "version": version}
    header = json.dumps(metadata, separators=(",", ":")).encode()
    if len(header) > 255:
        raise ValueError("Update manifest exceeds 256 bytes")
    target = source.with_suffix(".ptupdate")
    target.write_bytes(header.ljust(255, b" ") + b"\n" + data)
    return target


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=["firmware", "web"])
    parser.add_argument("image")
    parser.add_argument("--version", default="local")
    args = parser.parse_args()
    print(package(args.image, args.kind, args.version))
