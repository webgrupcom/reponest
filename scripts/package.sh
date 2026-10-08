#!/bin/bash
# Builds the Chrome Web Store upload: dist/reponest-<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."
v=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
mkdir -p dist
out="dist/reponest-$v.zip"
rm -f "$out"
zip -qr "$out" manifest.json _locales src options icons
echo "$out"
