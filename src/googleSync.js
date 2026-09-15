/**
 * src/googleSync.js
 * ------------------------------------------------------------------
 * Optional cloud backup/sync layer for Budget Bharat.
 *
 * - No centralized backend. Each user's own Google Drive holds a single
 *   spreadsheet ("Budget_Bharat_DB") that this app creates and manages
 *   under the narrow `drive.file` scope (the app can only see files it
 *   created or the user explicitly picked — never the user's other
 *   private Drive files).
 * - main.jsx never talks to Google APIs directly; it only calls the
 *   functions exported here.
 * - Every function is safe to call offline or when the user has never
 *   signed in — each one resolves/rejects with a plain Error whose
 *   .message is safe to show in a toast, and never throws something
 *   that could crash a React render.
 *
 * REQUIRES (see package.json / capacitor.config.json notes at the
 * bottom of the chat response, not invented here):
 *   - @codetrix-studio/capacitor-google-auth
 *   - A real OAuth Web Client ID configured in capacitor.config.json's
 *     GoogleAuth plugin block. This file never hardcodes one.
 * ------------------------------------------------------------------
 */

import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SPREADSHEET_NAME = 'Budget_Bharat_DB';
const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';

const SHEET_NAMES = {
  transactions: 'TRANS_RECORD',
  persons: 'Person_Config',
  categories: 'Category',
  admin: 'Admin_config',
  loans: 'LOANS_MASTER',
  loanEmi: 'Loan_EMI_Records'
};

const HEADERS = {
  [SHEET_NAMES.transactions]: ['ID', 'Type', 'Date', 'Amount', 'Person', 'Category', 'Description', 'Reference A/c', 'Promise Date'],
  [SHEET_NAMES.persons]: ['ID', 'Name', 'Phone', 'Address', 'Email'],
  [SHEET_NAMES.categories]: ['Type', 'Name'],
  [SHEET_NAMES.admin]: ['User Profile', 'Contact', 'Header Notes', 'Footer Notes'],
  [SHEET_NAMES.loans]: ['ID', 'Person', 'Loan Name', 'Principal', 'Total to Pay', 'EMI', 'Tenure', 'Date', 'Status'],
  [SHEET_NAMES.loanEmi]: ['Loan ID', 'EMI No', 'Date', 'Amount', 'Balance', 'Paid', 'Who Paid', 'Txn ID', 'Paid Date']
};

const USER_KEY = 'budget_bharat_google_user_v1';
let initialized = false;

/** Namespaced per signed-in email so switching Google accounts on the
 *  same device never mixes up which spreadsheet belongs to whom. */
const sheetIdKey = (email) => `budget_bharat_gsheet_id_v1__${String(email || 'unknown').toLowerCase()}`;

// ============================================================
// AUTH
// ============================================================

export const initGoogleAuth = async () => {
  if (initialized) return;
  try {
    await GoogleAuth.initialize({
      scopes: [DRIVE_SCOPE],
      grantOfflineAccess: false
    });
    initialized = true;
  } catch (err) {
    // Play Services missing, misconfigured client ID, etc. Cloud
    // features simply stay unavailable — offline app keeps working.
    console.warn('GoogleAuth.initialize failed — cloud features unavailable:', err);
  }
};

const persistUser = (user) => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify({
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      accessToken: user.authentication && user.authentication.accessToken,
      idToken: user.authentication && user.authentication.idToken,
      savedAt: Date.now()
    }));
  } catch (e) { /* non-fatal */ }
};

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

export const isSignedIn = () => !!getStoredUser();

export const signIn = async () => {
  await initGoogleAuth();
  try {
    const user = await GoogleAuth.signIn();
    if (!user || !user.authentication || !user.authentication.accessToken) {
      throw new Error('Google did not return a valid session.');
    }
    persistUser(user);
    return getStoredUser();
  } catch (err) {
    // Canceled sign-in, no Play Services, network issues, etc.
    const msg = (err && err.message) ? err.message : String(err);
    if (/cancel/i.test(msg)) throw new Error('Sign-in canceled.');
    throw new Error('Google Sign-In failed: ' + msg);
  }
};

export const signOut = async () => {
  try {
    await GoogleAuth.signOut();
  } catch (err) {
    console.warn('GoogleAuth.signOut error (ignored, clearing local session anyway):', err);
  }
  try { localStorage.removeItem(USER_KEY); } catch (e) { /* non-fatal */ }
};

/** Access tokens expire (~1hr). Called before every API request;
 *  refreshes silently and re-persists, or forces a clean re-sign-in
 *  error the UI can react to (e.g. "Session expired — sign in again"). */
const ensureFreshToken = async () => {
  const stored = getStoredUser();
  if (!stored) throw new Error('Not signed in to Google.');

  const ageMs = Date.now() - (stored.savedAt || 0);
  if (ageMs < 45 * 60 * 1000) return stored.accessToken; // still comfortably fresh

  await initGoogleAuth();
  try {
    const refreshed = await GoogleAuth.refresh();
    const merged = { ...stored, accessToken: refreshed.accessToken, idToken: refreshed.idToken || stored.idToken, savedAt: Date.now() };
    localStorage.setItem(USER_KEY, JSON.stringify(merged));
    return merged.accessToken;
  } catch (err) {
    throw new Error('Your Google session expired. Please sign in again.');
  }
};

// ============================================================
// LOW-LEVEL DRIVE / SHEETS REST HELPERS
// ============================================================

const driveFetch = async (path, options = {}) => {
  const token = await ensureFreshToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Drive API error (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
};

const sheetsFetch = async (path, options = {}) => {
  const token = await ensureFreshToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Sheets API error (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
};

// ============================================================
// SPREADSHEET DISCOVERY / CREATION
// ============================================================

const findSpreadsheetId = async (email) => {
  const cached = localStorage.getItem(sheetIdKey(email));
  if (cached) return cached;

  const q = encodeURIComponent(`name='${SPREADSHEET_NAME}' and mimeType='${SPREADSHEET_MIME}' and trashed=false`);
  const result = await driveFetch(`files?q=${q}&spaces=drive&fields=files(id,name)`);
  const found = result.files && result.files[0];
  if (found) {
    localStorage.setItem(sheetIdKey(email), found.id);
    return found.id;
  }
  return null;
};

const createSpreadsheet = async (email) => {
  const created = await driveFetch('files', {
    method: 'POST',
    body: JSON.stringify({ name: SPREADSHEET_NAME, mimeType: SPREADSHEET_MIME })
  });
  localStorage.setItem(sheetIdKey(email), created.id);
  return created.id;
};

/** Ensures all 6 app sheets exist (creating any that are missing) and
 *  removes Google's default "Sheet1" once our own tabs are in place.
 *  Never recreates a sheet that already exists — safe to call every
 *  time we connect. */
const ensureSheetStructure = async (spreadsheetId) => {
  const meta = await sheetsFetch(`${spreadsheetId}?fields=sheets.properties`);
  const existingTitles = (meta.sheets || []).map(s => s.properties.title);

  const wanted = Object.values(SHEET_NAMES);
  const toAdd = wanted.filter(name => !existingTitles.includes(name));

  const requests = toAdd.map(title => ({ addSheet: { properties: { title } } }));

  const hasDefaultSheet1 = existingTitles.includes('Sheet1') && !wanted.includes('Sheet1');
  if (requests.length > 0 || hasDefaultSheet1) {
    if (requests.length > 0) {
      await sheetsFetch(`${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({ requests })
      });
    }
    // Delete the leftover default tab only after our real sheets exist,
    // so the spreadsheet is never left with zero sheets mid-operation.
    if (hasDefaultSheet1) {
      const sheet1 = meta.sheets.find(s => s.properties.title === 'Sheet1');
      try {
        await sheetsFetch(`${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: sheet1.properties.sheetId } }] })
        });
      } catch (e) {
        // Non-fatal — an unused extra "Sheet1" tab is harmless.
        console.warn('Could not remove default Sheet1 (non-fatal):', e);
      }
    }
  }

  // Write header rows to any tab that's brand new (blank).
  if (toAdd.length > 0) {
    const data = toAdd.map(name => ({
      range: `${name}!A1`,
      values: [HEADERS[name]]
    }));
    await sheetsFetch(`${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data })
    });
  }
};

// ============================================================
// LOCAL <-> SHEET ROW MAPPING
// ============================================================

const val = (v) => (v === null || v === undefined) ? '' : v;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const localToRows = (localData) => {
  const transactions = (localData.transactions || []).map(t => [
    val(t.id || t.entryId), val(t.type), val(t.date), num(t.amount), val(t.person),
    val(t.category), val(t.note || t.description), val(t.ref || t.referenceAccount || t.reference || t.account), val(t.promiseDate)
  ]);

  const persons = (localData.persons || []).map(p => [
    val(p.id), val(p.name), val(p.phone), val(p.address), val(p.email)
  ]);

  const categories = [
    ...((localData.categories && localData.categories.expense) || []).map(name => ['Expense', name]),
    ...((localData.categories && localData.categories.income) || []).map(name => ['Income', name])
  ];

  const admin = localData.admin ? [[
    val(localData.admin.name), val(localData.admin.contact),
    val(localData.admin.headerNote), val(localData.admin.footerNote)
  ]] : [];

  const loans = (localData.loans || []).map(l => [
    val(l.id), val(l.person), val(l.loanName), num(l.principalAmount), num(l.loanAmount),
    num(l.monthlyEmi), num(l.tenureMonths), val(l.firstEmiDate), val(l.status)
  ]);

  const loanEmi = [];
  (localData.loans || []).forEach(l => {
    (l.schedule || []).forEach(s => {
      loanEmi.push([
        val(l.id), num(s.emiNo), val(s.date), num(s.emiAmount), num(s.outstandingBal),
        s.paid ? 'TRUE' : 'FALSE', val(s.whoPaid), val(s.paymentId), val(s.paidDate)
      ]);
    });
  });

  return { transactions, persons, categories, admin, loans, loanEmi };
};

const rowsToObjects = (headers, rows) => rows.map(row => {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
  return obj;
});

/** Converts whatever came back from the sheet (array-of-rows, first row
 *  = headers) into the app's local data shape. Tolerant of missing
 *  optional values, empty rows, and skips rows that can't be a real
 *  record rather than throwing. */
const sheetToLocal = (sheetsData) => {
  const get = (name) => sheetsData[name] || [];

  const txRows = get(SHEET_NAMES.transactions);
  const transactions = txRows.length > 1
    ? rowsToObjects(txRows[0], txRows.slice(1))
        .filter(r => r['ID'] || r['Amount'])
        .map(r => ({
          id: r['ID'], type: r['Type'], date: r['Date'], amount: num(r['Amount']),
          person: r['Person'], category: r['Category'], note: r['Description'],
          ref: r['Reference A/c'], promiseDate: r['Promise Date']
        }))
    : [];

  const pRows = get(SHEET_NAMES.persons);
  const persons = pRows.length > 1
    ? rowsToObjects(pRows[0], pRows.slice(1)).filter(r => r['Name']).map(r => ({
        id: r['ID'], name: r['Name'], phone: r['Phone'], address: r['Address'], email: r['Email']
      }))
    : [];

  const cRows = get(SHEET_NAMES.categories);
  const categories = { expense: [], income: [] };
  if (cRows.length > 1) {
    rowsToObjects(cRows[0], cRows.slice(1)).forEach(r => {
      if (!r['Name']) return;
      if (String(r['Type']).toLowerCase() === 'income') categories.income.push(r['Name']);
      else categories.expense.push(r['Name']);
    });
  }

  const aRows = get(SHEET_NAMES.admin);
  let admin = {};
  if (aRows.length > 1) {
    const rec = rowsToObjects(aRows[0], aRows.slice(1))[0] || {};
    admin = {
      name: rec['User Profile'] || '', contact: rec['Contact'] || '',
      headerNote: rec['Header Notes'] || '', footerNote: rec['Footer Notes'] || ''
    };
  }

  const lRows = get(SHEET_NAMES.loans);
  const loans = lRows.length > 1
    ? rowsToObjects(lRows[0], lRows.slice(1)).filter(r => r['ID']).map(r => ({
        id: r['ID'], person: r['Person'], loanName: r['Loan Name'],
        principalAmount: num(r['Principal']), loanAmount: num(r['Total to Pay']),
        monthlyEmi: num(r['EMI']), tenureMonths: num(r['Tenure']),
        firstEmiDate: r['Date'], status: r['Status'] || 'ACTIVE', schedule: []
      }))
    : [];

  const eRows = get(SHEET_NAMES.loanEmi);
  if (eRows.length > 1) {
    const byLoan = {};
    rowsToObjects(eRows[0], eRows.slice(1)).forEach(r => {
      const loanId = r['Loan ID'];
      if (!loanId) return;
      if (!byLoan[loanId]) byLoan[loanId] = [];
      byLoan[loanId].push({
        emiNo: num(r['EMI No']), date: r['Date'], emiAmount: num(r['Amount']),
        outstandingBal: num(r['Balance']),
        paid: String(r['Paid']).toUpperCase() === 'TRUE',
        whoPaid: r['Who Paid'], paymentId: r['Txn ID'], paidDate: r['Paid Date']
      });
    });
    loans.forEach(l => {
      l.schedule = (byLoan[l.id] || []).sort((a, b) => a.emiNo - b.emiNo);
    });
  }

  return { transactions, persons, categories, admin, loans };
};

const isMeaningfulData = (localOrCloudData) =>
  (localOrCloudData.transactions && localOrCloudData.transactions.length > 0) ||
  (localOrCloudData.persons && localOrCloudData.persons.length > 0) ||
  (localOrCloudData.loans && localOrCloudData.loans.length > 0);

// ============================================================
// READ / WRITE THE WHOLE SPREADSHEET (deterministic full-sheet
// replacement — never an unsafe append, so repeated syncs can't
// duplicate rows).
// ============================================================

const readAllSheets = async (spreadsheetId) => {
  const ranges = Object.values(SHEET_NAMES).map(name => `ranges=${encodeURIComponent(name + '!A1:Z20000')}`).join('&');
  const result = await sheetsFetch(`${spreadsheetId}/values:batchGet?${ranges}`);
  const byName = {};
  (result.valueRanges || []).forEach(vr => {
    const name = (vr.range || '').split('!')[0].replace(/^'|'$/g, '');
    byName[name] = vr.values || [];
  });
  return sheetToLocal(byName);
};

const writeAllSheets = async (spreadsheetId, localData) => {
  const rows = localToRows(localData);
  const data = [
    { range: `${SHEET_NAMES.transactions}!A2:Z20000`, values: [] }, // cleared below via a dedicated clear step
  ];

  // Clear each data range first (deterministic replace, not append),
  // then write headers + fresh rows in one batch.
  const clearRequests = Object.values(SHEET_NAMES).map(name => ({ range: `${name}!A1:Z20000` }));
  await sheetsFetch(`${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges: clearRequests.map(r => r.range) })
  });

  const writeData = [
    { range: `${SHEET_NAMES.transactions}!A1`, values: [HEADERS[SHEET_NAMES.transactions], ...rows.transactions] },
    { range: `${SHEET_NAMES.persons}!A1`, values: [HEADERS[SHEET_NAMES.persons], ...rows.persons] },
    { range: `${SHEET_NAMES.categories}!A1`, values: [HEADERS[SHEET_NAMES.categories], ...rows.categories] },
    { range: `${SHEET_NAMES.admin}!A1`, values: [HEADERS[SHEET_NAMES.admin], ...rows.admin] },
    { range: `${SHEET_NAMES.loans}!A1`, values: [HEADERS[SHEET_NAMES.loans], ...rows.loans] },
    { range: `${SHEET_NAMES.loanEmi}!A1`, values: [HEADERS[SHEET_NAMES.loanEmi], ...rows.loanEmi] }
  ];

  await sheetsFetch(`${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: writeData })
  });
};

// ============================================================
// PUBLIC SYNC ORCHESTRATION
// ============================================================

/** Call once, right after a successful sign-in (or automatically the
 *  first time the user taps Sync while signed in). Finds or creates
 *  the spreadsheet, then applies the initial-connection policy:
 *    - cloud has data  -> cloud wins, restore locally
 *    - cloud is empty  -> local wins, push local up
 *  Returns { direction: 'cloud' | 'local', data }. Caller (main.jsx)
 *  is responsible for persisting `data` locally when direction is
 *  'cloud', and for showing appropriate feedback either way. */
export const connectAndInitialSync = async (localData) => {
  const user = getStoredUser();
  if (!user) throw new Error('Not signed in to Google.');

  let spreadsheetId = await findSpreadsheetId(user.email);
  let justCreated = false;
  if (!spreadsheetId) {
    spreadsheetId = await createSpreadsheet(user.email);
    justCreated = true;
  }

  await ensureSheetStructure(spreadsheetId);

  if (justCreated) {
    await writeAllSheets(spreadsheetId, localData);
    return { direction: 'local', data: localData };
  }

  const cloudData = await readAllSheets(spreadsheetId);
  if (isMeaningfulData(cloudData)) {
    return { direction: 'cloud', data: cloudData };
  }

  await writeAllSheets(spreadsheetId, localData);
  return { direction: 'local', data: localData };
};

/** The manual "Sync" button once already connected: Local -> Cloud,
 *  authoritative overwrite. Does not read the cloud first. */
export const pushLocalToCloud = async (localData) => {
  const user = getStoredUser();
  if (!user) throw new Error('Not signed in to Google.');

  let spreadsheetId = await findSpreadsheetId(user.email);
  if (!spreadsheetId) spreadsheetId = await createSpreadsheet(user.email);
  await ensureSheetStructure(spreadsheetId);
  await writeAllSheets(spreadsheetId, localData);
  return { direction: 'local', data: localData };
};

/** Explicit "Restore from Cloud" action — Cloud -> Local, only when the
 *  user asks for it directly (e.g. after reinstalling the app). */
export const pullCloudToLocal = async () => {
  const user = getStoredUser();
  if (!user) throw new Error('Not signed in to Google.');

  const spreadsheetId = await findSpreadsheetId(user.email);
  if (!spreadsheetId) throw new Error('No cloud backup found for this account yet.');

  await ensureSheetStructure(spreadsheetId);
  const cloudData = await readAllSheets(spreadsheetId);
  return { direction: 'cloud', data: cloudData };
};
