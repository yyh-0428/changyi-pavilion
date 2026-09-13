"""Create and read back a complete, reproducible project handoff (stdlib only)."""
from pathlib import Path
import hashlib
import json
import os
import zipfile

root = Path(__file__).resolve().parents[1]
output = root.parent / 'changyi-pavilion-v12.zip'
manifest_path = root / 'docs/PACKAGE_MANIFEST.json'
executables = {'Start-Mac.command', 'Stop-Mac.command', 'scripts/mac/node.sh'}
root_files = [
    'README.md', 'UPGRADE_NOTES.md', 'MAC_QUICKSTART.md', 'LICENSE',
    'package.json', 'package-lock.json', 'index.html', 'vite.config.js',
    'Start-Mac.command', 'Stop-Mac.command', '.gitignore',
]
files = [root / name for name in root_files if (root / name).is_file()]
for folder in ['src', 'public', 'dist', 'tests', 'scripts', 'docs', 'previews', '.github']:
    for path in (root / folder).rglob('*'):
        if not path.is_file() or path.is_symlink() or path == manifest_path:
            continue
        if '__pycache__' in path.parts or path.suffix.lower() in {'.pyc', '.tmp', '.log', '.glb', '.gltf'}:
            continue
        if folder == 'previews' and path.suffix not in {'.jpg', '.mp4', '.md'}:
            continue
        files.append(path)
files = sorted(set(files), key=lambda path: path.relative_to(root).as_posix())

manifest = {
    'revision': '12',
    'excluded': ['node_modules', 'all GLB and glTF files', 'full-resolution PNG previews'],
    'files': [{
        'path': path.relative_to(root).as_posix(),
        'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'mode': '0755' if path.relative_to(root).as_posix() in executables else '0644',
    } for path in files],
}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
files.append(manifest_path)
temporary = output.with_suffix('.zip.tmp')
with temporary.open('wb') as handle:
    with zipfile.ZipFile(handle, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            relative = path.relative_to(root).as_posix()
            info = zipfile.ZipInfo('changyi-pavilion/' + relative)
            info.create_system = 3
            info.date_time = (2026, 9, 13, 12, 0, 0)
            info.external_attr = (0o100755 if relative in executables else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes(), compresslevel=9)
    handle.flush()
    os.fsync(handle.fileno())

with zipfile.ZipFile(temporary) as archive:
    assert archive.testzip() is None
    required = {'src/model.js', 'src/fish-school.js', 'src/fish-worker.js', 'src/fish-simulation.js', 'src/fish-geometry.js', 'src/fish-material.js', 'src/main.js', 'dist/index.html',
                'previews/fish-swimming-v9.jpg', 'previews/fish-swimming-v9.mp4', 'docs/FISH_ARCHITECTURE.md', 'docs/PAVILION_V10.md', 'docs/PAVILION_AUDIT_V10.json', 'docs/SHADER_AUDIT_V10.json',
                'src/meadow-layout.js', 'tests/detail-v12.test.mjs', 'docs/DETAIL_FIX_V12.md', 'docs/DETAIL_AUDIT_V12.json', 'docs/SHADER_AUDIT_V12.json',
                'previews/railing-outside-v12.jpg', 'previews/railing-inside-v12.jpg', 'previews/grass-bank-v12.jpg', 'previews/grass-island-v12.jpg', 'previews/fish-swimming-v12.jpg',
                'src/render-pipeline.js', 'docs/PERFORMANCE_V11.md', 'docs/PERFORMANCE_AUDIT_V11.json', 'docs/SHADER_AUDIT_V11.json'} | executables
    assert required <= {name.removeprefix('changyi-pavilion/') for name in archive.namelist()}
    assert not any(name.lower().endswith(('.glb', '.gltf')) for name in archive.namelist())
    for item in manifest['files']:
        name = 'changyi-pavilion/' + item['path']
        data = archive.read(name)
        assert len(data) == item['bytes']
        assert hashlib.sha256(data).hexdigest() == item['sha256']
        assert (archive.getinfo(name).external_attr >> 16) & 0o777 == int(item['mode'], 8)
os.replace(temporary, output)
print(json.dumps({'file': str(output), 'files': len(files), 'bytes': output.stat().st_size,
                  'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'verified': True}, indent=2))
