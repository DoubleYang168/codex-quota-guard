"""Verify the staged release and ZIP using Python's standard library."""
import hashlib
import json
import pathlib
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
release = json.loads((root / 'dist' / 'latest.json').read_text(encoding='utf-8'))
archive = pathlib.Path(release['archive'])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == release['sha256']
assert archive.with_name(archive.name + '.sha256').read_text(encoding='utf-8').strip() == f"{release['sha256']}  {archive.name}"
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    assert len(package.namelist()) == release['files']
    checksums = json.loads(package.read('quota-guard/SHA256SUMS.json'))
    assert set(package.namelist()) == {'quota-guard/' + name for name in checksums} | {'quota-guard/SHA256SUMS.json'}
    assert all(not any(part in {'.runtime', '.git', 'research', 'node_modules', 'scripts', 'test'} for part in pathlib.PurePosixPath(name).parts) for name in checksums)
    assert all(pathlib.PurePosixPath(name).is_absolute() is False and '..' not in pathlib.PurePosixPath(name).parts for name in checksums)
    for relative, checksum in checksums.items():
        data = package.read('quota-guard/' + relative)
        assert hashlib.sha256(data).hexdigest() == checksum, relative
        assert hashlib.sha256((root / relative).read_bytes()).hexdigest() == checksum, relative
assert 'web/index.html' in checksums
assert 'runtime-home.json' not in checksums
print(json.dumps({'version': release['version'], 'files': release['files'], 'sha256': release['sha256'], 'zipAndSourceMatch': True}, indent=2))
