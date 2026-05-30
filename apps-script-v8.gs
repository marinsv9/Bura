/**
 * BURA Vendor Tracking — Apps Script v8 (FINAL)
 *
 * NOVO u v8:
 *  • VIP kodovi — admin može kreirat custom kod sa custom popustom (npr €10)
 *  • Users sheet ima novi stupac "DiscountPerPiece" (default 5, VIP = 10+)
 *  • validateCode endpoint vraća discountPerPiece da frontend zna iznos
 *  • Admin endpoints: createVipCode, listVipCodes, deactivateCode
 *
 * Iz v7 zadržano:
 *  • Newsletter, fraud prevention, paid status, leaderboard
 *
 * 📋 DEPLOY:
 *  1. Otvori Google Sheets BURA Vendor Tracking
 *  2. Extensions → Apps Script → ZAMIJENI cijeli kod ovim v8
 *  3. NA VRHU PROMIJENI ADMIN_TOKEN u nešto svoje!
 *  4. Save → Deploy → Manage deployments → ✏️ Edit → "New version" → Deploy
 *  5. URL ostaje isti.
 *
 * 🔑 ADMIN ENDPOINTS:
 *  • ?action=markPaid&orderId=15&token=YOUR_TOKEN
 *  • ?action=adminStats&token=YOUR_TOKEN
 *  • ?action=newsletter&token=YOUR_TOKEN
 *  • ?action=createVipCode&code=MARKO-VIP&owner=Marko&email=marko@gmail.com&discount=10&token=YOUR_TOKEN
 *  • ?action=listVipCodes&token=YOUR_TOKEN
 *  • ?action=deactivateCode&code=MARKO-VIP&token=YOUR_TOKEN
 */

const ADMIN_TOKEN = 'CHANGE-ME-BEFORE-DEPLOY';  // ⚠️ Generiraj random string (npr. otvori https://www.uuidgenerator.net) i zalijepi ovdje

const CODES_SHEET = 'Codes';
const USERS_SHEET = 'Users';
const ORDERS_SHEET = 'Orders';
const SUSPICIOUS_SHEET = 'Suspicious';
const NEWSLETTER_SHEET = 'Newsletter';  // NEW
// Tier thresholds: prvi tier = 3 preporuka, drugi = 7, treci = 12
const TIER1 = 3;
const TIER2 = 7;
const TIER3 = 12;
const GOAL = TIER1;  // For backward compat — frontend uses this as "next milestone"
const DEFAULT_DISCOUNT = 5;  // €5 popust po komadu za standardne kodove

// ============================================================
// doPost — sve write akcije
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'registerCode') return registerCode(body);
    if (body.action === 'registerOrder') return registerOrder(body, e);
    if (body.action === 'newsletter') return registerNewsletter(body);
    return logUsage(body);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function logUsage(body) {
  const code = (body.code || '').toString().trim().toUpperCase();
  if (!code) return jsonResponse({ error: 'no code' });
  const combo = (body.combo || 'general').toString().slice(0, 50);
  const ts = body.timestamp || new Date().toISOString();
  const referrer = (body.referrer || '').toString().slice(0, 200);
  const city = (body.city || '').toString().slice(0, 20);
  const lang = (body.lang || '').toString().slice(0, 5);

  const sheet = getOrCreateSheet(CODES_SHEET, ['Timestamp', 'Code', 'Combo', 'Referrer', 'City', 'Lang']);
  sheet.appendRow([new Date(ts), code, combo, referrer, city, lang]);
  return jsonResponse({ status: 'ok', code: code });
}

function registerCode(body) {
  const email = (body.email || '').toString().trim().toLowerCase();
  const name = (body.name || '').toString().slice(0, 100);
  const code = (body.code || '').toString().trim().toUpperCase();
  if (!email || !code) return jsonResponse({ error: 'email and code required' });

  // Users sheet schema: Timestamp | Email | Name | Code | NormalizedEmail | DiscountPerPiece | Active | Type
  const sheet = getOrCreateSheet(USERS_SHEET,
    ['Timestamp', 'Email', 'Name', 'Code', 'NormalizedEmail', 'DiscountPerPiece', 'Active', 'Type']);
  const data = sheet.getDataRange().getValues();
  const normEmail = normalizeEmail(email);

  // Provjeri da li email već ima registriran kod
  for (let i = 1; i < data.length; i++) {
    const rowEmail = (data[i][1] || '').toString().toLowerCase();
    const rowNorm = (data[i][4] || '').toString() || normalizeEmail(rowEmail);
    if (rowEmail === email || rowNorm === normEmail) {
      return jsonResponse({ status: 'exists', code: data[i][3], registered: data[i][0] });
    }
  }

  // Auto-suffix ako je kod već zauzet
  let finalCode = code;
  let attempt = 0;
  while (codeTaken(data, finalCode) && attempt < 50) {
    attempt++;
    finalCode = code + attempt;
  }
  if (codeTaken(data, finalCode)) {
    return jsonResponse({ status: 'code_taken', code: finalCode });
  }

  sheet.appendRow([new Date(), email, name, finalCode, normEmail, DEFAULT_DISCOUNT, true, 'standard']);
  return jsonResponse({ status: 'registered', code: finalCode });
}

// Gmail+1 normalization — sprječava self-fraud preko gmail aliases
function normalizeEmail(email) {
  if (!email) return '';
  email = email.toLowerCase().trim();
  const [local, domain] = email.split('@');
  if (!domain) return email;
  let normLocal = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    normLocal = normLocal.replace(/\./g, '');
  }
  return normLocal + '@' + domain;
}

function codeTaken(data, code) {
  const up = code.toUpperCase();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][3] || '').toString().toUpperCase() === up) return true;
  }
  return false;
}

function registerOrder(body, e) {
  const email = (body.email || '').toString().trim().toLowerCase();
  const name = (body.name || '').toString().slice(0, 100);
  const qty = parseInt(body.qty || 1, 10);
  const method = (body.method || '').toString().slice(0, 30);
  const total = parseFloat(body.total || 0);
  const address = (body.address || '').toString().slice(0, 300);
  const codeUsed = (body.codeUsed || '').toString().trim().toUpperCase();
  const city = (body.city || 'zagreb').toString().slice(0, 20);
  const lang = (body.lang || 'hr').toString().slice(0, 5);
  const userAgent = (body.userAgent || '').toString().slice(0, 250);
  const referrer = (body.referrer || '').toString().slice(0, 200);

  let fraudFlag = '';

  // FRAUD CHECK 1: User koristi vlastiti kod
  if (codeUsed && email) {
    const ownCode = getUserCode(email).code;
    if (ownCode && ownCode.toUpperCase() === codeUsed) {
      fraudFlag = 'self_code';
      logSuspicious(email, '', `Self-code: ${email} → ${codeUsed}`);
    }
  }

  // FRAUD CHECK 2: Velocity — 3+ narudžbi/email/24h
  if (email) {
    const orderSheet = getOrCreateSheet(ORDERS_SHEET,
      ['Timestamp', 'Email', 'Name', 'Qty', 'Method', 'Total', 'Address', 'CodeUsed', 'Status',
       'FraudFlag', 'City', 'Lang', 'UserAgent', 'Referrer']);
    const orders = orderSheet.getDataRange().getValues();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let recentCount = 0;
    for (let i = 1; i < orders.length; i++) {
      if ((orders[i][1] || '').toString().toLowerCase() === email && orders[i][0] > dayAgo) {
        recentCount++;
      }
    }
    if (recentCount >= 3) {
      fraudFlag = fraudFlag ? fraudFlag + ',velocity_24h' : 'velocity_24h';
      logSuspicious(email, '', `Velocity: ${recentCount + 1} orders/24h`);
    }
  }

  const sheet = getOrCreateSheet(ORDERS_SHEET,
    ['Timestamp', 'Email', 'Name', 'Qty', 'Method', 'Total', 'Address', 'CodeUsed', 'Status',
     'FraudFlag', 'City', 'Lang', 'UserAgent', 'Referrer']);
  sheet.appendRow([new Date(), email, name, qty, method, total, address, codeUsed, 'pending',
                   fraudFlag, city, lang, userAgent, referrer]);
  return jsonResponse({ status: 'ok', fraudFlag });
}

// NEW: registerNewsletter
function registerNewsletter(body) {
  const email = (body.email || '').toString().trim().toLowerCase();
  if (!email || !email.includes('@')) return jsonResponse({ error: 'invalid email' });

  const city = (body.city || 'zagreb').toString().slice(0, 20);
  const lang = (body.lang || 'hr').toString().slice(0, 5);

  const sheet = getOrCreateSheet(NEWSLETTER_SHEET, ['Timestamp', 'Email', 'City', 'Lang']);
  const data = sheet.getDataRange().getValues();

  // Skip duplicates
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '').toString().toLowerCase() === email) {
      return jsonResponse({ status: 'exists' });
    }
  }

  sheet.appendRow([new Date(), email, city, lang]);
  return jsonResponse({ status: 'subscribed' });
}

function logSuspicious(email, ip, reason) {
  const sheet = getOrCreateSheet(SUSPICIOUS_SHEET, ['Timestamp', 'Email', 'IP', 'Reason']);
  sheet.appendRow([new Date(), email, ip, reason]);
}

// ============================================================
// doGet — read endpoints
// ============================================================
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'health';

  if (action === 'leaderboard')   return jsonResponse(getLeaderboard());
  if (action === 'codeStats')     return jsonResponse(getCodeStatsValidated(e.parameter.code, e.parameter.email));
  if (action === 'getUserCode')   return jsonResponse(getUserCode(e.parameter.email));
  if (action === 'validateCode')  return jsonResponse(validateCodeForUser(e.parameter.code, e.parameter.email));
  if (action === 'markPaid')      return jsonResponse(adminMarkPaid(e.parameter));
  if (action === 'adminStats')    return jsonResponse(adminStats(e.parameter));
  if (action === 'newsletter')    return jsonResponse(adminNewsletter(e.parameter));
  if (action === 'createVipCode') return jsonResponse(adminCreateVipCode(e.parameter));
  if (action === 'listVipCodes')  return jsonResponse(adminListVipCodes(e.parameter));
  if (action === 'deactivateCode')return jsonResponse(adminDeactivateCode(e.parameter));
  if (action === 'health')        return jsonResponse({ status: 'ok', version: 8 });
  return jsonResponse({ error: 'unknown action: ' + action });
}

function validateCodeForUser(rawCode, rawEmail) {
  if (!rawCode) return { valid: false, reason: 'no_code' };
  const code = rawCode.toString().trim().toUpperCase();
  const email = (rawEmail || '').toString().trim().toLowerCase();

  const sheet = getOrCreateSheet(USERS_SHEET,
    ['Timestamp', 'Email', 'Name', 'Code', 'NormalizedEmail', 'DiscountPerPiece', 'Active', 'Type']);
  const data = sheet.getDataRange().getValues();

  let codeOwner = null;
  for (let i = 1; i < data.length; i++) {
    if ((data[i][3] || '').toString().toUpperCase() === code) {
      codeOwner = {
        email: (data[i][1] || '').toString().toLowerCase(),
        name: data[i][2],
        discount: parseFloat(data[i][5]) || DEFAULT_DISCOUNT,
        active: data[i][6] !== false && data[i][6] !== 'false' && data[i][6] !== 'FALSE',
        type: (data[i][7] || 'standard').toString()
      };
      break;
    }
  }
  if (!codeOwner) return { valid: false, reason: 'not_registered' };

  // Provjeri Active flag (deaktivirani kodovi nisu valjani)
  if (!codeOwner.active) {
    return { valid: false, reason: 'deactivated', message: 'Ovaj kod više nije aktivan.' };
  }

  // Block self-use (email norm match) — samo za standardne kodove
  // VIP kodovi mogu biti distributed by anyone (ti ih kreiraš s emailom vlasnika)
  if (email && codeOwner.type === 'standard') {
    const userNorm = normalizeEmail(email);
    const ownerNorm = normalizeEmail(codeOwner.email);
    if (userNorm === ownerNorm) {
      return { valid: false, reason: 'own_code', message: 'Ne možeš koristiti vlastiti kod.' };
    }
  }

  return {
    valid: true,
    code,
    name: codeOwner.name,
    discountPerPiece: codeOwner.discount,
    type: codeOwner.type
  };
}

function getLeaderboard() {
  // Samo PAID narudžbe se broje za leaderboard
  const ordersSheet = getOrCreateSheet(ORDERS_SHEET, []);
  const data = ordersSheet.getDataRange().getValues();
  const counts = {};
  for (let i = 1; i < data.length; i++) {
    const code = (data[i][7] || '').toString().trim().toUpperCase();
    const status = (data[i][8] || '').toString().toLowerCase();
    if (!code || status !== 'paid') continue;
    counts[code] = (counts[code] || 0) + 1;
  }
  return Object.keys(counts)
    .map(code => ({ code: code, count: counts[code] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
}

function getCodeStatsValidated(rawCode, rawEmail) {
  if (!rawCode) return { error: 'no code' };
  const code = rawCode.toString().trim().toUpperCase();
  const email = (rawEmail || '').toString().trim().toLowerCase();

  let isOwner = false;
  if (email) {
    const owner = getUserCode(email);
    if (owner && owner.code && owner.code.toUpperCase() === code) isOwner = true;
  }

  const sheet = getOrCreateSheet(ORDERS_SHEET, []);
  const data = sheet.getDataRange().getValues();
  let count = 0;
  const uses = [];
  for (let i = 1; i < data.length; i++) {
    if ((data[i][7] || '').toString().trim().toUpperCase() === code &&
        (data[i][8] || '').toString().toLowerCase() === 'paid') {
      count++;
      uses.push({
        date: data[i][0] instanceof Date ? data[i][0].toISOString() : data[i][0],
        method: (data[i][4] || '').toString()
      });
    }
  }
  // Calculate next tier and progress
  let nextGoal = TIER1;
  let currentTier = 0;
  if (count >= TIER3)      { nextGoal = TIER3; currentTier = 3; }
  else if (count >= TIER2) { nextGoal = TIER3; currentTier = 2; }
  else if (count >= TIER1) { nextGoal = TIER2; currentTier = 1; }

  return {
    code, count,
    goal: nextGoal,
    remaining: Math.max(0, nextGoal - count),
    currentTier,
    tiers: { tier1: TIER1, tier2: TIER2, tier3: TIER3 },
    uses: isOwner ? uses.slice(-20) : []
  };
}

function getUserCode(rawEmail) {
  if (!rawEmail) return { code: null };
  const email = rawEmail.toString().trim().toLowerCase();
  const sheet = getOrCreateSheet(USERS_SHEET, ['Timestamp', 'Email', 'Name', 'Code', 'NormalizedEmail']);
  const data = sheet.getDataRange().getValues();
  const norm = normalizeEmail(email);
  for (let i = 1; i < data.length; i++) {
    const rowEmail = (data[i][1] || '').toString().toLowerCase();
    if (rowEmail === email || normalizeEmail(rowEmail) === norm) {
      return {
        code: data[i][3],
        name: data[i][2],
        registered: data[i][0] instanceof Date ? data[i][0].toISOString() : data[i][0]
      };
    }
  }
  return { code: null };
}

// ============================================================
// ADMIN ENDPOINTS
// ============================================================
function adminMarkPaid(params) {
  if (params.token !== ADMIN_TOKEN) return { error: 'unauthorized' };
  const orderId = parseInt(params.orderId, 10);
  if (!orderId) return { error: 'no orderId' };

  const sheet = getOrCreateSheet(ORDERS_SHEET, []);
  const data = sheet.getDataRange().getValues();
  if (orderId >= data.length) return { error: 'order not found' };

  sheet.getRange(orderId + 1, 9).setValue('paid');
  return { status: 'ok', orderId, marked: 'paid' };
}

function adminStats(params) {
  if (params.token !== ADMIN_TOKEN) return { error: 'unauthorized' };
  const sheet = getOrCreateSheet(ORDERS_SHEET, []);
  const data = sheet.getDataRange().getValues();
  let pending = 0, paid = 0, flagged = 0, totalRevenue = 0;
  const byCity = { zagreb: 0, pula: 0 };
  for (let i = 1; i < data.length; i++) {
    const status = (data[i][8] || '').toString().toLowerCase();
    if (status === 'pending') pending++;
    else if (status === 'paid') { paid++; totalRevenue += parseFloat(data[i][5] || 0); }
    if (data[i][9]) flagged++;
    const city = (data[i][10] || 'zagreb').toString().toLowerCase();
    if (byCity[city] != null) byCity[city]++;
  }
  return { pending, paid, flagged, totalRevenue, total: data.length - 1, byCity };
}

function adminNewsletter(params) {
  if (params.token !== ADMIN_TOKEN) return { error: 'unauthorized' };
  const sheet = getOrCreateSheet(NEWSLETTER_SHEET, []);
  const data = sheet.getDataRange().getValues();
  const emails = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][1]) emails.push({ email: data[i][1], city: data[i][2], date: data[i][0] });
  }
  return { count: emails.length, emails };
}

// ============================================================
// VIP CODES — admin only
// ============================================================

/**
 * Kreira VIP kod sa custom popustom.
 * Primjer URL:
 *   ?action=createVipCode&code=MARKO-VIP&owner=Marko Maric&email=marko@gmail.com&discount=10&token=YOUR_TOKEN
 *
 * VIP kodovi:
 *   - Mogu biti korišteni neograničeno
 *   - Imaju custom discount (€10, €15, koliko god)
 *   - Email vlasnika je samo metadata (ne blokira self-use jer su VIP kodovi distributed)
 *   - Tip = 'vip' (razlikuje od standardnih)
 */
function adminCreateVipCode(params) {
  if (params.token !== ADMIN_TOKEN) return { error: 'unauthorized' };

  const code = (params.code || '').toString().trim().toUpperCase();
  const owner = (params.owner || '').toString().slice(0, 100);
  const email = (params.email || '').toString().trim().toLowerCase();
  const discount = parseFloat(params.discount) || 10;

  if (!code) return { error: 'code required (e.g. &code=MARKO-VIP)' };
  if (!owner) return { error: 'owner required (e.g. &owner=Marko)' };
  if (discount < 0 || discount > 40) return { error: 'discount must be 0-40' };

  const sheet = getOrCreateSheet(USERS_SHEET,
    ['Timestamp', 'Email', 'Name', 'Code', 'NormalizedEmail', 'DiscountPerPiece', 'Active', 'Type']);
  const data = sheet.getDataRange().getValues();

  // Provjeri da li kod već postoji
  for (let i = 1; i < data.length; i++) {
    if ((data[i][3] || '').toString().toUpperCase() === code) {
      return { error: 'code already exists', existingCode: code };
    }
  }

  const normEmail = email ? normalizeEmail(email) : '';
  sheet.appendRow([new Date(), email, owner, code, normEmail, discount, true, 'vip']);

  return {
    status: 'created',
    code,
    owner,
    email,
    discount,
    type: 'vip',
    shareUrl: `https://bura-shop.pages.dev/?code=${encodeURIComponent(code)}`
  };
}

/**
 * Lista sve VIP kodove sa statistikama.
 * ?action=listVipCodes&token=YOUR_TOKEN
 */
function adminListVipCodes(params) {
  if (params.token !== ADMIN_TOKEN) return { error: 'unauthorized' };

  const sheet = getOrCreateSheet(USERS_SHEET, []);
  const data = sheet.getDataRange().getValues();
  const vipCodes = [];

  // Prvo pronađi sve VIP kodove
  for (let i = 1; i < data.length; i++) {
    const type = (data[i][7] || 'standard').toString();
    if (type !== 'vip') continue;

    vipCodes.push({
      code: data[i][3],
      owner: data[i][2],
      email: data[i][1],
      discount: parseFloat(data[i][5]) || 0,
      active: data[i][6] !== false && data[i][6] !== 'false',
      created: data[i][0] instanceof Date ? data[i][0].toISOString() : data[i][0],
      uses: 0  // će biti popunjeno ispod
    });
  }

  // Brojanje korištenja iz Orders sheeta (samo paid)
  if (vipCodes.length > 0) {
    const ordersSheet = getOrCreateSheet(ORDERS_SHEET, []);
    const orders = ordersSheet.getDataRange().getValues();
    const codeToVip = {};
    vipCodes.forEach(v => { codeToVip[v.code.toUpperCase()] = v; });

    for (let i = 1; i < orders.length; i++) {
      const code = (orders[i][7] || '').toString().trim().toUpperCase();
      const status = (orders[i][8] || '').toString().toLowerCase();
      if (code && status === 'paid' && codeToVip[code]) {
        codeToVip[code].uses++;
      }
    }
  }

  return { count: vipCodes.length, codes: vipCodes };
}

/**
 * Deaktivira kod (i VIP i standardni). Postavlja Active = false.
 * ?action=deactivateCode&code=MARKO-VIP&token=YOUR_TOKEN
 */
function adminDeactivateCode(params) {
  if (params.token !== ADMIN_TOKEN) return { error: 'unauthorized' };

  const code = (params.code || '').toString().trim().toUpperCase();
  if (!code) return { error: 'code required' };

  const sheet = getOrCreateSheet(USERS_SHEET, []);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if ((data[i][3] || '').toString().toUpperCase() === code) {
      // Stupac G (index 6) = Active. Row index u sheetu = i + 1 (1-based)
      sheet.getRange(i + 1, 7).setValue(false);
      return { status: 'deactivated', code, owner: data[i][2] };
    }
  }
  return { error: 'code not found' };
}


function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length) {
      sheet.appendRow(headers);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
