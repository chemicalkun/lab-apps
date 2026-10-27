# アップデートの使い方

今回のZIPを展開して導入してください。更新先はMac・Windows両方のアプリに組み込み済みで、入力・変更する操作はありません。

次回以降は、Macの「Chromato BRO」メニュー、Windowsの「ヘルプ」メニューから「アップデートを確認…」を選びます。新版があればダウンロードし、「更新して再起動」で反映します。

通常の解析中には更新通信を行いません。測定データ・検量線・表示設定は保持します。保存が完了しない場合は更新を中止します。更新ファイルの署名・SHA-256・サイズ・バージョンを照合し、起動失敗時は以前の版へ戻します。

Macは書き込み可能なアプリケーションフォルダへ移動し、WindowsはZIP内のフォルダ全体を展開して実行してください。権限の自動昇格は行いません。Windows実機での更新操作は未検証です。

## 配布担当者向け

配布ページ：https://github.com/chemicalkun/chromato-bro-releases/releases/latest

固定の更新情報URL：

`https://github.com/chemicalkun/chromato-bro-releases/releases/latest/download/updates.json`

古いUserDefaultsやupdate-settings.jsonに保存されたURLは使用しません。配布先を変更する場合はアプリのソース変更と再ビルドが必要です。

日付バージョンを設定し、MacのCFBundleVersionとWindowsのFileVersion末尾を同じ内部ビルド番号にして両OS版をビルドします。同じ日付でも内部ビルド番号を増やします。

Macプロジェクトで `python3 scripts/publish-github-release.py --notes '更新内容' --publish` を実行すると、署名付き更新情報と両OSのZIPを照合して公開できます。`--publish`なしはローカル準備のみです。公開済みビルドの上書きは拒否します。GitHubの配布先と、両アプリに組み込んだURLを一致させてください。

Macプロジェクトの `.release-keys/update-signing.pem` が署名用秘密鍵です。必ず安全な場所へバックアップし、公開・共有・コミットしないでください。鍵を紛失した場合は、新しい鍵を含むアプリをZIPから再導入する必要があります。アプリと配布ZIPには公開鍵のみを含めます。

Macはad-hoc署名で、Developer ID署名・Apple公証はありません。Windows Authenticode署名はありません。更新情報の署名はこれらのコード署名とは別です。
