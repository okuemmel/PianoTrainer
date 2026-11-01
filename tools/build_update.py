"""Wrap a PlatformIO image with a bounded, board-specific update manifest."""
import hashlib
import json
from pathlib import Path
import runpy

profiles = runpy.run_path(str(Path(__file__).with_name("update_profiles.py")))
PROFILES = profiles["PROFILES"]


def package(source, kind, version, board="c3_supermini"):
    source = Path(source)
    data = source.read_bytes()
    profile = PROFILES[board]
    profiles["validate_image"](data, kind, profile)
    metadata = {"format": "piano-trainer-update", "schema": 1, "target": profile["target"],
                "layout": profile["layout"],
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
    parser.add_argument("--board", choices=PROFILES, default="c3_supermini")
    args = parser.parse_args()
    print(package(args.image, args.kind, args.version, args.board))
