#!/usr/bin/env python3
"""Cross-platform transaction tests; does not install software."""
from pathlib import Path
import os, subprocess, tempfile
root=Path(__file__).resolve().parents[1]
dotnet=os.environ.get('DOTNET','dotnet')
with tempfile.TemporaryDirectory(prefix='chromato-setup-test-') as tmp:
 p=Path(tmp)
 (p/'test.csproj').write_text('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
 (p/'InstallFiles.cs').write_bytes((root/'installer/InstallFiles.cs').read_bytes())
 (p/'Program.cs').write_text('''using ChromatoSetup;
var root=Path.Combine(Environment.GetEnvironmentVariable("CHROMATO_TEST_TMP")??Path.GetTempPath(),"chromato-transaction-"+Guid.NewGuid());Directory.CreateDirectory(root);
void Assert(bool condition){if(!condition)throw new Exception("Assertion failed");}
try{
 var app=Path.Combine(root,"App");var next=Path.Combine(root,"next");var data=Path.Combine(root,"user-data");File.WriteAllText(data,"keep");
 Directory.CreateDirectory(app);File.WriteAllText(Path.Combine(app,"v"),"old");Directory.CreateDirectory(next);File.WriteAllText(Path.Combine(next,"v"),"new");
 try{InstallFiles.Replace(next,app,()=>throw new IOException("registration failure"));throw new Exception("Failure expected");}catch(IOException){}
 Assert(File.ReadAllText(Path.Combine(app,"v"))=="old");Assert(File.ReadAllText(Path.Combine(next,"v"))=="new");Assert(File.ReadAllText(data)=="keep");
 InstallFiles.Replace(next,app,()=>{});Assert(File.ReadAllText(Path.Combine(app,"v"))=="new");Assert(!Directory.Exists(next));
 try{InstallFiles.Replace(Path.Combine(root,"missing"),app,()=>{});throw new Exception("Failure expected");}catch(IOException){}
 Assert(File.ReadAllText(Path.Combine(app,"v"))=="new");
 var first=Path.Combine(root,"first");Directory.CreateDirectory(first);InstallFiles.Replace(first,Path.Combine(root,"fresh"),()=>{});Assert(Directory.Exists(Path.Combine(root,"fresh")));
 var link=Path.Combine(root,"link");Directory.CreateSymbolicLink(link,app);try{InstallFiles.RequireOrdinaryDirectory(link);throw new Exception("Link must be rejected");}catch(IOException){}
 Assert(File.ReadAllText(data)=="keep");Console.WriteLine("PASS: install, replacement, rollback, failed move, symlink rejection, user-data preservation");
}finally{Directory.Delete(root,true);}
''')
 subprocess.run([dotnet,'run','--project',str(p/'test.csproj'),'--configuration','Release','--verbosity','quiet'],check=True)
