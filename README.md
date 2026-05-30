# BURA Vapes — Landing Page

Hrvatski direct-to-consumer landing za **BURA disposable vape** (MRVI Seeking 160K, 160.000 puffova, 8 okusa, LED display, Type-C).

**Live:** [bura-shop.pages.dev](https://bura-shop.pages.dev) (Cloudflare Pages)
**Plan:** custom domain `burashop.hr`

---

## Stack

- **Frontend:** vanilla HTML/CSS/JS, single file (`index.html`, ~6300 linija)
- **Backend:** Google Apps Script (`apps-script-v8.gs`) → Google Sheets kao baza
- **Auth:** Google Sign-In (Google Identity Services)
- **Plaćanje:** Revolut Pro variable-amount link
- **Hosting:** Cloudflare Pages (drag-drop deploy iz dashboard-a)
- **i18n:** custom inline (HR + EN), auto-detect po IP geolokaciji (`ipapi.co`)

Bez build steka — sve je statično. Otvori `index.html` u browseru i radi (osim Google Sign-In koji treba pravu domenu zbog OAuth origin restrictions).

---

## Struktura

```
.
├── index.html              # Cijela aplikacija (HTML + CSS + JS u jednom fajlu)
├── apps-script-v8.gs       # Backend (deploy na script.google.com)
├── images/
│   ├── logo.png            # BURA logo
│   ├── product-160k.jpg    # Hero product shot
│   ├── bura-solo.png       # Standalone uređaj (transparent PNG, flood-fill iz original JPG)
│   ├── lineup.jpg          # Combo lineup
│   └── wiip-real.png       # Konkurentska Wiip slika za VS comparison (transparent PNG)
├── config.template.sh      # Template za lokalne env vars
├── deploy.sh               # Build script: zamijeni placeholdere → deploy/
├── DEPLOY.md               # Deploy workflow + secrets info
├── .gitignore
└── README.md
```

**Secrets nisu u kodu** — placeholders su (`TRACKING_ENDPOINT_PLACEHOLDER` itd.). Prije deploya, `deploy.sh` ih zamijeni pravim vrijednostima iz `config.local.sh` (koji NIJE u repo).

Vidi [DEPLOY.md](./DEPLOY.md) za detalje.

---

## Sekcije (po redu)

1. **Hero** — naslov, 5 bullets (premium / trajanje / 8 okusa / LED display / dostava), 2 CTA
2. **Proizvod (`#proizvod`)** — Why BURA, VS visual (Bura PNG vs Wiip PNG sa drop-shadow), VS tablica, 200× math punchline
3. **Comboi (`#comboi`)** — lineup banner + 7 combo kartica (3+3+1)
4. **Order (`#dostava`)** — 3 koraka: qty → method → adresa + code entry + summary + Pay
5. **Vendor (`#vendor`)** — 3-step flow + 3 tier kartice (bronca/srebro/zlato accent)
6. **Reviews (`#recenzije`)** — 3 user reviews (Marko, Paola, Goran)
7. **FAQ (`#faq`)** — 10 accordion items
8. **Newsletter + Footer**

---

## Ključne arhitektoralne odluke

### Fraud prevention (Apps Script)
- **Self-code block**: ne možeš koristiti vlastiti kod (validate normalizira email — `marko@gmail.com` == `m.a.r.k.o@gmail.com` == `marko+test@gmail.com`)
- **Velocity flag**: 3+ kupnji u 24h sa istog email-a → flag u `Suspicious` sheet
- **Paid/pending status**: leaderboard broji samo `paid` narudžbe, ne `pending`
- **Code generation gating**: kod se ne može generirat bez prve plaćene narudžbe + Google sign-in

### VIP / promo kodovi (v8)
- Admin može kreirati custom kod sa custom popustom (€10, €15, koliko god)
- Standardni kodovi automatski €5 popust za sve verified kupce
- Više detalja: pogledaj komentar header u `apps-script-v8.gs`

### Tier sustav (samo frontend, backend ne enforce-a)
- 3 preporuke = besplatan BURA Vape
- 6 preporuka = još jedan
- 10 preporuka = još jedan + early access novim okusima
- Brojač se ne resetira

### i18n
- Default HR; Pula auto-detected EN (jer turistička sezona)
- 200+ keys × 2 jezika u `I18N` objektu (u `<script>` blocku)
- `data-i18n` attributi na svakom textual element-u
- `applyI18n()` čita atribute i mijenja text
- HTML stringovi (sa tagovima) idu kroz `innerHTML`, ostali kroz `textContent`

### City config
- `CITY_CONFIG` objekt u JS-u
- Zagreb (default HR jezik, cijene €40/€80/€100, pickup `zg`)
- Pula (default EN jezik, cijene €44.99/€89/€119 — turistički markup)

---

## Apps Script setup

1. Otvori Google Sheets gdje želiš spremati podatke
2. Extensions → Apps Script → zalijepi sadržaj iz `apps-script-v8.gs`
3. **PROMIJENI `ADMIN_TOKEN`** na vrhu fajla (linija 28)
4. Save → Deploy → New deployment → "Web app" → Execute as `Me`, Who has access `Anyone`
5. Kopiraj Web App URL i zalijepi u `index.html` → `TRACKING_ENDPOINT` const (search za string `script.google.com/macros/s/`)
6. Test endpoint: otvori `<URL>?action=health` → treba vratit `{status: "ok", version: 8}`

### Admin endpoints
```
?action=markPaid&orderId=15&token=YOUR_TOKEN
?action=adminStats&token=YOUR_TOKEN
?action=createVipCode&code=MARKO-VIP&owner=Marko&email=marko@gmail.com&discount=10&token=YOUR_TOKEN
?action=listVipCodes&token=YOUR_TOKEN
?action=deactivateCode&code=MARKO-VIP&token=YOUR_TOKEN
```

---

## Google Sign-In setup

OAuth Client ID je u `index.html` (search za `905021688082-`).

Treba dodati u **Authorized JavaScript origins** sve domene gdje sajt živi:
- `https://bura-shop.pages.dev` (Cloudflare default)
- `https://burashop.hr` (custom domain)
- `https://www.burashop.hr`
- `http://localhost:8080` (za lokalni dev)

---

## Lokalno pokretanje

```bash
# 1. Kopiraj config template
cp config.template.sh config.local.sh

# 2. Popuni config.local.sh sa svojim secrets (vidi DEPLOY.md)
nano config.local.sh

# 3. Build:
bash deploy.sh

# 4. Serve:
cd deploy
python3 -m http.server 8080
# Open http://localhost:8080
```

Google Sign-In neće raditi na `file://` URL-u, treba HTTP server. Apps Script endpoint radi normalno (cross-origin GET). Treba dodati `http://localhost:8080` u Authorized JavaScript origins u Google Cloud Console.

---

## Što treba još napraviti

- [ ] Custom domain `burashop.hr` + dodaj u Google OAuth origins
- [ ] Meta Pixel ID + GA4 Measurement ID (trenutni su placeholderi — search `META_PIXEL_ID`, `GA_MEASUREMENT_ID`)
- [ ] Pravne stranice: ToS, Privacy Policy (GDPR), Cookie consent banner
- [ ] WhatsApp Business setup za `+385 99 850 3864`
- [ ] Real product photos (trenutne su mockup)
- [ ] Looker Studio dashboard nad Apps Script sheet-ovima
- [ ] Pula sezona launch (6.6.)

---

## Poznati gotcha-i

- **Sve je u jednom HTML fajlu** — refaktoriranje u module je hold-off za sada, jer Cloudflare Pages deploy je 1 fajl drag-drop
- **Apps Script je sync, ne async** — sve fetch pozive iz frontenda treba pažljivo handlat sa timeoutom (default je već 8s)
- **iOS Safari + gradient-text bug** — postoje override-i u mobile media queryu (`@media max-width: 768px`)
- **Apostrofi u i18n stringovima** — single-quoted JS string + apostrof unutar = parser break. Koristi double-quote wrap (`"don't"`) ili escape (`'don\\'t'`)
- **localStorage persist** — code state se spema (`buraActiveCode`, `buraActiveCodeDiscount`). U dev mode ručno clear iz dev tools

---

## Kontakt

Vlasnik projekta: BURA team
Instagram: [@buravape](https://instagram.com/buravape)
WhatsApp: +385 99 850 3864
