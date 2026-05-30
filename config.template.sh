#!/bin/bash
# ============================================================
# CONFIG TEMPLATE — kopiraj u config.local.sh i popuni pravim vrijednostima
# config.local.sh je u .gitignore i ne ide u repo
# ============================================================

# Apps Script Web App URL (nakon deploy-a apps-script-v8.gs)
# Primjer: https://script.google.com/macros/s/AKfy.../exec
export TRACKING_ENDPOINT=""

# Google OAuth Client ID (Google Cloud Console → APIs & Services → Credentials)
# Primjer: 12345-abc.apps.googleusercontent.com
export GOOGLE_CLIENT_ID=""

# Revolut Pro payment linkovi (Revolut Business → Payments → Payment links)
# Variable-amount linkovi za €40 (full) i €35 (s kodom)
export REVOLUT_LINK_40=""
export REVOLUT_LINK_35=""
