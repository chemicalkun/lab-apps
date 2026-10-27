#!/bin/bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
exec "$ROOT/.venv/bin/python" "$ROOT/scripts/release-macos.py" "${1:-check}"
