#!/usr/bin/env python3
"""Developer ID signing and notarization, without embedded credentials.

Default/check is read-only. A release archive is only called notarized after an
Accepted notary response, ticket stapling, and local Gatekeeper assessment.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
MAGIC = {b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xca\xfe\xba\xbe", b"\xca\xfe\xba\xbf", b"\xfe\xed\xfa\xce", b"\xce\xfa\xed\xfe"}


def run(args, capture=False):
    return subprocess.run([str(a) for a in args], check=True, text=True, stdout=subprocess.PIPE if capture else None, stderr=subprocess.PIPE if capture else None)


def prerequisites():
    identities = subprocess.run(["/usr/bin/security", "find-identity", "-v", "-p", "codesigning"], capture_output=True, text=True)
    matches = re.findall(r'\b([0-9A-F]{40})\s+"(Developer ID Application:[^"]+)"', identities.stdout)
    selected = os.environ.get("DFT_SIGNING_IDENTITY", "")
    return {"developerIDIdentityCount": len(matches), "configuredIdentityAvailable": bool(selected) and any(selected in pair for pair in matches),
            "notaryProfileConfigured": bool(os.environ.get("DFT_NOTARY_PROFILE")), "appExists": (ROOT / "build/Molecule DFT.app").is_dir(),
            "automaticUpdateEndpointConfigured": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", nargs="?", choices=["check", "sign", "notarize"], default="check")
    args = parser.parse_args()
    status = prerequisites()
    if args.mode == "check":
        print(json.dumps(status, indent=2)); return
    if not status["configuredIdentityAvailable"]:
        raise SystemExit("Set DFT_SIGNING_IDENTITY to an installed Developer ID Application certificate name or SHA-1. No release was created.")
    if args.mode == "notarize" and not status["notaryProfileConfigured"]:
        raise SystemExit("Set DFT_NOTARY_PROFILE to an existing notarytool keychain profile. No software was uploaded.")
    if not status["appExists"]:
        raise SystemExit("Run build-macos.command first.")
    identity = os.environ["DFT_SIGNING_IDENTITY"]
    output = ROOT / "build/releases"
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="molecule-dft-release-", dir="/private/tmp") as stage:
        app = Path(stage) / "Molecule DFT.app"
        run(["/usr/bin/ditto", "--norsrc", "--noextattr", ROOT / "build/Molecule DFT.app", app])
        run(["/usr/bin/xattr", "-cr", app])
        binaries = []
        for file in app.rglob("*"):
            if file.is_file() and not file.is_symlink():
                with file.open("rb") as stream:
                    if stream.read(4) in MAGIC:
                        binaries.append(file)
        # Sign the leaf objects, then enclosing frameworks, then the main app.
        # --deep is verification only, never a shortcut for the signing order.
        for file in sorted(binaries, key=lambda p: len(p.parts), reverse=True):
            run(["/usr/bin/codesign", "--force", "--options", "runtime", "--timestamp", "--sign", identity, file])
        for framework in sorted(app.rglob("*.framework"), key=lambda p: len(p.parts), reverse=True):
            if not framework.is_symlink():
                run(["/usr/bin/codesign", "--force", "--options", "runtime", "--timestamp", "--sign", identity, framework])
        run(["/usr/bin/codesign", "--force", "--options", "runtime", "--timestamp", "--sign", identity, app])
        run(["/usr/bin/codesign", "--verify", "--deep", "--strict", "--verbose=2", app])
        with (app / "Contents/Info.plist").open("rb") as stream:
            info = plistlib.load(stream)
        archive = Path(stage) / "submission.zip"
        run(["/usr/bin/ditto", "-c", "-k", "--norsrc", "--noextattr", "--keepParent", app, archive])
        receipt = {"version": info["CFBundleShortVersionString"], "build": info["CFBundleVersion"], "notarized": False, "signedBinaryCount": len(binaries)}
        if args.mode == "notarize":
            response = run(["/usr/bin/xcrun", "notarytool", "submit", archive, "--keychain-profile", os.environ["DFT_NOTARY_PROFILE"], "--wait", "--timeout", "30m", "--output-format", "json"], capture=True)
            notary = json.loads(response.stdout)
            (output / "last-notary-response.json").write_text(json.dumps(notary, indent=2) + "\n")
            if notary.get("status") != "Accepted":
                raise SystemExit("Apple did not accept this release. See last-notary-response.json; no release archive was published.")
            run(["/usr/bin/xcrun", "stapler", "staple", app])
            run(["/usr/bin/xcrun", "stapler", "validate", app])
            run(["/usr/sbin/spctl", "--assess", "--type", "execute", "--verbose=2", app])
            receipt.update(notarized=True, notarySubmissionID=notary["id"])
            archive.unlink()
            run(["/usr/bin/ditto", "-c", "-k", "--norsrc", "--noextattr", "--keepParent", app, archive])
        suffix = "notarized" if receipt["notarized"] else "signed-NOT-NOTARIZED"
        name = f"MoleculeDFT-{receipt['version']}-{receipt['build']}-arm64-{suffix}"
        receipt["sha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
        receipt["archive"] = name + ".zip"
        # Keep release artifacts as archives: Desktop File Provider attributes
        # can otherwise invalidate a signed .app's resource envelope.
        shutil.copyfile(archive, output / receipt["archive"])
        (output / (name + ".json")).write_text(json.dumps(receipt, indent=2) + "\n")
        print(output / receipt["archive"])


if __name__ == "__main__":
    main()
