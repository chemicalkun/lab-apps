#!/bin/bash
# One-time local build: create a genuine, Chrome-independent AppKit .app.
# Can be run from Finder (double-click) or from VS Code's terminal.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo 'このビルドはmacOS上で実行してください（MacBook Airで実行）。'
  exit 1
fi
if ! /usr/bin/xcrun --find swiftc >/dev/null 2>&1; then
  echo 'Swiftコンパイラが見つかりません。'
  echo '一度 xcode-select --install を実行してから再試行してください。'
  exit 1
fi

DIST="$(cd "$ROOT/.." && pwd -P)"
OUT="$DIST/Chromato BRO.app"
VERSION="${RELEASE_VERSION:-$(date +%y.%m.%d)}"
ZIP="$DIST/Chromato BRO Mac ver${VERSION}.zip"
BUILD_TMP="$(mktemp -d /private/tmp/gpc-build.XXXXXX)"
STAGING="$BUILD_TMP/Chromato BRO.app"
trap 'rm -rf "$BUILD_TMP"' EXIT
mkdir -p "$ROOT/build"
mkdir -p "$ROOT/build/ModuleCache"
mkdir -p "$STAGING/Contents/MacOS" "$STAGING/Contents/Resources"
cp -R "$ROOT/Resources/www" "$STAGING/Contents/Resources/www"
rm -f "$STAGING/Contents/Resources/www/.DS_Store"
cp "$ROOT/Resources/AppIcon.icns" "$STAGING/Contents/Resources/AppIcon.icns"
cp "$ROOT/Resources/AppIcon.png" "$STAGING/Contents/Resources/AppIcon.png"
cp "$ROOT/Resources/update-public.der" "$STAGING/Contents/Resources/update-public.der"
cp "$ROOT/Resources/update-install.sh" "$STAGING/Contents/Resources/update-install.sh"
cp "$ROOT/Info.plist" "$STAGING/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$STAGING/Contents/Info.plist"
/usr/bin/sed -E -i '' "s/バージョン [0-9]+\.[0-9]+\.[0-9]+/バージョン $VERSION/g" "$STAGING/Contents/Resources/www/index.html"

cp "$ROOT/Sources/GPCMacAnalyzer.swift" "$BUILD_TMP/main.swift"

echo 'Swift + macOS WebKit をコンパイルしています...'
/usr/bin/xcrun swiftc \
  -O \
  -target arm64-apple-macos12.3 \
  -module-cache-path "$ROOT/build/ModuleCache" \
  -framework AppKit -framework WebKit \
  "$ROOT/Sources/SessionStore.swift" "$ROOT/Sources/UpdateCore.swift" "$ROOT/Sources/AppUpdater.swift" "$BUILD_TMP/main.swift" \
  -o "$STAGING/Contents/MacOS/GPCMacAnalyzer"
chmod 755 "$STAGING/Contents/MacOS/GPCMacAnalyzer"

# Local ad-hoc signature (not an Apple Developer ID or notarization).
/usr/bin/xattr -cr "$STAGING"
/usr/bin/codesign --force --sign - "$STAGING"
/usr/bin/codesign --verify --deep --strict --verbose "$STAGING"
# ZIP preserves the signed bundle without metadata added by Desktop file providers.
/usr/bin/ditto -c -k --norsrc --noextattr --keepParent "$STAGING" "$BUILD_TMP/Chromato BRO.zip"
python3 - "$BUILD_TMP/Chromato BRO.zip" "$ROOT/インストール手順.txt" <<'PYZIP'
import sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(sys.argv[2], 'インストール手順.txt')
    assert z.testzip() is None
PYZIP
mv -f "$BUILD_TMP/Chromato BRO.zip" "$ZIP"
# Remove only earlier Chromato BRO distribution archives after successful creation.
for folder in "$DIST" "$ROOT/build"; do
  for old in "$folder"/Chromato\ BRO*.zip; do
    [[ ! -f "$old" || "$old" == "$ZIP" ]] || rm -f "$old"
  done
done

if [ -e "$OUT" ]; then
  BACKUP="$ROOT/build/Chromato BRO.previous.$(date +%Y%m%d_%H%M%S).app"
  mv "$OUT" "$BACKUP"
  echo "前回のアプリは退避しました: $BACKUP"
fi
mv "$STAGING" "$OUT"
/usr/bin/codesign --verify --deep --verbose "$OUT"
echo ''
echo 'ビルド成功：'
echo "$OUT"
echo 'Chromeは使用しません。Mac標準のWebKitを使う独立アプリです。'
echo '「アプリケーション」へ移動して利用できます。'
echo ''
if [[ "${GPC_NO_OPEN:-0}" != "1" ]]; then
  /usr/bin/open "$OUT"
fi
