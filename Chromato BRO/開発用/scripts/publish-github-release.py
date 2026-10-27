#!/usr/bin/env python3
"""Prepare a signed binary release; publish only with the explicit --publish option."""
from pathlib import Path
import argparse,hashlib,json,subprocess,sys
ROOT=Path(__file__).resolve().parents[1]
def gh(*args):return subprocess.check_output(['gh',*args],text=True)
def main():
    p=argparse.ArgumentParser(description='GitHub配布リリースを準備／公開します。秘密鍵や開発プロジェクトは公開しません。')
    p.add_argument('--repo',default='chemicalkun/chromato-bro-releases')
    p.add_argument('--notes',default='使い勝手と安定性を改善しました。')
    p.add_argument('--publish',action='store_true',help='準備したアプリZIPと署名付き更新情報を一般公開する')
    args=p.parse_args()
    subprocess.run([sys.executable,str(ROOT/'scripts/prepare-github-release.py'),'--repo',args.repo,'--notes',args.notes],check=True)
    out=ROOT/'配布用更新情報/GitHub公開用';plan=json.loads((out/'release-plan.json').read_text())
    if not args.publish:
        print('準備のみ完了しました。公開する場合は --publish を付けて実行してください。');return
    repo=json.loads(gh('api',f'repos/{args.repo}'))
    if repo['private']:raise ValueError('現在のアプリはログイン不要方式です。非公開リポジトリへは公開できません。')
    releases=json.loads(gh('api',f'repos/{args.repo}/releases?per_page=100'))
    release=next((r for r in releases if r['tag_name']==plan['tag']),None)
    if release and not release['draft']:raise ValueError('このビルドは公開済みです。新しい版をビルドしてから実行してください。')
    if release:
        subprocess.run(['gh','release','upload',plan['tag'],'--repo',args.repo,'--clobber']+[str(out/n) for n in plan['assets']],check=True)
    else:
        subprocess.run(['gh','release','create',plan['tag'],'--repo',args.repo,'--draft','--title',f"Chromato BRO ver{plan['version']}",'--notes-file',str(out/'RELEASE_NOTES.md')]+[str(out/n) for n in plan['assets']],check=True)
    releases=json.loads(gh('api',f'repos/{args.repo}/releases?per_page=100'))
    release=next(r for r in releases if r['tag_name']==plan['tag'])
    assert release['draft'] and {a['name'] for a in release['assets']}==set(plan['assets'])
    for a in release['assets']:
        file=out/a['name'];assert a['state']=='uploaded' and a['size']==file.stat().st_size
        if a.get('digest'):assert a['digest']=='sha256:'+hashlib.sha256(file.read_bytes()).hexdigest()
    payload=out/'publish-request.json';payload.write_text(json.dumps({'draft':False,'make_latest':'true'}))
    subprocess.run(['gh','api','--method','PATCH',f"repos/{args.repo}/releases/{release['id']}",'--input',str(payload),'--jq','.html_url'],check=True)
    print('公開完了。固定の更新URL:',plan['feed_url'])
if __name__=='__main__':main()
