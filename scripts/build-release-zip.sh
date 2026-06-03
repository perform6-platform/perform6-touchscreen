#!/bin/sh
# Builds BrightSign deployment ZIP: autorun.brs + index.html + assets/
set -e
VERSION="${1:-dev}"
OUT="perform6-touchscreen-${VERSION}.zip"

npm run build
rm -rf .release && mkdir -p .release
cp brightsign/autorun.brs .release/autorun.brs
cp dist/index.html .release/index.html
cp -r dist/assets .release/assets

cd .release && zip -r "../${OUT}" . && cd ..
rm -rf .release
echo "Created ${OUT}"
