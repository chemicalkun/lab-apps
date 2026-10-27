from pathlib import Path
import plistlib, subprocess
root=Path(__file__).resolve().parents[1]
assert (root/'Resources/www/index.html').exists()
for name in ['calibration-meta.js','session.js','product-ui.js','native-export.js','figure-data.js','gpc-core.js','app.js','calibration.js','graph-export.js','plot-interaction.js','figure-renderer.js']:
    assert (root/'Resources/www'/name).is_file(), name
    subprocess.run(['node','--check',str(root/'Resources/www'/name)],check=True)
with (root/'Info.plist').open('rb') as f:
    info=plistlib.load(f)
assert info['CFBundleExecutable']=='GPCMacAnalyzer'
assert info['CFBundleIdentifier']=='jp.gpcmac.analyzer.native'
assert info['CFBundleName']==info['CFBundleDisplayName']=='Chromato BRO'
assert info['CFBundleIconFile']=='AppIcon'
assert (root/'build-macos.command').stat().st_mode & 0o100
subprocess.run(['bash','-n',str(root/'build-macos.command')],check=True)
subprocess.run(['swiftc','-frontend','-parse',str(root/'Sources/GPCMacAnalyzer.swift')],check=True)
print('PASS: macOS bundle manifest, JS dependencies, script syntax, Swift parser')

# When a built app exists, verify the delivered bundle, not just source syntax.
app=root.parent/'Chromato BRO.app'
if app.exists():
    with (app/'Contents/Info.plist').open('rb') as f:
        built=plistlib.load(f)
    assert built == info, 'Rebuild after changing Info.plist'
    for source in (root/'Resources').rglob('*'):
        if source.is_file() and source.name != ".DS_Store":
            assert source.read_bytes() == (app/'Contents/Resources'/source.relative_to(root/'Resources')).read_bytes(), f'Stale bundled resource: {source}'
    executable=app/'Contents/MacOS'/info['CFBundleExecutable']
    assert executable.stat().st_mode & 0o111
    architecture=subprocess.check_output(['lipo','-archs',str(executable)],text=True).strip()
    assert architecture == 'arm64', architecture
    subprocess.run(['codesign','--verify','--deep',str(app)],check=True)
    links=subprocess.check_output(['otool','-L',str(executable)],text=True)
    assert 'WebKit.framework' in links and 'AppKit.framework' in links
    assert 'Chrome' not in links and 'Chromium' not in links
    print('PASS: delivered arm64 app, exact resource copies, ad-hoc signature, AppKit/WebKit linkage')

    # Verify the portable archive with strict metadata checks after extraction.
    import tempfile
    with tempfile.TemporaryDirectory(prefix='gpc-archive-',dir='/private/tmp') as temp:
        subprocess.run(['ditto','-x','-k',str(root.parent/f"Chromato BRO Mac ver{info['CFBundleShortVersionString']}.zip"),temp],check=True)
        restored=Path(temp)/'Chromato BRO.app'
        subprocess.run(['codesign','--verify','--deep','--strict',str(restored)],check=True)
        assert (restored/'Contents/MacOS/GPCMacAnalyzer').read_bytes()==executable.read_bytes()
    print('PASS: portable ZIP archive restores a strictly verified signed app')

if app.exists():
    import struct
    icon=(app/'Contents/Resources/AppIcon.icns').read_bytes()
    assert icon[:4]==b'icns' and struct.unpack('>I',icon[4:8])[0]==len(icon)
    assert (app/'Contents/Resources/AppIcon.png').read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
    for f in app.rglob('*'):
        if f.is_file():
            assert f.name != '.DS_Store', 'Finder metadata in release bundle'
            assert f.suffix not in ['.swift','.py','.command','.crm','.anl'], f'Unnecessary release file: {f}'
            data=f.read_bytes()
            assert b'/Users/fukuyamashouta/' not in data and b'/private/tmp/gpc-build.' not in data, f'Build path leaked: {f}'
    print('PASS: product name, icon container, no developer paths or test/source files in release bundle')
