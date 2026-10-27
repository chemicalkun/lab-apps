#!/bin/bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT"
TEMP_DIR="$(mktemp -d /private/tmp/dft-native-test.XXXXXX)"
trap 'rm -rf "$TEMP_DIR"' EXIT
APP="$TEMP_DIR/Molecule DFT Test.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" build/native-test build/ModuleCache
cp -R web "$APP/Contents/Resources/web"
if [[ "${DFT_TEST_BUNDLED:-0}" == 1 ]]; then
  mkdir -p "$APP/Contents/Resources/engine"
  cp -R 'build/Molecule DFT.app/Contents/Resources/engine/DFTEngine' "$APP/Contents/Resources/engine/DFTEngine"
fi
.venv/bin/python - "$ROOT" "$TEMP_DIR/main.swift" "$APP/Contents/Info.plist" <<'PY'
import sys, pathlib, plistlib
root=pathlib.Path(sys.argv[1])
source=(root/'Sources/main.swift').read_text()
source=source.replace('let application = NSApplication.shared', (root/'tests/native_smoke.swift').read_text()+'\nlet application = NSApplication.shared')
pathlib.Path(sys.argv[2]).write_text(source)
info=plistlib.loads((root/'Info.plist').read_bytes());info['CFBundleIdentifier']='jp.moleculedft.desktop.tests'
pathlib.Path(sys.argv[3]).write_bytes(plistlib.dumps(info))
PY
xcrun swiftc -O -D DFT_NATIVE_TEST -target arm64-apple-macos14.0 -module-cache-path build/ModuleCache \
  -framework AppKit -framework WebKit "$TEMP_DIR/main.swift" -o "$APP/Contents/MacOS/MoleculeDFT"
xattr -cr "$APP"
codesign --force --sign - "$APP"
if [[ "${DFT_TEST_BUNDLED:-0}" == 1 ]]; then
  DFT_TEST_ROOT="$ROOT" "$APP/Contents/MacOS/MoleculeDFT"
else
  DFT_TEST_ROOT="$ROOT" DFT_TEST_PYTHON="$ROOT/.venv/bin/python" DFT_TEST_WORKER="$ROOT/engine/worker.py" "$APP/Contents/MacOS/MoleculeDFT"
fi
