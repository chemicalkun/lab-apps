#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT"
DFT_STORE_TEST="$(mktemp -d /private/tmp/molecule-workspace-test.XXXXXX)"
trap 'rm -rf "$DFT_STORE_TEST"' EXIT
.venv/bin/python - "$DFT_STORE_TEST/main.swift" <<'PY'
from pathlib import Path
import sys
source=Path('Sources/main.swift').read_text().split('final class MoleculeDFTDelegate:')[0]
source+='''
let store = WorkspaceStore()
defer { try? FileManager.default.removeItem(at: store.directory) }
precondition(store.load()["exists"] as? Bool == false)
_ = try store.save(["value": 1])
_ = try store.save(["value": 2])
precondition((store.load()["workspace"] as? [String: Any])?["value"] as? Int == 2)
try Data("interrupted invalid JSON".utf8).write(to: store.directory.appendingPathComponent("workspace.json"))
let recovered = store.load()
precondition(recovered["recoveredFromBackup"] as? Bool == true)
precondition((recovered["workspace"] as? [String: Any])?["value"] as? Int == 1)
_ = try store.save(["value": 3])
var rejected = false
do { _ = try store.save(["oversized": String(repeating: "x", count: WorkspaceStore.byteLimit)]) } catch { rejected = true }
precondition(rejected)
precondition((store.load()["workspace"] as? [String: Any])?["value"] as? Int == 3)
try store.journal(["operation":"calculate","status":"running","payload":["formula":"H2O"]], resetLog:true)
store.appendLog("SCF 1: reference log\\n")
let journal = store.load()["recovery"] as! [String: Any]
precondition(journal["status"] as? String == "running")
precondition((journal["logs"] as? String)?.contains("SCF 1") == true)
print("PASS native atomic workspace, previous-good recovery, oversized-write preservation, independent input/log journal")
'''
Path(sys.argv[1]).write_text(source)
PY
xcrun swiftc -D DFT_NATIVE_TEST -module-cache-path build/ModuleCache -framework AppKit -framework WebKit "$DFT_STORE_TEST/main.swift" -o "$DFT_STORE_TEST/test-store"
"$DFT_STORE_TEST/test-store"
