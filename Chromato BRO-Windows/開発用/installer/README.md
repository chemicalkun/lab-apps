# Chromato BRO Windows セットアップ

`Chromato BRO Setup.exe` を開き「インストール」を押すと、固定の公開配布先から署名付き更新情報を取得し、最新版をダウンロード・検証して導入します。初回はインターネット接続が必要です。管理者権限を要求せず、ユーザーごとにインストールします。WebView2が不足する場合は、確認後にMicrosoft公式インストーラを起動します。

保存先: `%LOCALAPPDATA%\Programs\Chromato BRO`。スタートメニューから起動できます。Windowsの「インストールされているアプリ」から削除できます。測定データ・検量線・設定の既存保存先は変更しません。アンインストールでも解析データを保持します。

再ビルド（.NET SDK 10）:

```
python3 scripts/build-installer.py
```

成果物は単一EXEです。実行用.NET Runtimeの別途導入は不要です。公開鍵のみを埋め込み、配布先と署名検証処理をアプリと共用しています。

Windows実機でのインストール・ショートカット・レジストリ・Microsoft署名検証は未実施です。Authenticode署名はありません。
