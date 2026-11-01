"""Render the vector brand mark for browser and iPhone icons (requires librsvg and Pillow)."""
from pathlib import Path
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

if __name__ == "__main__":
    png = DATA / "apple-touch-icon.png"
    subprocess.run(["rsvg-convert", "-w", "180", "-h", "180",
                    "-o", str(png), str(DATA / "logo.svg")], check=True)
    with Image.open(png) as source:
        source.save(DATA / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print("Generated apple-touch-icon.png and favicon.ico from data/logo.svg")
