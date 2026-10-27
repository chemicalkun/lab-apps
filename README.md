# Lab Apps

Chromato BRO（Mac / Windows）とMoleculeDFTのソースコードを管理する公開リポジトリです。

## 構成

- `Chromato BRO/開発用`：Mac版のSwift / WebKitホスト、共通の解析・描画処理、ビルド・テスト。
- `Chromato BRO-Windows/開発用`：Windows 11 x64版の.NET / WebView2ホスト、ビルド・テスト。
- `MoleculeDFT`：MoleculeDFTのソースと依存関係・ビルド手順。

完成アプリや配布ZIP、秘密鍵、ローカル環境、測定データはGit管理に含めません。

## Chromato BRO

GPC/SEC測定データの分子量計算、検量線作成、クロマトグラムの概形表示を行います。

完成アプリの配布先：
https://github.com/chemicalkun/chromato-bro-releases/releases/latest

Macは `Chromato BRO/開発用` で `bash build-macos.command` を実行します。
Windowsは `Chromato BRO-Windows/開発用` で PowerShellから `./build-windows.ps1` を実行します。
詳細は各フォルダのREADMEと「フォルダ構成.txt」を参照してください。

測定ファイルを使わないテストの例（Node.js）：

```sh
cd 'Chromato BRO/開発用'
node tests/test-figure.js
node tests/test-calibration-meta.js
node tests/test-title-text.js
```

実測値との照合テストとネイティブUIテストには、各開発用フォルダの `サンプルデータ` に研究室で保管しているCRM・CSV・ANLを配置してください。実測ファイルは公開していません。署名付き更新情報の発行にも、公開していない秘密鍵が必要です。通常のローカルビルドに秘密鍵は不要です。

Chromato-PROの公式製品ではありません。対応形式や計算条件はアプリ内ヘルプに記載しています。

## MoleculeDFT

セットアップ、利用方法、テストは `MoleculeDFT/README.md` と `MoleculeDFT/requirements-lock.txt` を参照してください。

## 更新と配布ZIPの方針

通常の更新ではMacの完成アプリとアプリ内更新用の公開リリースだけを更新し、手動配布用ZIPは保持します。

- Mac通常ビルド：`GPC_NO_OPEN=1 bash build-macos.command`
- 手動配布ZIPも更新する場合だけ：`GPC_CREATE_DISTRIBUTION_ZIP=1 bash build-macos.command`
- Windows手動配布ZIPも更新する場合だけ：`./build-windows.ps1 -DistributionZip` または `python3 scripts/package.py --distribution-zip`
- 通常の公開：Mac開発用フォルダで `python3 scripts/publish-github-release.py --publish`
- 手動配布ZIPも含めた公開：`python3 scripts/publish-github-release.py --distribution-zips --publish`

更新用アーカイブはアプリ内更新に必要なファイルです。手動導入用ZIPとは別の名前・URLで公開し、既存の配布ZIPは変更しません。
