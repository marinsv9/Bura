# Deploy Workflow

Ovaj repo sadrži **placeholder values** za sve secrets (Apps Script URL, OAuth Client ID, Revolut linkovi). Prije deploya na Cloudflare Pages, treba ih zamijeniti pravima.

## TL;DR

```bash
# 1. Kopiraj template config
cp config.template.sh config.local.sh

# 2. Uredi config.local.sh sa pravima vrijednostima
nano config.local.sh

# 3. Pokreni build script — generira deploy/ folder spreman za drag-drop
bash deploy.sh

# 4. Drag-drop deploy/ folder u Cloudflare Pages dashboard
```

`config.local.sh` je u `.gitignore` — NIKAD ne commita se.

---

## Detalji secrets-a

| Placeholder u kodu | Što je | Gdje dobiti |
|---|---|---|
| `GOOGLE_CLIENT_ID_PLACEHOLDER` | OAuth Client ID za Google Sign-In | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials |
| `TRACKING_ENDPOINT_PLACEHOLDER` | Apps Script Web App URL | Nakon deploy-a Apps Scripta: Deploy → Manage deployments → Web App URL |
| `REVOLUT_LINK_40_PLACEHOLDER` | Revolut Pro variable-amount checkout link (full price) | [Revolut Business](https://business.revolut.com/) → Payments → Payment links |
| `REVOLUT_LINK_35_PLACEHOLDER` | Revolut link (discount price s kodom) | Isto kao gore, drugi link |

## Apps Script ADMIN_TOKEN

U `apps-script-v8.gs` postoji konstanta `ADMIN_TOKEN`. Generiraj random string (npr. preko [uuidgenerator.net](https://www.uuidgenerator.net)) i stavi tamo. Ovaj token NIKAD ne ide u javnost — koristi se samo za admin endpoints (createVipCode, markPaid, listVipCodes, deactivateCode).

---

## Cloudflare Pages — drag-drop deploy

1. Pokreni `bash deploy.sh` — generira `deploy/` folder sa popunjenim secrets
2. Otvori [Cloudflare Pages dashboard](https://dash.cloudflare.com)
3. Odaberi projekt `bura-shop`
4. Kliknite "Create deployment" → drag-drop `deploy/` folder ili zip-aj prvo
5. Auto-deploy traje ~30 sekundi

---

## Lokalno testiranje (Google Sign-In radi)

```bash
# Generiraj lokalni build:
bash deploy.sh

# Serve preko HTTP servera (Google Sign-In ne radi na file://):
cd deploy
python3 -m http.server 8080

# Open http://localhost:8080
```

Treba **dodati `http://localhost:8080`** u Authorized JavaScript origins u Google Cloud Console za OAuth Client ID.
