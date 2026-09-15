import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const SPREADSHEET_NAME = 'Budget_Bharat_DB';
const CLOUD_ID_CACHE_PREFIX = 'bb_cloud_sheet_id_';
const LAST_SYNC_CACHE_PREFIX = 'bb_last_sync_';

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
    } catch (e) {
      // Session expired or device is offline
    }
    return null;
  },

  login: async function () {
    try {
      const user = await GoogleAuth.signIn();
      this.currentUser = user;
      this.inMemoryAccessToken = user.authentication ? user.authentication.accessToken : null;
      return user;
    } catch (err) {
      throw this._normalizeError(err, 'Sign-in canceled or failed.');
    }
  },

  logout: async function () {
    try {
      await GoogleAuth.signOut();
    } catch (e) {
      // Non-fatal cleanup
    }
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
    if (!sheetId) {
      localStorage.removeItem(CLOUD_ID_CACHE_PREFIX + this.getUserNamespace());
    } else {
      localStorage.setItem(CLOUD_ID_CACHE_PREFIX + this.getUserNamespace(), sheetId);
    }
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
    if (!user || !this.inMemoryAccessToken) {
      throw new Error('Your Google session expired. Please sign in again.');
    }
    return this.inMemoryAccessToken;
  },

  validateSheetAccessible: async function (sheetId) {
    try {
      const token = await this.ensureValidToken();
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sheetId)}?fields=id,name,trashed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data && !data.trashed);
    } catch (e) {
      return false;
    }
  },

  getOrCreateSpreadsheet: async function (manualConnectId = null) {
    if (manualConnectId) {
      const isValid = await this.validateSheetAccessible(manualConnectId);
      if (!isValid) throw new Error('The specified Spreadsheet ID could not be reached with this Google account.');
      this.setCachedSheetId(manualConnectId);
      return manualConnectId;
    }

    const cachedId = this.getCachedSheetId();
    if (cachedId) {
      const isValid = await this.validateSheetAccessible(cachedId);
      if (isValid) return cachedId;
      this.setCachedSheetId(null);
    }

    const token = await this.ensureValidToken();
    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        const foundId = searchData.files[0].id;
        this.setCachedSheetId(foundId);
        return foundId;
      }
    }

    // Initialize clean multi-sheet workbook
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: { title: SPREADSHEET_NAME },
        sheets: [
          { properties: { title: 'TRANS_RECORD' } },
          { properties: { title: 'Person_Config' } },
          { properties: { title: 'Category' } },
          { properties: { title: 'Admin_config' } },
          { properties: { title: 'LOANS_MASTER' } },
          { properties: { title: 'Loan_EMI_Records' } }
        ]
      })
    });

    if (!createRes.ok) {
      throw this._normalizeError(await createRes.json(), 'Unable to create Budget_Bharat_DB spreadsheet on Drive.');
    }

    const newSheet = await createRes.json();
    this.setCachedSheetId(newSheet.spreadsheetId);
    return newSheet.spreadsheetId;
  },

  pullFromCloud: async function (manualId = null) {
    if (this.isSyncing) throw new Error('A synchronization operation is already in progress.');
    this.isSyncing = true;
    try {
      const sheetId = await this.getOrCreateSpreadsheet(manualId);
      const token = await this.ensureValidToken();

      const ranges = [
        'TRANS_RECORD!A:K',
        'Person_Config!A:E',
        'Category!A:B',
        'Admin_config!A:E',
        'LOANS_MASTER!A:I',
        'Loan_EMI_Records!A:I'
      ];
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&')}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw this._normalizeError(await res.json(), 'Failed to retrieve data from Google Sheets.');
      const data = await res.json();
      if (!data.valueRanges || data.valueRanges.length < 6) return null;

      const transactions = (data.valueRanges[0].values || []).slice(1).map(r => ({
        id: r[0] || 'tx_' + Date.now(),
        entryId: r[0] || 'tx_' + Date.now(),
        type: r[2] === 'Given' ? 'LENT' : r[2] === 'Received' ? 'BORROW' : r[2],
        date: r[3] || '',
        amount: Number(r[4]) || 0,
        person: r[5] || '',
        category: r[6] || '',
        note: r[7] || '',
        ref: r[8] || '',
        promiseDate: r[9] || ''
      }));

      const persons = (data.valueRanges[1].values || []).slice(1).map(r => ({
        id: r[0] || 'p_' + Date.now(),
        personId: r[0] || 'p_' + Date.now(),
        name: r[1] || '',
        phone: r[2] || '',
        address: r[3] || '',
        email: r[4] || ''
      }));

      const catRows = (data.valueRanges[2].values || []).slice(1);
      const categories = {
        expense: catRows.map(r => r[0]).filter(Boolean),
        income: catRows.map(r => r[1]).filter(Boolean)
      };

      const adminRow = (data.valueRanges[3].values || [])[1] || [];
      const admin = {
        name: adminRow[0] || '',
        contact: adminRow[1] || '',
        email: adminRow[2] || '',
        headerNote: adminRow[3] || '',
        footerNote: adminRow[4] || ''
      };

      const loansMasterRows = (data.valueRanges[4].values || []).slice(1);
      const emiRows = (data.valueRanges[5].values || []).slice(1);

      const scheduleByLoanId = {};
      emiRows.forEach(r => {
        const loanId = String(r[0] || '').trim();
        if (!loanId) return;
        if (!scheduleByLoanId[loanId]) scheduleByLoanId[loanId] = [];
        scheduleByLoanId[loanId].push({
          emiNo: Number(r[1]) || 1,
          date: r[2] || '',
          emiAmount: Number(r[3]) || 0,
          outstandingBal: Number(r[4]) || 0,
          paid: r[5] === true || String(r[5]).toLowerCase() === 'true',
          whoPaid: r[6] || '',
          paymentId: r[7] || '',
          paidDate: r[8] || ''
        });
      });

      const loans = loansMasterRows.map(r => {
        const id = r[0] || 'ln_' + Date.now();
        return {
          id: id,
          person: r[1] || '',
          loanName: r[2] || '',
          principalAmount: Number(r[3]) || 0,
          loanAmount: Number(r[4]) || 0,
          monthlyEmi: Number(r[5]) || 0,
          tenureMonths: Number(r[6]) || 0,
          firstEmiDate: r[7] || '',
          status: r[8] || 'ACTIVE',
          schedule: scheduleByLoanId[id] || []
        };
      });

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
      const sheetId = await this.getOrCreateSpreadsheet(manualId);
      const token = await this.ensureValidToken();

      const txRows = [
        ['ENTRY_ID', 'Timestamp', 'Transaction Type', 'Date', 'Amount', 'Person', 'Category', 'Description', 'Reference A/c', 'Promise Date', 'Updated At'],
        ...(localData.transactions || []).map(t => [
          t.id || t.entryId,
          new Date().toISOString(),
          t.type === 'LENT' ? 'Given' : t.type === 'BORROW' ? 'Received' : t.type,
          t.date,
          t.amount,
          t.person,
          t.category,
          t.note,
          t.ref,
          t.promiseDate,
          new Date().toISOString()
        ])
      ];

      const personRows = [
        ['Person ID', 'Person', 'Mobile No.', 'ADDRESS', 'Email Id'],
        ...(localData.persons || []).map(p => [p.id || p.personId, p.name, p.phone, p.address, p.email])
      ];

      const maxCats = Math.max(localData.categories?.expense?.length || 0, localData.categories?.income?.length || 0);
      const catRows = [['Expense Type', 'Income type']];
      for (let i = 0; i < maxCats; i++) {
        catRows.push([
          localData.categories?.expense?.[i] || '',
          localData.categories?.income?.[i] || ''
        ]);
      }

      const adminRows = [
        ['NAME', 'CONTACT', 'Email id', 'Statement Header note', 'Statement Footer note'],
        [localData.admin?.name || '', localData.admin?.contact || '', localData.admin?.email || '', localData.admin?.headerNote || '', localData.admin?.footerNote || '']
      ];

      const loansMasterRows = [
        ['Loan ID', 'Person', 'Loan Name', 'Loan Taken', 'Loan to Pay', 'Monthly EMI', 'Tenure Months', 'First EMI Date', 'Status'],
        ...(localData.loans || []).map(l => [
          l.id,
          l.person,
          l.loanName,
          l.principalAmount,
          l.loanAmount,
          l.monthlyEmi,
          l.tenureMonths,
          l.firstEmiDate,
          l.status
        ])
      ];

      const emiRows = [
        ['Loan ID', 'EMI No', 'Date', 'EMI Amount', 'Outstanding Bal', 'Paid', 'Who Paid', 'Txn. Id', 'Paid Date']
      ];
      (localData.loans || []).forEach(l => {
        (l.schedule || []).forEach(s => {
          emiRows.push([
            l.id,
            s.emiNo,
            s.date,
            s.emiAmount,
            s.outstandingBal,
            s.paid,
            s.whoPaid || '',
            s.paymentId || '',
            s.paidDate || ''
          ]);
        });
      });

      const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            { range: 'TRANS_RECORD!A1:K', values: txRows },
            { range: 'Person_Config!A1:E', values: personRows },
            { range: 'Category!A1:B', values: catRows },
            { range: 'Admin_config!A1:E', values: adminRows },
            { range: 'LOANS_MASTER!A1:I', values: loansMasterRows },
            { range: 'Loan_EMI_Records!A1:I', values: emiRows }
          ]
        })
      });

      if (!updateRes.ok) throw this._normalizeError(await updateRes.json(), 'Cloud data write failed.');
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
