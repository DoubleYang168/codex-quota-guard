"""Export a reviewed public source allowlist; never ZIP the working tree wholesale."""
import hashlib
import json
import pathlib
import subprocess
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
files = json.loads(subprocess.check_output(['node', 'scripts/check-source.mjs', '--files'], cwd=root, encoding='utf-8'))
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
archive = root / 'dist' / f'codex-quota-guard-source-{version}.zip'
archive.parent.mkdir(exist_ok=True)
prefix = f'codex-quota-guard-{version}/'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
    for relative in files:
        package.write(root / relative, prefix + relative)
with zipfile.ZipFile(archive) as package:
    assert package.testzip() is None
    assert package.namelist() == [prefix + name for name in files]
    for relative in files:
        assert package.read(prefix + relative) == (root / relative).read_bytes(), relative
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_name(archive.name + '.sha256').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
print(json.dumps({'version': version, 'archiveName': archive.name, 'files': len(files), 'sha256': checksum, 'crcAndSourceMatch': True}, indent=2))
