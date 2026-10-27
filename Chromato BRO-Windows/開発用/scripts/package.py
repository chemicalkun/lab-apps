from pathlib import Path
import shutil,zipfile,hashlib,json,struct,xml.etree.ElementTree as ET,os,argparse,sys
parser=argparse.ArgumentParser();parser.add_argument('--distribution-zip',action='store_true');args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
out=root/'build/Chromato BRO Windows'
for name in ['README.md','WINDOWS_CHECKLIST.md','VALIDATION.md','はじめに.txt','UPDATES.md','インストール手順.txt']:
 shutil.copy2(root/name,out/name)
exe=(out/'Chromato BRO.exe').read_bytes()
assert exe[:2]==b'MZ'
pe=struct.unpack_from('<I',exe,0x3c)[0]
assert exe[pe:pe+4]==b'PE\0\0' and struct.unpack_from('<H',exe,pe+4)[0]==0x8664
for name in ['coreclr.dll','hostfxr.dll','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','www/index.html','www/windows-bridge.js']:
 assert (out/name).is_file(),name
assert list(out.rglob('WebView2Loader.dll'))
manifest=json.loads((root/'MAC_SOURCE_BASELINE.json').read_text())
for name in ['title-text.js','calibration-library.js','gpc-core.js','figure-data.js','figure-renderer.js','calibration.js','calibration-meta.js','app.js','graph-export.js','session.js','page-order.js']:
 p='Resources/www/'+name
 shared=(root/p).read_bytes()
 if name=='graph-export.js':shared=shared.replace(b'Ctrl+V','⌘V'.encode())
 assert hashlib.sha256(shared).hexdigest()==manifest[p],name
 assert (root/p).read_bytes()==(out/'www'/name).read_bytes(),name
assert not list(out.rglob('*.pdb'))
version=ET.parse(root/'src/GPCAnalyzer.csproj').findtext('.//Version')
build=int(ET.parse(root/'src/GPCAnalyzer.csproj').findtext('.//FileVersion').split('.')[-1])
(out/'release-info.json').write_text(json.dumps({'version':version,'build':build}))
assert version and len(version.split('.'))==3
if not args.distribution_zip:
 print('PASS: Windows runtime validated; manual distribution ZIP preserved');sys.exit(0)
zip_path=root.parent/f'Chromato BRO Windows ver{version}.zip'
temp_path=zip_path.with_suffix('.zip.tmp')
with zipfile.ZipFile(temp_path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in sorted(out.rglob('*')):
  if f.is_file() and f.name!='.DS_Store':z.write(f,f.relative_to(out.parent))
with zipfile.ZipFile(temp_path) as z:assert z.testzip() is None
os.replace(temp_path,zip_path)
for folder in [root.parent,root/'build']:
 for old in folder.glob('Chromato BRO*.zip'):
  if old!=zip_path:old.unlink()
(root/'build/SHA256SUMS.txt').write_text(hashlib.sha256(zip_path.read_bytes()).hexdigest()+'  '+zip_path.name+'\n')
print('PASS: PE x64, bundled .NET/WebView2 loader, unchanged Mac numerical/UI engines, exact package assets, no PDB, ZIP CRC')
print('ZIP bytes:',zip_path.stat().st_size)
