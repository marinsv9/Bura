#!/bin/bash
# ============================================================
# Deploy build script
# Generira deploy/ folder sa popunjenim secrets, spreman za Cloudflare drag-drop
# ============================================================

set -e  # exit on error

# Load local config
if [ ! -f config.local.sh ]; then
  echo "❌ config.local.sh not found."
  echo ""
  echo "Pokreni prvo:"
  echo "  cp config.template.sh config.local.sh"
  echo "  nano config.local.sh"
  exit 1
fi

source config.local.sh

# Validate svi env vars su set
required_vars=("TRACKING_ENDPOINT" "GOOGLE_CLIENT_ID" "REVOLUT_LINK_40" "REVOLUT_LINK_35")
missing=0
for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing: $var"
    missing=1
  fi
done
[ $missing -eq 1 ] && exit 1

# Kreiraj deploy folder
rm -rf deploy
mkdir -p deploy
cp -r images deploy/

# Replace placeholders u index.html
sed \
  -e "s|TRACKING_ENDPOINT_PLACEHOLDER|$TRACKING_ENDPOINT|g" \
  -e "s|GOOGLE_CLIENT_ID_PLACEHOLDER|$GOOGLE_CLIENT_ID|g" \
  -e "s|REVOLUT_LINK_40_PLACEHOLDER|$REVOLUT_LINK_40|g" \
  -e "s|REVOLUT_LINK_35_PLACEHOLDER|$REVOLUT_LINK_35|g" \
  index.html > deploy/index.html

echo "✓ Generated deploy/ folder"
echo ""
echo "📋 Next steps:"
echo "  1. Drag-drop deploy/ folder u Cloudflare Pages dashboard"
echo "  2. Ili: cd deploy && python3 -m http.server 8080 (za lokalni test)"
