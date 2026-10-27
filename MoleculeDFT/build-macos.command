#!/bin/bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
cd "$ROOT"
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then echo 'Apple SiliconのMacでビルドしてください。'; exit 1; fi
if [[ ! -x .venv/bin/python ]]; then bash setup-engine.command; fi
mkdir -p build/ModuleCache
export PYINSTALLER_CONFIG_DIR="$ROOT/build/pyinstaller-cache"
export PYTHONPYCACHEPREFIX="$ROOT/build/python-cache"
if [[ "${DFT_SKIP_ENGINE:-0}" != 1 || ! -x build/engine/DFTEngine/DFTEngine ]]; then
  .venv/bin/python -m PyInstaller --noconfirm --clean --onedir --name DFTEngine \
    --distpath build/engine --workpath build/pyinstaller --specpath build \
    --collect-all rdkit --collect-data pyscf --collect-binaries pyscf \
    --collect-all dftd3 --copy-metadata dftd3 --hidden-import _cffi_backend \
    --hidden-import pyscf.solvent --hidden-import pyscf.solvent.grad.pcm --hidden-import pyscf.solvent.hessian.pcm \
    --collect-data geometric --copy-metadata pyscf --copy-metadata geometric --copy-metadata rdkit \
    --hidden-import pyscf.dft --hidden-import pyscf.geomopt.geometric_solver \
    --hidden-import pyscf.hessian.rhf --hidden-import pyscf.hessian.rks --hidden-import pyscf.hessian.thermo \
    --hidden-import pyscf.grad.rks --hidden-import pyscf.grad.uks \
    --hidden-import pyscf.grad.rhf --hidden-import pyscf.grad.uhf \
    --hidden-import pyscf.scf.addons --hidden-import pyscf.scf.chkfile \
    --exclude-module tkinter --exclude-module matplotlib --exclude-module IPython \
    engine/worker.py
fi
STAGING="$(mktemp -d /private/tmp/molecule-dft-build.XXXXXX)"
trap 'rm -rf "$STAGING"' EXIT
APP="$STAGING/Molecule DFT.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/engine"
cp Info.plist "$APP/Contents/Info.plist"
cp -R web "$APP/Contents/Resources/web"
cp -R build/engine/DFTEngine "$APP/Contents/Resources/engine/DFTEngine"
cp README.md "$APP/Contents/Resources/README.md"
cp VALIDATION.md "$APP/Contents/Resources/VALIDATION.md"
cp requirements-lock.txt "$APP/Contents/Resources/requirements-lock.txt"
cp RELEASE.md "$APP/Contents/Resources/RELEASE.md"
cp PRODUCT_GAPS.md "$APP/Contents/Resources/PRODUCT_GAPS.md"
.venv/bin/python scripts/collect-licenses.py "$APP/Contents/Resources/Licenses" --engine "$APP/Contents/Resources/engine/DFTEngine"
xcrun swiftc -O -target arm64-apple-macos14.0 -module-cache-path build/ModuleCache \
  -framework AppKit -framework WebKit Sources/main.swift -o "$APP/Contents/MacOS/MoleculeDFT"
if [[ -f scripts/make-icon.swift ]]; then
  swift -module-cache-path build/ModuleCache scripts/make-icon.swift build
  .venv/bin/python scripts/package-icon.py build/AppIcon.iconset "$APP/Contents/Resources/AppIcon.icns"
fi
xattr -cr "$APP"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
if [[ "${DFT_SKIP_ZIP:-0}" != 1 ]]; then
  ditto -c -k --norsrc --noextattr --keepParent "$APP" "$STAGING/Molecule DFT.zip"
  mv -f "$STAGING/Molecule DFT.zip" 'build/Molecule DFT.zip'
fi
if [[ -d 'build/Molecule DFT.app' ]]; then mv 'build/Molecule DFT.app' "build/Molecule DFT.previous.$(date +%Y%m%d_%H%M%S).app"; fi
mv "$APP" 'build/Molecule DFT.app'
echo "完成: $ROOT/build/Molecule DFT.app"
if [[ "${DFT_OPEN:-0}" == 1 ]]; then open 'build/Molecule DFT.app'; fi
