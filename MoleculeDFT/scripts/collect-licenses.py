#!/usr/bin/env python3
"""Collect the installed versions' notices; never substitute package summaries.

No network is used during a build. Additional upstream binary notices are kept
under third_party/notices with a source URL and SHA256 receipt.
"""
import argparse
import hashlib
import importlib.metadata as metadata
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def collect(destination, engine=None):
    destination.mkdir(parents=True, exist_ok=True)
    names = [line.split("==")[0] for line in (ROOT / "requirements-lock.txt").read_text().splitlines() if "==" in line]
    names.append("setuptools")
    manifest = {"schemaVersion": 1, "python": sys.version.split()[0], "packages": [], "binaryNotices": [], "binaries": []}
    missing = []
    for name in names:
        dist = metadata.distribution(name)
        entry = {"name": dist.metadata["Name"], "version": dist.version, "licenseExpression": dist.metadata.get("License-Expression", ""), "notices": []}
        for relative in dist.files or []:
            file = Path(dist.locate_file(relative))
            if not re.search(r"(?:^|[_.-])(license|licence|copying|copyright|notice)(?:[_.-]|$)", file.name, re.I):
                continue
            if not file.is_file() or file.suffix in {".py", ".pyc", ".so", ".dylib"}:
                continue
            raw = file.read_bytes()
            if len(raw) > 2_000_000 or b"\0" in raw:
                continue
            # Flatten paths from RECORD, including its ../ entries, into a safe
            # unique filename; no package-provided path becomes a target path.
            safe = re.sub(r"[^A-Za-z0-9_.-]", "_", str(relative))
            target = destination / name / safe
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            entry["notices"].append({"file": str(target.relative_to(destination)), "sha256": digest(target)})
        if not entry["notices"]:
            # geomeTRIC 1.1.1's wheel RECORD points at a missing site-packages
            # LICENSE. Preserve its exact tagged upstream notice instead.
            upstream = ROOT / "third_party" / "notices" / f"{name}-{dist.version}-LICENSE"
            if upstream.is_file():
                target = destination / name / upstream.name
                target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(upstream, target)
                entry["notices"].append({"file": str(target.relative_to(destination)), "sha256": digest(target), "origin": "tagged-upstream-source"})
            else:
                missing.append(name)
        manifest["packages"].append(entry)
    extras = ROOT / "third_party" / "notices"
    if extras.exists():
        shutil.copytree(extras, destination / "binary-notices", dirs_exist_ok=True)
        manifest["binaryNotices"] = [{"file": str(p.relative_to(destination)), "sha256": digest(p)} for p in sorted((destination / "binary-notices").rglob("*")) if p.is_file()]
    if engine:
        for file in sorted(engine.rglob("*")):
            if not file.is_file() or file.is_symlink():
                continue
            with file.open("rb") as stream:
                magic = stream.read(4)
            if magic in {b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf", b"\xfe\xed\xfa\xce", b"\xce\xfa\xed\xfe"}:
                manifest["binaries"].append({"file": str(file.relative_to(engine)), "sha256BeforeSigning": digest(file)})
    manifest["missingPackageNotices"] = missing
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    rows = ["# Third-party notices", "", "These are the notices from the installed, pinned distributions used to build this app.", "", "| Package | Version | Notice files |", "| --- | --- | --- |"]
    for entry in manifest["packages"]:
        links = ", ".join(f"[{Path(n['file']).name}]({n['file']})" for n in entry["notices"]) or "MISSING"
        rows.append(f"| {entry['name']} | {entry['version']} | {links} |")
    rows += ["", "Binary component notices and source locations: [binary-notices](binary-notices/).", "The manifest records bundled Mach-O hashes before release signing; these hashes are an inventory, not an update signature.", "", "The distribution owner must validate source availability and all notices against the final release artifacts. Collection alone is not a license-compliance certification."]
    (destination / "THIRD-PARTY-NOTICES.md").write_text("\n".join(rows) + "\n")
    if missing:
        raise SystemExit("Required installed license notice not found: " + ", ".join(missing))
    print(f"Collected {len(manifest['packages'])} package notice sets and {len(manifest['binaries'])} binary records.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    parser.add_argument("--engine", type=Path)
    args = parser.parse_args()
    collect(args.destination.resolve(), args.engine.resolve() if args.engine else None)
