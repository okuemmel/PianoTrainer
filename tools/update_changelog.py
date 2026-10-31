"""Maintain a versioned changelog from Git subjects, including the pending commit."""
import argparse
from datetime import datetime
from pathlib import Path
import re
import subprocess
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
HEADER = "# Changelog\n\nWird bei sichtbaren Änderungen im selben Commit mitgepflegt. Versionen stammen aus `include/AppInfo.h`; ältere Einträge wurden aus Git übernommen.\n"

def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=False).stdout

def version_at(commit=None):
    text = git("show", commit + ":include/AppInfo.h") if commit else (ROOT / "include/AppInfo.h").read_text(encoding="utf-8")
    match = re.search(r'Version\[\] = "([^"]+)"', text)
    return match.group(1) if match else "Frühere Versionen"

def render(groups):
    return HEADER + "".join("\n## " + version + " · " + date + "\n\n" + "".join("- " + item + "\n" for item in items) for version, date, items in groups)

def update(message_file=None):
    path = ROOT / "CHANGELOG.md"
    groups = []
    if path.exists():
        for section in re.split(r"(?m)^## ", path.read_text(encoding="utf-8"))[1:]:
            title, _, body = section.partition("\n")
            version, _, date = title.partition(" · ")
            groups.append([version, date, [line[2:] for line in body.splitlines() if line.startswith("- ")]])
    else:
        for line in git("log", "--date=short", "--format=%H%x09%ad%x09%s").splitlines():
            commit, date, subject = line.split("\t", 2)
            version = version_at(commit)
            if not groups or groups[-1][0] != version:
                groups.append([version, date, []])
            groups[-1][2].append(subject)
    if message_file:
        lines = Path(message_file).read_text(encoding="utf-8").splitlines()
        subject = next((line.strip() for line in lines if line.strip() and not line.startswith("#")), "")
        if subject and "[skip changelog]" not in subject:
            version = version_at()
            date = datetime.now(ZoneInfo("Europe/Berlin")).date().isoformat()
            if not groups or groups[0][0] != version:
                groups.insert(0, [version, date, []])
            if subject not in groups[0][2]: groups[0][2].insert(0, subject)
    content = render(groups)
    if not path.exists() or path.read_text(encoding="utf-8") != content: path.write_text(content, encoding="utf-8")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--message-file")
    update(parser.parse_args().message_file)
