#!/usr/bin/env python3
"""Sign current Mac/Windows archives. No upload or network requests are performed."""
from pathlib import Path
import argparse,base64,hashlib,json,os,plistlib,subprocess,tempfile,urllib.parse,zipfile
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
def https_url(value):
    url=urllib.parse.urlsplit(value)
    if url.scheme!='https' or not url.hostname or url.username or url.password or url.fragment:
        raise ValueError('https:// で始まる配布先を指定してください。')
    return value

def validate_zip(archive):
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:raise ValueError('ZIP CRC error')
        total=0;seen=set()
        for i in z.infolist():
            parts=i.filename.rstrip('/').split('/')
            if i.filename.startswith('/') or '\\' in i.filename or ':' in i.filename or any(p in ('','..','.') for p in parts) or i.filename.lower() in seen or (i.external_attr>>16)&0xf000==0xa000:
                raise ValueError('Unsafe ZIP entry: '+i.filename)
            seen.add(i.filename.lower());total+=i.file_size
        if len(seen)>10000 or total>1_500_000_000:raise ValueError('ZIP exceeds size limit')

def create(base,mac,windows,key,notes,output):
    https_url(base)
    if len(notes)>4000:raise ValueError('更新内容は4000文字以下にしてください。')
    public=(ROOT/'Resources/update-public.der').read_bytes()
    releases={}
    for platform,archive in [('mac-arm64',mac),('windows-x64',windows)]:
        validate_zip(archive)
        with zipfile.ZipFile(archive) as z:
            if platform=='mac-arm64':
                info=plistlib.loads(z.read('Chromato BRO.app/Contents/Info.plist'))
                version=info['CFBundleShortVersionString'];build=int(info['CFBundleVersion'])
                assert info['CFBundleIdentifier']=='jp.gpcmac.analyzer.native'
                assert z.read('Chromato BRO.app/Contents/Resources/update-public.der')==public
            else:
                info=json.loads(z.read('Chromato BRO Windows/release-info.json'))
                version=info['version'];build=info['build']
                assert z.read('Chromato BRO Windows/update-public.der')==public
        releases[platform]={'version':version,'build':build,'url':urllib.parse.urljoin(base.rstrip('/')+'/',urllib.parse.quote(archive.name)),
            'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'size':archive.stat().st_size,'notes':notes}
    payload=json.dumps({'schema':1,'app':'Chromato BRO','releases':releases},ensure_ascii=False,separators=(',',':')).encode()
    with tempfile.TemporaryDirectory(prefix='chromato-sign-') as temp:
        temp=Path(temp);data=temp/'payload';data.write_bytes(payload);signature=temp/'signature'
        subprocess.run(['openssl','dgst','-sha256','-sign',str(key),'-out',str(signature),str(data)],check=True)
        # Check the key against the public key embedded in the delivered applications.
        pem=temp/'public.pem'
        subprocess.run(['openssl','rsa','-RSAPublicKey_in','-inform','DER','-in',str(ROOT/'Resources/update-public.der'),'-pubout','-out',str(pem)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        subprocess.run(['openssl','dgst','-sha256','-verify',str(pem),'-signature',str(signature),str(data)],check=True)
        envelope={'payload':base64.b64encode(payload).decode(),'signature':base64.b64encode(signature.read_bytes()).decode()}
    output.parent.mkdir(parents=True,exist_ok=True)
    temp=output.with_suffix('.tmp');temp.write_text(json.dumps(envelope,indent=2)+'\n');os.replace(temp,output)
    return releases

def main():
    p=argparse.ArgumentParser(description='Mac/Windows配布ZIPから署名付き更新情報を作成します。')
    p.add_argument('--base-url',required=True,help='2つのZIPを公開するHTTPSディレクトリURL')
    p.add_argument('--notes',default='使い勝手と安定性を改善しました。')
    p.add_argument('--windows-root',type=Path,default=ROOT.parent.parent/'Chromato BRO-Windows')
    p.add_argument('--key',type=Path,default=ROOT/'.release-keys/update-signing.pem')
    p.add_argument('--output',type=Path,default=ROOT/'配布用更新情報/updates.json')
    args=p.parse_args()
    mac_archives=list(ROOT.parent.glob('Chromato BRO Mac ver*.zip'))
    windows_archives=list(args.windows_root.glob('Chromato BRO Windows ver*.zip'))
    if len(mac_archives)!=1 or len(windows_archives)!=1:
        raise ValueError('各OSの配布ZIPを最新版1つだけにしてから実行してください。')
    mac=mac_archives[0];windows=windows_archives[0]
    create(args.base_url,mac,windows,args.key,args.notes,args.output)
    print('署名付き更新情報:',args.output)
    print('公開するファイル:',mac,'\n',windows,'\n',args.output)
    print('アップロードはまだ行っていません。updates.jsonはZIPの公開後に差し替えてください。')
if __name__=='__main__':main()
