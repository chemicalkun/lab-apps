# Chromato BROの作業方針

この方針は `Chromato BRO` と `Chromato BRO-Windows` に適用します。他のプロジェクトは依頼された場合だけ変更してください。

- 通常の更新では、このMacの完成アプリと、アプリ内更新用の公開リリースを更新します。
- 手動配布用ZIPは、ユーザーが明示的に更新を指示した場合だけ作成・変更・削除します。通常作業では既存ZIPのハッシュを維持してください。
- アプリ内更新に必要な更新用アーカイブは、手動配布用ZIPと別の名前・URLで公開します。
- Macの通常ビルドは `GPC_NO_OPEN=1 bash build-macos.command`。手動ZIPも指示された場合だけ `GPC_CREATE_DISTRIBUTION_ZIP=1` を指定します。
- Windowsの手動ZIPも指示された場合だけ `build-windows.ps1 -DistributionZip` または `scripts/package.py --distribution-zip` を使用します。
- 通常の公開はMac開発用の `scripts/publish-github-release.py --publish`。明示的な手動ZIP更新時だけ `--distribution-zips` を付けます。
- バージョンは日付（例26.10.27）、同日中の修正も内部ビルド番号を増やして旧版から検出できるようにします。
- ソースは `chemicalkun/lab-apps`、更新用公開先は `chemicalkun/chromato-bro-releases`。秘密鍵・測定データ・個人設定をコミット・公開しないでください。
- インストール済みMacアプリの更新は通常終了による保存を待ち、起動検証に失敗した場合は復旧します。強制終了してデータを失わせないでください。
