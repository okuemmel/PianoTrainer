"""Register image packaging after PlatformIO has installed its image builders."""
import re
import runpy
from pathlib import Path

Import("env")
project = Path(env.subst("$PROJECT_DIR"))
builder = runpy.run_path(str(project / "tools/build_update.py"))["package"]
version = re.search(r'Version\[\] = "([^"]+)"', (project / "include/AppInfo.h").read_text()).group(1)
board = env.subst("$PIOENV")
def package_firmware(source, target, env):
    builder(str(target[0]), "firmware", version, board)
def package_web(source, target, env):
    builder(str(target[0]), "web", version, board)
# Package only the image just built. Never relabel a stale image on project load.
env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", package_firmware)
env.AddPostAction("$BUILD_DIR/littlefs.bin", package_web)
