#!/bin/bash
# Package the extracted artwork with a clean, transparent rounded-square boundary.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
ICON_TMP="$(mktemp -d /private/tmp/gpc-icon.XXXXXX)"
trap 'rm -rf "$ICON_TMP"' EXIT
mkdir -p "$ICON_TMP/AppIcon.iconset"
swift -module-cache-path build/ModuleCache scripts/round-icon.swift assets/AppIcon-extracted.png assets/AppIcon-rounded.png
for size in 16 32 128 256 512; do
  sips -s format png -z "$size" "$size" assets/AppIcon-rounded.png --out "$ICON_TMP/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -s format png -z "$double" "$double" assets/AppIcon-rounded.png --out "$ICON_TMP/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICON_TMP/AppIcon.iconset" -o Resources/AppIcon.icns
cp "$ICON_TMP/AppIcon.iconset/icon_512x512@2x.png" Resources/AppIcon.png
cp "$ICON_TMP/AppIcon.iconset/icon_128x128@2x.png" Resources/www/app-icon.png
