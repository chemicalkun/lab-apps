#!/usr/bin/env python3
"""Build a standard macOS Installer package without installing it."""
import plistlib, subprocess, tempfile, shutil, xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def run(*args): subprocess.run([str(x) for x in args],check=True)
def main():
 app=ROOT.parent/'Chromato BRO.app'
 info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
 version=info['CFBundleShortVersionString']
 output=ROOT.parent/f'Chromato BRO Mac ver{version}.pkg'
 with tempfile.TemporaryDirectory(prefix='ChromatoBRO-pkg-') as tmp:
  tmp=Path(tmp);payload=tmp/'payload';target=payload/'Applications/Chromato BRO.app';target.parent.mkdir(parents=True)
  run('ditto','--noextattr',app,target)
  run('xattr','-cr',target)
  run('codesign','--verify','--deep','--strict',target)
  components=tmp/'components.plist';run('pkgbuild','--analyze','--root',payload,components)
  data=plistlib.loads(components.read_bytes())
  for item in data:
   item.update(BundleIsRelocatable=False,BundleIsVersionChecked=True,BundleHasStrictIdentifier=True,BundleOverwriteAction='upgrade')
  components.write_bytes(plistlib.dumps(data))
  scripts=tmp/'scripts';scripts.mkdir()
  pre=scripts/'preinstall'
  pre.write_text('''#!/bin/bash
set -eu
if /usr/bin/pgrep -x GPCMacAnalyzer >/dev/null; then
 echo "Chromato BROを終了してからインストールしてください。" >&2
 exit 1
fi
app="${3%/}/Applications/Chromato BRO.app"
if [ -L "$app" ]; then echo "インストール先がシンボリックリンクです。" >&2; exit 1; fi
if [ -e "$app" ]; then
 id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")
 [ "$id" = "jp.gpcmac.analyzer.native" ] || exit 1
fi
exit 0
''');pre.chmod(0o755)
  component=tmp/'component.pkg'
  run('pkgbuild','--root',payload,'--component-plist',components,'--install-location','/','--identifier','jp.gpcmac.analyzer.native.pkg','--version',version,'--scripts',scripts,component)
  requirements=tmp/'requirements.plist';requirements.write_bytes(plistlib.dumps({'arch':['arm64'],'os':['12.3']}))
  distribution=tmp/'Distribution.xml'
  run('productbuild','--synthesize','--product',requirements,'--package',component,distribution)
  tree=ET.parse(distribution);root=tree.getroot()
  ET.SubElement(root,'title').text='Chromato BRO'
  ET.SubElement(root,'domains',enable_localSystem='true',enable_currentUserHome='false',enable_anywhere='false')
  ref=ET.SubElement(root,'pkg-ref',id='jp.gpcmac.analyzer.native.pkg');ET.SubElement(ET.SubElement(ref,'must-close'),'app',id='jp.gpcmac.analyzer.native')
  tree.write(distribution,encoding='utf-8',xml_declaration=True)
  result=tmp/'result.pkg';run('productbuild','--distribution',distribution,'--package-path',tmp,result)
  expanded=tmp/'expanded';run('pkgutil','--expand-full',result,expanded)
  installed=list(expanded.glob('**/Payload/Applications/Chromato BRO.app'))
  if len(installed)!=1:raise RuntimeError('Package payload missing')
  run('codesign','--verify','--deep','--strict',installed[0])
  for source in app.rglob('*'):
   if source.is_file() and source.read_bytes()!=(installed[0]/source.relative_to(app)).read_bytes():raise RuntimeError('Payload mismatch: '+str(source))
  shutil.copyfile(result,output)
 for old in ROOT.parent.glob('Chromato BRO Mac ver*.pkg'):
  if old!=output:old.unlink()
 print('Verified installer:',output)
if __name__=='__main__':main()
