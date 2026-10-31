"""Embed essential web assets in each firmware build and prepare optional LittleFS."""
import runpy
from pathlib import Path

Import("env")
project = Path(env.subst("$PROJECT_DIR"))
packer = runpy.run_path(str(project / "tools/compress_languages.py"))
packer["compress"](Path(env.subst("$PROJECT_DATA_DIR")) / "i18n")
generated = Path(env.subst("$BUILD_DIR")) / "generated"
embedder = runpy.run_path(str(project / "tools/embed_web.py"))
embedder["generate"](Path(env.subst("$PROJECT_DATA_DIR")), generated / "EmbeddedWebAssets.h")
env.Append(CPPPATH=[str(generated)])
