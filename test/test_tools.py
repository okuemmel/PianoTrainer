import hashlib
import gzip
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tools' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class BuildTools(unittest.TestCase):
    def test_embedded_assets_roundtrip_and_rebuild_without_optional_samples(self):
        embedder = load('embed_web')
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); data = root / 'data'; data.mkdir()
            (data / 'i18n').mkdir()
            (data / 'index.html').write_bytes(b'<html>Trainer</html>')
            (data / 'i18n/fr.json').write_bytes(b'{"language":"fr"}')
            (data / 'i18n/fr.json.gz').write_bytes(b'ignored companion')
            (data / 'piano-samples.bin').write_bytes(b'optional samples')
            output = root / 'generated/EmbeddedWebAssets.h'
            entries = embedder.generate(data, output)
            self.assertEqual({path for path, _ in entries}, {'/index.html', '/i18n/fr.json'})
            for path, compressed in entries:
                self.assertEqual(gzip.decompress(compressed), (data / path[1:]).read_bytes())
            first = output.read_bytes(); timestamp = output.stat().st_mtime_ns
            embedder.generate(data, output)
            self.assertEqual(first, output.read_bytes())
            self.assertEqual(timestamp, output.stat().st_mtime_ns)
            (data / 'index.html').write_bytes(b'<html>Updated trainer</html>')
            updated = dict(embedder.generate(data, output))
            self.assertNotEqual(first, output.read_bytes())
            self.assertEqual(gzip.decompress(updated['/index.html']), b'<html>Updated trainer</html>')
            actual = dict(embedder.assets(ROOT / 'data'))
            self.assertIn('/maintenance.js', actual)
            self.assertIn('/i18n/en.json', actual)
            self.assertNotIn('/piano-samples.bin', actual)

    def test_package_tracks_payload_size_and_checksum(self):
        packer = load('build_update')
        with tempfile.TemporaryDirectory() as folder:
            image = Path(folder) / 'firmware.bin'
            for content in [b'first image', b'rebuilt image']:
                image.write_bytes(content)
                packed = packer.package(image, 'firmware', '1.11.0').read_bytes()
                metadata = json.loads(packed[:256])
                self.assertEqual(packed[256:], content)
                self.assertEqual(metadata['size'], len(content))
                self.assertEqual(metadata['md5'], hashlib.md5(content).hexdigest())
                self.assertEqual(metadata['target'], 'esp32c3')

    def test_release_contains_only_installation_images_and_matching_checksums(self):
        packer = load('build_update'); release = load('build_release')
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); images = root/'build'; images.mkdir()
            for name in ['firmware','littlefs','bootloader','partitions']:
                (images/(name+'.bin')).write_bytes((name+' image').encode())
            boot = root/'boot_app0.bin'; boot.write_bytes(b'ota initialization')
            for kind,stem in [('firmware','firmware'),('web','littlefs')]:
                packer.package(images/(stem+'.bin'),kind,'1.11.0')
            output=root/'release'; files=release.build(images,output,boot,'1.11.0')
            self.assertEqual(len(files),5)
            for line in (output/'SHA256SUMS.txt').read_text().splitlines():
                checksum,name=line.split('  ',1)
                self.assertEqual(checksum,hashlib.sha256((output/name).read_bytes()).hexdigest())
            with zipfile.ZipFile(next(output.glob('*.zip'))) as archive:
                self.assertEqual(set(archive.namelist()),{'firmware.bin','littlefs.bin','bootloader.bin','partitions.bin','boot_app0.bin','README-USB.txt'})
                self.assertEqual(archive.read('firmware.bin'),(images/'firmware.bin').read_bytes())
            (images/'firmware.bin').write_bytes(b'changed after packaging')
            with self.assertRaisesRegex(ValueError,'Stale'):
                release.build(images,output,boot,'1.11.0')

    def test_changelog_bootstraps_history_and_records_final_commit_subject_once(self):
        changelog = load('update_changelog')
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); changelog.ROOT = root
            def git(*args):
                subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)
            git('init')
            (root / 'include').mkdir()
            info = root / 'include/AppInfo.h'
            info.write_text('inline constexpr char Version[] = "1.10.0";')
            git('add', '.')
            git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','Initial UI')
            changelog.update()
            self.assertIn('## 1.10.0', (root/'CHANGELOG.md').read_text())
            info.write_text('inline constexpr char Version[] = "1.11.0";')
            message=root/'COMMIT_MSG'; message.write_text('Add updates and restore\n\nDetailed body\n')
            changelog.update(message)
            first=(root/'CHANGELOG.md').read_text();changelog.update(message)
            self.assertEqual(first,(root/'CHANGELOG.md').read_text())
            self.assertEqual(first.count('- Add updates and restore'),1)
            self.assertIn('## 1.11.0',first)
            self.assertIn('- Initial UI',first)

if __name__ == '__main__':
    unittest.main()
