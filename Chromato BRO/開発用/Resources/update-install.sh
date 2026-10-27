#!/bin/bash
# Fixed helper. Every path is passed as an argument, never interpolated into code.
set -u
parent="$1"; target="$2"; candidate="$3"; work="$4"; status="$5"
backup="${target}.update-backup"
ready="$work/ready"
fail() { printf '%s\n' "$1" > "$status"; }
for ((i=0;i<120;i++)); do
  if ! kill -0 "$parent" 2>/dev/null; then break; fi
  sleep 1
done
if kill -0 "$parent" 2>/dev/null; then exit 0; fi
if [[ -e "$backup" ]]; then fail '前回の更新バックアップが残っています。アプリは変更しませんでした。'; exit 1; fi
if ! /usr/bin/codesign --verify --deep --strict "$candidate" 2>> "$work/install.log"; then fail '更新ファイルの署名検証に失敗しました。'; exit 1; fi
if ! mv "$target" "$backup"; then fail 'アプリを更新できません。書き込み可能な場所に移動してください。'; exit 1; fi
rollback() {
  if [[ -e "$target" ]]; then mv "$target" "$work/failed.app" || return; fi
  mv "$backup" "$target" || return
  fail '更新を完了できなかったため、以前のアプリに戻しました。'
  /usr/bin/open "$target"
}
if ! mv "$candidate" "$target"; then rollback; exit 1; fi
"$target/Contents/MacOS/GPCMacAnalyzer" --update-confirm "$ready" >> "$work/install.log" 2>&1 &
child=$!
for ((i=0;i<60;i++)); do
  if [[ -f "$ready" ]]; then
    rm -rf "$backup"
    rm -f "$status"
    rm -rf "$work"
    exit 0
  fi
  if ! kill -0 "$child" 2>/dev/null; then rollback; exit 1; fi
  sleep 1
done
# Never replace an app while it is running. Retain the backup for recovery.
fail '更新後の起動確認を完了できませんでした。以前の版は .update-backup に保持しています。'
exit 1
