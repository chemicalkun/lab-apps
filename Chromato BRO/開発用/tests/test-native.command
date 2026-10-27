#!/bin/bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
TEST_TMP="$(mktemp -d /private/tmp/gpc-native-test.XXXXXX)"
trap 'rm -rf "$TEST_TMP"' EXIT
APP="$TEST_TMP/GPC Native Test.app"
mkdir -p "$APP/Contents/MacOS" "$ROOT/build/ModuleCache" "$ROOT/build/native-test"
cp "$ROOT/Info.plist" "$APP/Contents/Info.plist"
cp -R "$ROOT/Resources" "$APP/Contents/Resources"
# main.swift includes test hooks only for this separately built harness.
python3 - "$ROOT" "$TEST_TMP/main.swift" <<'PYCODE'
from pathlib import Path
import sys
root = Path(sys.argv[1])
# Keep the test host separate from any live production session.
import plistlib
manifest=Path(sys.argv[2]).parent/'GPC Native Test.app/Contents/Info.plist'
info=plistlib.loads(manifest.read_bytes());info['CFBundleIdentifier']='jp.gpcmac.analyzer.native.tests'
manifest.write_bytes(plistlib.dumps(info))
source = (root/'Sources/GPCMacAnalyzer.swift').read_text()
source = source.replace('window.setFrameAutosaveName("GPCMainWindow")', 'window.setFrameAutosaveName("GPCMainWindow"); window.setContentSize(NSSize(width: 1280, height: 850))')
source = source.replace('let application = NSApplication.shared', (root/'tests/NativeSmoke.swift').read_text()+'\nlet application = NSApplication.shared')
Path(sys.argv[2]).write_text(source)
PYCODE
xcrun swiftc -O -D GPC_NATIVE_TEST -module-cache-path "$ROOT/build/ModuleCache" -target arm64-apple-macos12.3 -framework AppKit -framework WebKit "$ROOT/Sources/SessionStore.swift" "$ROOT/Sources/UpdateCore.swift" "$ROOT/Sources/AppUpdater.swift" "$TEST_TMP/main.swift" -o "$APP/Contents/MacOS/GPCMacAnalyzer"
xattr -cr "$APP"
codesign --force --sign - "$APP"
GPC_SESSION_DIRECTORY="$TEST_TMP/session" GPC_TEST_ROOT="$ROOT" "$APP/Contents/MacOS/GPCMacAnalyzer"
python3 "$ROOT/tests/verify_native_exports.py"

GPC_SESSION_DIRECTORY="$TEST_TMP/persistence" GPC_PERSIST_PHASE=write GPC_TEST_ROOT="$ROOT" "$APP/Contents/MacOS/GPCMacAnalyzer"
GPC_SESSION_DIRECTORY="$TEST_TMP/persistence" GPC_PERSIST_PHASE=read GPC_TEST_ROOT="$ROOT" "$APP/Contents/MacOS/GPCMacAnalyzer"
GPC_SESSION_DIRECTORY="$TEST_TMP/persistence" GPC_PERSIST_PHASE=draft GPC_TEST_ROOT="$ROOT" "$APP/Contents/MacOS/GPCMacAnalyzer"
