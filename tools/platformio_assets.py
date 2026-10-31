"""Prepare local compressed catalogs before PlatformIO builds LittleFS."""
import runpy
from pathlib import Path

Import("env")
project = Path(env.subst("$PROJECT_DIR"))
packer = runpy.run_path(str(project / "tools/compress_languages.py"))
packer["compress"](Path(env.subst("$PROJECT_DATA_DIR")) / "i18n")
