#!/usr/bin/env python3
"""Build a single-file Windows installer matching the app version."""
import argparse, os, shutil, struct, subprocess, tempfile, xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--dotnet',default='dotnet');args=p.parse_args()
app=ET.parse(ROOT/'src/GPCAnalyzer.csproj').getroot();version=app.findtext('.//Version');fileversion=app.findtext('.//FileVersion')
if not version or not fileversion:raise ValueError('App version missing')
with tempfile.TemporaryDirectory(prefix='ChromatoBRO-setup-build-') as tmp:
 tmp=Path(tmp);shutil.copytree(ROOT/'installer',tmp/'installer',ignore=shutil.ignore_patterns('bin','obj'));(tmp/'src').mkdir()
 for name in ['UpdateProtocol.cs','update-public.der','AppIcon.ico']:shutil.copyfile(ROOT/'src'/name,tmp/'src'/name)
 project=tmp/'installer/ChromatoSetup.csproj';tree=ET.parse(project)
 tree.getroot().find('.//Version').text=version;tree.getroot().find('.//FileVersion').text=fileversion;tree.write(project,encoding='utf-8',xml_declaration=True)
 out=tmp/'out';subprocess.run([args.dotnet,'publish',str(project),'-c','Release','-r','win-x64','--self-contained','true','-o',str(out)],check=True)
 files=list(out.iterdir());exe=out/'Chromato BRO Setup.exe'
 if files!=[exe]:raise RuntimeError('Expected a single EXE')
 data=exe.read_bytes();offset=struct.unpack_from('<I',data,0x3c)[0]
 if data[:2]!=b'MZ' or data[offset:offset+4]!=b'PE\0\0' or struct.unpack_from('<H',data,offset+4)[0]!=0x8664:raise RuntimeError('Expected Windows x64 PE')
 shutil.copyfile(exe,ROOT.parent/exe.name)
 print('Verified installer:',ROOT.parent/exe.name)
