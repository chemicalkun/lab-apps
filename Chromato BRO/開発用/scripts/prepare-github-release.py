#!/usr/bin/env python3
"""Prepare a binary-only GitHub Release locally. This script never publishes."""
import argparse,hashlib,importlib.util,json,plistlib,re,shutil,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser(description='GitHub配布用ファイルをローカルで準備します。アップロードは行いません。')
    parser.add_argument('--repo',required=True,help='OWNER/REPOSITORY')
    parser.add_argument('--windows-root',type=Path,default=ROOT.parent.parent/'Chromato BRO-Windows')
    parser.add_argument('--notes',default='アプリ内でのアップデート確認・ダウンロード・再起動に対応しました。')
    args=parser.parse_args()
    if args.repo!='chemicalkun/chromato-bro-releases':parser.error('アプリの固定更新先と異なるリポジトリには配布できません。')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',args.repo):parser.error('リポジトリはOWNER/REPOSITORYで指定してください。')
    archives={}
    for platform,folder,pattern in [('Mac',ROOT.parent,'Chromato BRO Mac ver*.zip'),('Windows',args.windows_root,'Chromato BRO Windows ver*.zip')]:
        files=list(folder.glob(pattern))
        if len(files)!=1:raise ValueError(platform+'版の配布ZIPを最新版1つだけにしてください。')
        archives[platform]=files[0]
    with zipfile.ZipFile(archives['Mac']) as z:
        info=plistlib.loads(z.read('Chromato BRO.app/Contents/Info.plist'))
        version=info['CFBundleShortVersionString'];build=int(info['CFBundleVersion'])
    with zipfile.ZipFile(archives['Windows']) as z:
        info=json.loads(z.read('Chromato BRO Windows/release-info.json'))
        if info['version']!=version or info['build']!=build:raise ValueError('両OSのバージョン／ビルド番号が一致しません。')
    tag=f'ver{version}-build{build}'
    out=ROOT/'配布用更新情報/GitHub公開用'
    out.mkdir(parents=True,exist_ok=True)
    for pattern in ('*.zip','*.pkg','*.exe'):
        for old in out.glob(pattern):old.unlink()
    files={}
    for platform,source in archives.items():
        target=out/f'Chromato-BRO-{platform}-ver{version}.zip'
        shutil.copyfile(source,target);files[platform]=target
    # Existing Mac clients accept only the app bundle in update archives.
    # Keep the visible installation guide outside the app in the human download ZIP.
    mac_update=out/f'Chromato-BRO-Mac-update-ver{version}.zip'
    with zipfile.ZipFile(files['Mac']) as source,zipfile.ZipFile(mac_update,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as target:
        for entry in source.infolist():
            if entry.filename.startswith('Chromato BRO.app/'):target.writestr(entry,source.read(entry))
    with zipfile.ZipFile(mac_update) as z:
        assert z.testzip() is None and z.namelist() and all(n.startswith('Chromato BRO.app/') for n in z.namelist())
    url=f'https://github.com/{args.repo}/releases/download/{tag}/'
    feed=f'https://github.com/{args.repo}/releases/latest/download/updates.json'
    spec=importlib.util.spec_from_file_location('feed',ROOT/'scripts/create-update-feed.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    module.create(url,mac_update,files['Windows'],ROOT/'.release-keys/update-signing.pem',args.notes,out/'updates.json')
    checksums=[]
    for name in [files['Mac'].name,files['Windows'].name,mac_update.name,'updates.json']:
        checksums.append(hashlib.sha256((out/name).read_bytes()).hexdigest()+'  '+name)
    (out/'SHA256SUMS.txt').write_text('\n'.join(checksums)+'\n')
    (out/'README.md').write_text(f"""# Chromato BRO

GPC/SECデータ解析ソフトウェア。Mac（Apple Silicon）・Windows 11（Intel/AMD）に対応します。

## ダウンロード

[最新版のダウンロード](https://github.com/{args.repo}/releases/latest)

- [Mac版ZIP]({url}Chromato-BRO-Mac-ver{version}.zip)：展開後、同封の「インストール手順.txt」を読み、Chromato BRO.appをアプリケーションへ移動します。
- [Windows版ZIP]({url}Chromato-BRO-Windows-ver{version}.zip)：「すべて展開」後、Chromato BRO Windows内の「インストール手順.txt」を読み、Chromato BRO.exeを起動します。EXEだけを取り出さず、フォルダ全体で保管してください。
- `Mac-update` のZIPとupdates.jsonはアプリ内更新用です。手動導入には上記のMac版・Windows版ZIPを使用してください。
- 測定データは外部に送信せず、解析は端末内で実行します。

## アプリ内アップデート

更新先はアプリに組み込み済みです。URLの入力や変更は不要です。

「アップデートを確認…」から更新できます。更新機能のない旧版には、まず最新版ZIPを導入してください。通常の解析中には更新通信を行いません。

## 配布について

このリポジトリはアプリの配布専用です。開発プロジェクト・利用者の測定ファイル・署名用秘密鍵は掲載しません。Chromato-PROおよびメーカーの公式製品ではありません。

Mac版はDeveloper ID署名・Apple公証なし、Windows版はAuthenticode未署名です。起動時にOSの確認が表示される場合があります。Windows実機での動作確認は未実施です。
""")
    (out/'RELEASE_NOTES.md').write_text(f"""Chromato BRO ver{version}（build {build}）

{args.notes}

Mac：Apple Silicon / macOS 12.3以降
Windows：Windows 11 / Intel・AMD x64

更新先はアプリに組み込み済みで、URLの入力は不要です。

更新は署名付き更新情報とSHA-256で照合します。測定データ・検量線・表示設定は保持します。
Windows実機での動作確認は未実施です。Macはad-hoc署名（Developer ID署名・公証なし）、WindowsはAuthenticode未署名です。
""")
    (out/'release-plan.json').write_text(json.dumps({'repo':args.repo,'tag':tag,'version':version,'build':build,'feed_url':feed,'assets':[files['Mac'].name,files['Windows'].name,mac_update.name,'updates.json','SHA256SUMS.txt']},indent=2)+'\n')
    print('公開前の確認用フォルダ:',out)
    print('公開予定リポジトリ:',args.repo)
    print('固定の更新情報URL:',feed)
    print('まだアップロード・公開は行っていません。')
if __name__=='__main__':main()
