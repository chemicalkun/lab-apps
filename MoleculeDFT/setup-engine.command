#!/bin/bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
cd "$ROOT"
PYTHON="${DFT_PYTHON:-/usr/bin/python3}"
if [[ ! -x .venv/bin/python ]]; then "$PYTHON" -m venv .venv; fi
.venv/bin/python -m pip install --disable-pip-version-check --prefer-binary -r requirements-lock.txt
.venv/bin/python -c 'import rdkit,pyscf,geometric; print("計算エンジンの準備ができました。PySCF",pyscf.__version__)'
