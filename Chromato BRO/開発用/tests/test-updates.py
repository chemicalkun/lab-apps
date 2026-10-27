#!/usr/bin/env python3
from pathlib import Path
import base64,copy,json,os,plistlib,shutil,subprocess,tempfile,zipfile,hashlib
ROOT=Path(__file__).resolve().parents[1]
WIN=ROOT.parent.parent/'Chromato BRO-Windows/開発用'
def run(args,**kwargs):return subprocess.run([str(x) for x in args],check=True,**kwargs)
with tempfile.TemporaryDirectory(prefix='chromato-update-tests-',dir='/private/tmp') as tmp:
    tmp=Path(tmp);key=ROOT/'.release-keys/update-signing.pem';public=ROOT/'Resources/update-public.der'
    shutil.copy2(public,tmp/'public.der');(tmp/'package.zip').write_bytes(b'update test bytes')
    release={'version':'26.10.21','build':42,'url':'https://example.com/package.zip','sha256':hashlib.sha256((tmp/'package.zip').read_bytes()).hexdigest(),'size':(tmp/'package.zip').stat().st_size,'notes':'Test'}
    payload={'schema':1,'app':'Chromato BRO','releases':{'mac-arm64':release,'windows-x64':release.copy()}}
    def sign(name,value):
        data=json.dumps(value,separators=(',',':')).encode();p=tmp/'payload';p.write_bytes(data)
        sig=run(['openssl','dgst','-sha256','-sign',key,p],capture_output=True).stdout
        (tmp/name).write_text(json.dumps({'payload':base64.b64encode(data).decode(),'signature':base64.b64encode(sig).decode()}))
    sign('updates.json',payload)
    value=json.loads((tmp/'updates.json').read_text());value['payload']=base64.b64encode(b'tampered').decode();(tmp/'tampered.json').write_text(json.dumps(value))
    for name,field,value in [('bad-hash.json','sha256','0'*64),('bad-size.json','size',0),('bad-url.json','url','http://example.com/app.zip'),('bad-version.json','version','26.99.99'),('bad-build.json','build',0)]:
        p=copy.deepcopy(payload)
        for r in p['releases'].values():r[field]=value
        sign(name,p)
    for name,field,value in [('bad-app.json','app','Another App'),('bad-schema.json','schema',99)]:
        p=copy.deepcopy(payload);p[field]=value;sign(name,p)
    cases={'valid.zip':['Chromato BRO Windows/www/index.html'],'traversal.zip':['Chromato BRO Windows/../outside'],'duplicate.zip':['Chromato BRO Windows/file','Chromato BRO Windows/FILE'],'absolute.zip':['/Chromato BRO Windows/file'],'backslash.zip':['Chromato BRO Windows/a\\b'],'symlink.zip':['Chromato BRO Windows/link']}
    for name,entries in cases.items():
        with zipfile.ZipFile(tmp/name,'w') as z:
            for entry in entries:
                info=zipfile.ZipInfo(entry)
                if name=='symlink.zip':info.create_system=3;info.external_attr=0o120777<<16
                z.writestr(info,'test')
    shutil.copy2(ROOT/'tests/UpdateCoreTests.swift',tmp/'main.swift')
    run(['xcrun','swiftc',ROOT/'Sources/UpdateCore.swift',tmp/'main.swift','-o',tmp/'swift-tests'])
    run([tmp/'swift-tests',tmp])
    dotnet=Path('/private/tmp/gpc-sdk-rebuild/dotnet')
    if not dotnet.is_file():dotnet=Path(shutil.which('dotnet') or '/missing-dotnet')
    project=tmp/'net';project.mkdir();shutil.copy2(WIN/'src/UpdateProtocol.cs',project/'UpdateProtocol.cs');shutil.copy2(WIN/'tests/UpdateCoreTests.cs',project/'Program.cs')
    (project/'Tests.csproj').write_text('<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
    env=dict(os.environ,DOTNET_CLI_HOME='/private/tmp/gpc-sdk-cli',NUGET_PACKAGES='/private/tmp/gpc-packages-rebuild',DOTNET_CLI_TELEMETRY_OPTOUT='1')
    run([dotnet,'run','--project',project/'Tests.csproj','--',tmp],env=env)
    # Exercise the real Mac replacement helper with small signed stand-in bundles.
    for scenario in ['success','rollback']:
        parent=tmp/scenario;parent.mkdir();target=parent/'Chromato BRO.app';work=parent/'.ChromatoBRO-update-test';work.mkdir();candidate=work/'Chromato BRO.app';status=parent/'status.txt'
        for app,is_new in [(target,False),(candidate,True)]:
            (app/'Contents/MacOS').mkdir(parents=True)
            (app/'Contents/Resources').mkdir()
            (app/'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'jp.gpcmac.analyzer.update-tests','CFBundleExecutable':'GPCMacAnalyzer','CFBundlePackageType':'APPL','CFBundleName':'Update Test'}))
            code="""#include <stdio.h>
#include <unistd.h>
#include <string.h>
int main(int argc,char **argv){if(argc>2 && strcmp(argv[1],"--update-confirm")==0){FILE *f=fopen(argv[2],"w");if(f){fputs("ready",f);fclose(f);}sleep(2);}return 0;}
"""
            if is_new and scenario=='rollback':code='int main(){return 1;}'
            src=parent/('new.c' if is_new else 'old.c');src.write_text(code)
            run(['xcrun','clang',src,'-o',app/'Contents/MacOS/GPCMacAnalyzer'])
            (app/'Contents/Resources/version.txt').write_text('new' if is_new else 'old')
            run(['xattr','-cr',app])
            run(['codesign','--force','--sign','-',app])
        (parent/'session.json').write_text('user data stays')
        result=subprocess.run(['bash',str(ROOT/'Resources/update-install.sh'),'99999999',str(target),str(candidate),str(work),str(status)],capture_output=True,text=True,timeout=30)
        if scenario=='success':assert result.returncode==0 and (target/'Contents/Resources/version.txt').read_text()=='new' and not Path(str(target)+'.update-backup').exists(),result.stderr
        else:assert result.returncode==1 and (target/'Contents/Resources/version.txt').read_text()=='old' and '以前のアプリに戻しました' in status.read_text(),result.stderr
        assert (parent/'session.json').read_text()=='user data stays'
    print('PASS: actual Mac helper replacement, readiness confirmation, failed-launch rollback and untouched user data')
