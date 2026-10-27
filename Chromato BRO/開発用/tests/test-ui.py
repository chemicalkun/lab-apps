#!/usr/bin/env python3
"""Run UI smoke tests using the macOS system WKWebView, without Playwright/Chrome."""
from pathlib import Path
import subprocess
import sys
if sys.platform != 'darwin':
    raise SystemExit('This native UI test requires macOS. Use node tests/test-core.js for portable numerical tests.')
root = Path(__file__).resolve().parents[1]
subprocess.run(['bash', str(root/'tests/test-native.command')], cwd=root, check=True)
