import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const SPREADSHEET_NAME = 'Budget_Bharat_DB';
const CLOUD_ID_CACHE_PREFIX = 'bb_cloud_sheet_id_';
const LAST_SYNC_CACHE_PREFIX = 'bb_last_sync_';

const SHEET_HEADERS = {
  TRANS_RECORD: ['ENTRY_ID', 'Timestamp', 'Transaction Type', 'Date', 'Amount', 'Person', 'Category', 'Description', 'Reference A/c', 'Promise Date', 'Updated At'],
  Person_Config: ['Person ID', 'Person', 'Mobile No.', 'ADDRESS', 'Email Id'],
  Category: ['Expense Type', 'Income type'],
  Admin_config: ['NAME', 'CONTACT', 'Email id', 'Statement Header note', 'Statement Footer note'],
  LOANS_MASTER: ['Loan ID', 'Person', 'Loan Name', 'Loan Taken', 'Loan to Pay', 'Monthly EMI', 'Tenure Months', 'First EMI Date', 'Status'],
  Loan_EMI_Records: ['Loan ID', 'EMI No', 'Date', 'EMI Amount', 'Outstanding Bal', 'Paid', 'Who Paid', 'Txn. Id', 'Paid Date']
};

const RANGE_NAMES = Object.keys(SHEET_HEADERS);

const escapeDriveQuery = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const validateRows = (valueRanges) => {
  if (!Array.isArray(valueRanges) || valueRanges.length < RANGE_NAMES.length) {
    throw new Error('Cloud backup is incomplete: all six Budget Bharat sheets are required.');
  }
  valueRanges.forEach((range, index) => {
    const name = RANGE_NAMES[index];
    const expected = SHEET_HEADERS[name];
    const values = range && Array.isArray(range.values) ? range.values : [];
    if (!values.length || expected.some((header, i) => String(values[0]?.[i] || '').trim() !== header)) {
      throw new Error(`Cloud backup validation failed for ${name}. Local data was not changed.`);
    }
  });
};

export const GoogleDriveSync = {
  currentUser: null,
  inMemoryAccessToken: null,
  isSyncing: false,

  getCurrentUser: async function () {
    try {
      const user = await GoogleAuth.refresh();
      if (user && user.authentication && user.authentication.accessToken) {
        this.currentUser = user;
        this.inMemoryAccessToken = user.authentication.accessToken;
        return user;
      }
    } catch (e) {}
    return null;
  },

  login: async function () {
    try {
      const user = await GoogleAuth.signIn();
      this.currentUser = user;
      this.inMemoryAccessToken = user.authentication ? user.authentication.accessToken : null;
      return user;
    } catch (err) {
      const code = String(err?.code ?? err?.statusCode ?? err?.errorCode ?? '');
      if (code === '10' || String(err?.message || '').toLowerCase().includes('something went wrong')) {
        throw new Error('Google sign-in developer configuration error (code 10). The installed Android APK must be signed with a SHA-1 registered on the Android OAuth client for com.bharatrasve.budgetbharat.');
      }
      throw this._normalizeError(err, 'Sign-in canceled or failed.');
    }
  },

  logout: async function () {
    try { await GoogleAuth.signOut(); } catch (e) {}
    this.currentUser = null;
    this.inMemoryAccessToken = null;
  },

  getUserNamespace: function () {
    if (!this.currentUser) return 'anonymous';
    return String(this.currentUser.email || this.currentUser.id || 'default').toLowerCase().trim();
  },

  getCachedSheetId: function () {
    return localStorage.getItem(CLOUD_ID_CACHE_PREFIX + this.getUserNamespace()) || null;
  },

  setCachedSheetId: function (sheetId) {
    if (!sheetId) localStorage.removeItem(CLOUD_ID_CACHE_PREFIX + this.getUserNamespace());
    else localStorage.setItem(CLOUD_ID_CACHE_PREFIX + this.getUserNamespace(), sheetId);
  },

  getLastSyncTime: function () {
    return localStorage.getItem(LAST_SYNC_CACHE_PREFIX + this.getUserNamespace()) || null;
  },

  setLastSyncTime: function (isoString) {
    localStorage.setItem(LAST_SYNC_CACHE_PREFIX + this.getUserNamespace(), isoString);
  },

  ensureValidToken: async function () {
    if (this.inMemoryAccessToken) return this.inMemoryAccessToken;
    const user = await this.getCurrentUser();
    if (!user || !this.inMemoryAccessToken) throw new Error('Your Google session expired. Please sign in again.');
    return this.inMemoryAccessToken;
  },

  validateSheetAccessible: async function (sheetId) {
    try {
      const token = await this.ensureValidToken();
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheetId)}?fields=id,name,mimeType,trashed`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data && data.mimeType === 'application/vnd.google-apps.spreadsheet' && !data.trashed);
    } catch (e) {
      return false;
    }
  },

  getOrCreateSpreadsheet: async function (manualConnectId = null, allowCreate = true) {
    if (manualConnectId) {
      if (!(await this.validateSheetAccessible(manualConnectId))) throw new Error('The specified Spreadsheet ID could not be reached with this Google account.');
      this.setCachedSheetId(manualConnectId);
      return manualConnectId;
    }

    const cachedId = this.getCachedSheetId();
    if (cachedId) {
      if (await this.validateSheetAccessible(cachedId)) return cachedId;
      this.setCachedSheetId(null);
    }

    const token = await this.ensureValidToken();
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${escapeDriveQuery(SPREADSHEET_NAME)}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)&pageSize=10`, { headers: { Authorization: `Bearer ${token}` } });
    if (!searchRes.ok) throw this._normalizeError(await searchRes.json(), 'Unable to search Google Drive.');
    const searchData = await searchRes.json();

    if (searchData.files && searchData.files.length > 1) {
      throw new Error('Multiple Budget_Bharat_DB spreadsheets were found. Connect an exact Spreadsheet ID instead of choosing one automatically.');
    }
    if (searchData.files && searchData.files.length === 1) {
      const foundId = searchData.files[0].id;
      this.setCachedSheetId(foundId);
      return foundId;
    }
    if (!allowCreate) throw new Error('No Budget_Bharat_DB spreadsheet is connected. Create/connect one explicitly before restoring.');

    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: { title: SPREADSHEET_NAME },
        sheets: RANGE_NAMES.map(title => ({ properties: { title } }))
      })
    });
    if (!createRes.ok) throw this._normalizeError(await createRes.json(), 'Unable to create Budget_Bharat_DB spreadsheet on Drive.');
    const newSheet = await createRes.json();
    this.setCachedSheetId(newSheet.spreadsheetId);
    return newSheet.spreadsheetId;
  },

  pullFromCloud: async function (manualId = null) {
    if (this.isSyncing) throw new Error('A synchronization operation is already in progress.');
    this.isSyncing = true;
    try {
      const sheetId = await this.getOrCreateSpreadsheet(manualId, false);
      const token = await this.ensureValidToken();
      const ranges = ['TRANS_RECORD!A:K', 'Person_Config!A:E', 'Category!A:B', 'Admin_config!A:E', 'LOANS_MASTER!A:I', 'Loan_EMI_Records!A:I'];
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&')}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw this._normalizeError(await res.json(), 'Failed to retrieve data from Google Sheets.');
      const data = await res.json();
      validateRows(data.valueRanges);

      const transactions = data.valueRanges[0].values.slice(1).map(r => ({ id: r[0] || 'tx_' + Date.now(), entryId: r[0] || 'tx_' + Date.now(), type: r[2] === 'Given' ? 'LENT' : r[2] === 'Received' ? 'BORROW' : r[2], date: r[3] || '', amount: Number(r[4]) || 0, person: r[5] || '', category: r[6] || '', note: r[7] || '', ref: r[8] || '', promiseDate: r[9] || '' }));
      const persons = data.valueRanges[1].values.slice(1).map(r => ({ id: r[0] || 'p_' + Date.now(), personId: r[0] || 'p_' + Date.now(), name: r[1] || '', phone: r[2] || '', address: r[3] || '', email: r[4] || '' }));
      const catRows = data.valueRanges[2].values.slice(1);
      const categories = { expense: catRows.map(r => r[0]).filter(Boolean), income: catRows.map(r => r[1]).filter(Boolean) };
      const adminRow = data.valueRanges[3].values[1] || [];
      const admin = { name: adminRow[0] || '', contact: adminRow[1] || '', email: adminRow[2] || '', headerNote: adminRow[3] || '', footerNote: adminRow[4] || '' };
      const loansMasterRows = data.valueRanges[4].values.slice(1);
      const emiRows = data.valueRanges[5].values.slice(1);
      const scheduleByLoanId = {};
      emiRows.forEach(r => {
        const loanId = String(r[0] || '').trim();
        if (!loanId) return;
        if (!scheduleByLoanId[loanId]) scheduleByLoanId[loanId] = [];
        scheduleByLoanId[loanId].push({ emiNo: Number(r[1]) || 1, date: r[2] || '', emiAmount: Number(r[3]) || 0, outstandingBal: Number(r[4]) || 0, paid: r[5] === true || String(r[5]).toLowerCase() === 'true', whoPaid: r[6] || '', paymentId: r[7] || '', paidDate: r[8] || '' });
      });
      const loans = loansMasterRows.map(r => ({ id: r[0] || 'ln_' + Date.now(), person: r[1] || '', loanName: r[2] || '', principalAmount: Number(r[3]) || 0, loanAmount: Number(r[4]) || 0, monthlyEmi: Number(r[5]) || 0, tenureMonths: Number(r[6]) || 0, firstEmiDate: r[7] || '', status: r[8] || 'ACTIVE', schedule: scheduleByLoanId[r[0]] || [] }));
      this.setLastSyncTime(new Date().toISOString());
      return { transactions, persons, categories, admin, loans };
    } finally {
      this.isSyncing = false;
    }
  },

  pushToCloud: async function (localData, manualId = null) {
    if (this.isSyncing) throw new Error('A synchronization operation is already in progress.');
    this.isSyncing = true;
    try {
      const sheetId = await this.getOrCreateSpreadsheet(manualId, true);
      const token = await this.ensureValidToken();
      const txRows = [SHEET_HEADERS.TRANS_RECORD, ...(localData.transactions || []).map(t => [t.id || t.entryId, new Date().toISOString(), t.type === 'LENT' ? 'Given' : t.type === 'BORROW' ? 'Received' : t.type, t.date, t.amount, t.person, t.category, t.note, t.ref, t.promiseDate, new Date().toISOString()])];
      const personRows = [SHEET_HEADERS.Person_Config, ...(localData.persons || []).map(p => [p.id || p.personId, p.name, p.phone, p.address, p.email])];
      const maxCats = Math.max(localData.categories?.expense?.length || 0, localData.categories?.income?.length || 0);
      const catRows = [SHEET_HEADERS.Category];
      for (let i = 0; i < maxCats; i++) catRows.push([localData.categories?.expense?.[i] || '', localData.categories?.income?.[i] || '']);
      const adminRows = [SHEET_HEADERS.Admin_config, [localData.admin?.name || '', localData.admin?.contact || '', localData.admin?.email || '', localData.admin?.headerNote || '', localData.admin?.footerNote || '']];
      const loansMasterRows = [SHEET_HEADERS.LOANS_MASTER, ...(localData.loans || []).map(l => [l.id, l.person, l.loanName, l.principalAmount, l.loanAmount, l.monthlyEmi, l.tenureMonths, l.firstEmiDate, l.status])];
      const emiRows = [SHEET_HEADERS.Loan_EMI_Records];
      (localData.loans || []).forEach(l => (l.schedule || []).forEach(s => emiRows.push([l.id, s.emiNo, s.date, s.emiAmount, s.outstandingBal, s.paid, s.whoPaid || '', s.paymentId || '', s.paidDate || ''])));

      const clearRanges = ['TRANS_RECORD!A:K', 'Person_Config!A:E', 'Category!A:B', 'Admin_config!A:E', 'LOANS_MASTER!A:I', 'Loan_EMI_Records!A:I'];
      const clearRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchClear`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ranges: clearRanges }) });
      if (!clearRes.ok) throw this._normalizeError(await clearRes.json(), 'Cloud cleanup failed. Local data was not changed.');

      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: [
        { range: 'TRANS_RECORD!A1:K', values: txRows },
        { range: 'Person_Config!A1:E', values: personRows },
        { range: 'Category!A1:B', values: catRows },
        { range: 'Admin_config!A1:E', values: adminRows },
        { range: 'LOANS_MASTER!A1:I', values: loansMasterRows },
        { range: 'Loan_EMI_Records!A1:I', values: emiRows }
      ] }) });
      if (!updateRes.ok) throw this._normalizeError(await updateRes.json(), 'Cloud data write failed. The cloud may be empty after cleanup; retry the backup.');
      this.setLastSyncTime(new Date().toISOString());
    } finally {
      this.isSyncing = false;
    }
  },

  _normalizeError: function (rawError, defaultMsg) {
    if (!navigator.onLine) return new Error('Device is offline. Your local data remains safe.');
    if (typeof rawError === 'string') return new Error(rawError);
    if (rawError?.error?.message) return new Error(rawError.error.message);
    if (rawError?.message) return new Error(rawError.message);
    return new Error(defaultMsg);
  }
};
