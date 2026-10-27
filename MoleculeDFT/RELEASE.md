# Molecule DFT 2.0 — 配布準備

このビルドはApple Silicon / macOS 14以降向けのローカル開発版です。機能実装済みであることと、一般公開に必要な署名・公証・配布検証が済んでいることを区別してください。

## 手元でのビルド

`bash build-macos.command` はPython依存関係とネイティブUIを同梱し、ad-hoc署名されたアプリとZIPを `build/` に生成します。別途Pythonをインストールする必要はありません。ソースの数値テスト、同梱実行ファイルテスト、実画面テストは `VALIDATION.md` を参照してください。

## 正式配布の署名と公証

`python3 scripts/release-macos.py check` は設定の存在だけを確認し、アップロードしません。このMacではDeveloper ID Applicationの有効な署名IDは検出されませんでした。署名鍵やAppleアカウントは生成・代用していません。

1. 配布者のApple Developerアカウントに対応するDeveloper ID Application証明書と秘密鍵をキーチェーンに用意します。
2. `DFT_SIGNING_IDENTITY` に証明書名またはSHA-1を設定します。
3. `xcrun notarytool store-credentials` で配布者自身の認証をキーチェーンに保存し、そのプロファイル名を `DFT_NOTARY_PROFILE` に設定します。パスワードをソースや配布物に書かないでください。
4. `python3 scripts/release-macos.py sign` はHardened Runtimeで内部Mach-Oから順に署名し、公証未実施と明示したZIPを作ります。
5. `python3 scripts/release-macos.py notarize` は署名後のZIPをAppleへ送り、Accepted・staple・Gatekeeper検証のすべてが成功した場合だけ公証済みZIPを作ります。

出力は `build/releases/` です。ZIPのSHA-256、バージョン、公証結果をJSONに記録します。公証の実行そのものはこの環境では未検証です。

## 更新

「配布・更新」はユーザーが選択したローカルのアプリを検証します。同じBundle IDとDeveloper Team ID、より新しいバージョン、署名・Gatekeeper検証を要求します。ad-hoc版では信頼するTeam IDがないためこの更新経路を無効にしています。架空の更新サーバーは設定していません。インターネットからの自動ダウンロード配信には、配布者が管理する公開先と更新ポリシーを別途用意する必要があります。

## 保存と復旧

通常版は `~/Library/Application Support/Molecule DFT/` に作業スナップショット、直前の正常なバックアップ、最後の実行入力・結果・ログを保存します。スナップショットは30 MBまでです。ジョブは最大30件で、再起動時には実行中だったものを中断状態にします。再実行は最初から行い、SCF内部状態からの再開ではありません。テスト版は別の一時ディレクトリを使います。

## 第三者コンポーネント

`scripts/collect-licenses.py` が固定したPython依存関係の通知、バイナリ構成物の通知、配布元、署名前ハッシュの一覧を `Contents/Resources/Licenses/` に収録します。通知の自動収集だけで全配布条件の確認が完了したとは扱わず、正式公開時には最終アーカイブと必要なソース提供方法を照合してください。

## 公開前に残る検証

- 実際のDeveloper ID署名・公証と、正式署名版間の更新。
- 別のApple Silicon Mac・クリーンユーザー環境での初回起動とファイル操作。
- 長時間・上限付近の計算、異常終了、保存先の容量不足などの運用試験。
- 最終配布物に対する依存ライセンス／必要なソース提供方法、利用規約、サポート窓口の確定。

製品の対象は有限分子・有限高分子鎖のHF/DFTです。周期系・結晶・融体・熱平衡分布は未対応です。振動解析とIEF-PCM溶媒効果は対応条件をヘルプで確認してください。
