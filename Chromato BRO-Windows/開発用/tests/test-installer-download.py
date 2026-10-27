#!/usr/bin/env python3
"""Live HTTPS/signed-package integration test; does not install anything."""
from pathlib import Path
import os,shutil,subprocess,tempfile
root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='ChromatoBRO-download-test-') as tmp:
 tmp=Path(tmp)
 for src,name in [(root/'installer/Download.cs','Download.cs'),(root/'src/UpdateProtocol.cs','UpdateProtocol.cs'),(root/'src/update-public.der','public.der'),(root/'tests/InstallerDownloadTests.cs','Program.cs')]:shutil.copyfile(src,tmp/name)
 (tmp/'test.csproj').write_text('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
 subprocess.run([os.environ.get('DOTNET','dotnet'),'run','--project','test.csproj','-c','Release'],cwd=tmp,check=True)
