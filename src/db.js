import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

let db = null;
let sqlite = null;
const STORAGE_KEY = 'budget_bharat_sqlite_fallback_v1';
const SQLITE_KEY = 'app_state';

const emptyData = () => ({
  transactions: [],
  persons: [],
  loans: [],
  categories: { expense: [], income: [] },
  admin: { name: '', contact: '', email: '', headerNote: '', footerNote: '' }
});

const readWebData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeData(parsed);
    }
  } catch (e) {
    console.warn('Unable to read local web data.', e);
  }
  return emptyData();
};

const normalizeData = (data) => {
  const source = data && typeof data === 'object' ? data : {};
  return {
    transactions: Array.isArray(source.transactions) ? source.transactions : [],
    persons: Array.isArray(source.persons) ? source.persons : [],
    loans: Array.isArray(source.loans) ? source.loans : [],
    categories: {
      expense: Array.isArray(source.categories?.expense) ? source.categories.expense : [],
      income: Array.isArray(source.categories?.income) ? source.categories.income : []
    },
    admin: source.admin && typeof source.admin === 'object' ? source.admin : emptyData().admin
  };
};

const saveWebData = (data) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeData(data))); }
  catch (e) { throw new Error('Local storage is unavailable or full.'); }
};

export const initDB = async () => {
  if (db || !Capacitor.isNativePlatform()) return db;
  try {
    sqlite = new SQLiteConnection(CapacitorSQLite);
    const isConn = (await sqlite.isConnection('budget_bharat_db', false)).result;
    db = isConn
      ? await sqlite.retrieveConnection('budget_bharat_db', false)
      : await sqlite.createConnection('budget_bharat_db', false, 'no-encryption', 1, false);
    await db.open();
    await db.execute('CREATE TABLE IF NOT EXISTS app_data (key TEXT PRIMARY KEY, value TEXT NOT NULL);');

    const existing = await db.query('SELECT value FROM app_data WHERE key = ?', [SQLITE_KEY]);
    if (!existing.values?.length) {
      const migrated = readWebData();
      await db.run('INSERT OR REPLACE INTO app_data(key, value) VALUES (?, ?)', [SQLITE_KEY, JSON.stringify(migrated)]);
    }
    return db;
  } catch (e) {
    db = null;
    console.warn('Native SQLite unavailable, using web fallback store.', e);
    return null;
  }
};

const getData = async () => {
  await initDB();
  if (db) {
    const result = await db.query('SELECT value FROM app_data WHERE key = ?', [SQLITE_KEY]);
    if (result.values?.length) return normalizeData(JSON.parse(result.values[0].value));
    const fresh = emptyData();
    await saveData(fresh);
    return fresh;
  }
  return readWebData();
};

const saveData = async (data) => {
  const normalized = normalizeData(data);
  await initDB();
  if (db) {
    await db.run('INSERT OR REPLACE INTO app_data(key, value) VALUES (?, ?)', [SQLITE_KEY, JSON.stringify(normalized)]);
  } else {
    saveWebData(normalized);
  }
  return normalized;
};

const csvEscape = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rowsToCsv = (headers, rows) => [headers.join(',')]
  .concat(rows.map(r => headers.map(h => csvEscape(r[h])).join(',')))
  .join('\n');

const flowSummaryCsv = (transactions, type) => {
  const rows = transactions.filter(t => t.type === type);
  const total = rows.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const map = {};
  rows.forEach(t => {
    const key = t.category || '(Uncategorized)';
    if (!map[key]) map[key] = { amount: 0, count: 0 };
    map[key].amount += Number(t.amount) || 0;
    map[key].count += 1;
  });
  const out = Object.keys(map).sort((a, b) => map[b].amount - map[a].amount).map(k => ({
    Category: k,
    'Total Amount': map[k].amount,
    'Transaction Count': map[k].count,
    '% of Total': total ? ((map[k].amount / total) * 100).toFixed(1) + '%' : '0.0%'
  }));
  out.push({ Category: 'TOTAL', 'Total Amount': total, 'Transaction Count': rows.length, '% of Total': '100.0%' });
  return rowsToCsv(['Category', 'Total Amount', 'Transaction Count', '% of Total'], out);
};

const personsBalances = (persons, transactions) => persons.map(p => {
  let dr = 0, cr = 0;
  transactions.filter(t => t.person === p.name).forEach(t => {
    if (t.type === 'LENT') dr += Number(t.amount) || 0;
    if (t.type === 'BORROW') cr += Number(t.amount) || 0;
  });
  const bal = dr - cr;
  return { ...p, totalDr: dr, totalCr: cr, remaining: bal, status: bal > 0 ? 'RECEIVABLE' : bal < 0 ? 'PAYABLE' : 'SETTLED' };
});

export const BackendBridge = {
  getDashboardPayload: async () => getData(),

  addTransaction: async (tx) => {
    const data = await getData();
    data.transactions.unshift({ ...tx, id: 'tx_' + Date.now() });
    return saveData(data);
  },
  updateTransaction: async (tx) => {
    const data = await getData();
    data.transactions = data.transactions.map(t => (String(t.id || t.entryId) === String(tx.id || tx.entryId) ? { ...t, ...tx } : t));
    return saveData(data);
  },
  deleteTransaction: async (id) => {
    const data = await getData();
    data.transactions = data.transactions.filter(t => String(t.id || t.entryId) !== String(id));
    return saveData(data);
  },
  addPerson: async (p) => {
    const data = await getData();
    if (!data.persons.some(item => item.name.toLowerCase() === p.name.toLowerCase())) data.persons.push({ id: 'p_' + Date.now(), ...p });
    return saveData(data);
  },
  updatePerson: async (p) => {
    const data = await getData();
    data.persons = data.persons.map(item => item.name === p.oldName ? { ...item, ...p } : item);
    return saveData(data);
  },
  deletePerson: async (name) => {
    const data = await getData();
    data.persons = data.persons.filter(p => p.name !== name);
    data.transactions = data.transactions.filter(t => t.person !== name);
    return saveData(data);
  },
  addCategory: async (type, name) => {
    const data = await getData();
    const target = type === 'income' ? data.categories.income : data.categories.expense;
    if (!target.includes(name)) target.push(name);
    return saveData(data);
  },
  updateCategory: async (oldData, newData) => {
    const data = await getData();
    const target = oldData.type === 'income' ? data.categories.income : data.categories.expense;
    const idx = target.indexOf(oldData.oldName);
    if (idx !== -1) target[idx] = newData.newName;
    return saveData(data);
  },
  deleteCategory: async (catData) => {
    const data = await getData();
    const target = catData.type === 'income' ? data.categories.income : data.categories.expense;
    const idx = target.indexOf(catData.name);
    if (idx !== -1) target.splice(idx, 1);
    return saveData(data);
  },
  updateAdminConfig: async (admin) => {
    const data = await getData();
    data.admin = { ...data.admin, ...admin };
    return saveData(data);
  },
  saveLoan: async (loan) => {
    const data = await getData();
    const idx = data.loans.findIndex(l => l.id === loan.id);
    if (idx >= 0) data.loans[idx] = loan;
    else data.loans.unshift(loan);
    return saveData(data);
  },
  deleteLoan: async (loanId) => {
    const data = await getData();
    data.loans = data.loans.filter(l => l.id !== loanId);
    return saveData(data);
  },

  restoreFullBackup: async (parsed) => {
    const merged = normalizeData(parsed);
    return saveData(merged);
  },

  exportTransactionsCsv: async () => {
    const { transactions } = await getData();
    return rowsToCsv(['id', 'type', 'amount', 'category', 'person', 'date', 'note', 'ref', 'promiseDate'], transactions);
  },
  exportIncomeSummaryCsv: async () => flowSummaryCsv((await getData()).transactions, 'INCOME'),
  exportExpenseSummaryCsv: async () => flowSummaryCsv((await getData()).transactions, 'EXPENSE'),
  exportAllExpensesCsv: async () => rowsToCsv(['id', 'date', 'category', 'amount', 'note', 'ref'], (await getData()).transactions.filter(t => t.type === 'EXPENSE')),
  exportAllIncomesCsv: async () => rowsToCsv(['id', 'date', 'category', 'amount', 'note', 'ref'], (await getData()).transactions.filter(t => t.type === 'INCOME')),
  exportPersonsSummaryCsv: async () => {
    const { persons, transactions } = await getData();
    const rows = personsBalances(persons, transactions).sort((a, b) => Math.abs(b.remaining) - Math.abs(a.remaining)).map(p => ({
      Person: p.name, Phone: p.phone, Address: p.address, 'Total Given (Dr)': p.totalDr, 'Total Received (Cr)': p.totalCr, Balance: Math.abs(p.remaining), Status: p.status
    }));
    return rowsToCsv(['Person', 'Phone', 'Address', 'Total Given (Dr)', 'Total Received (Cr)', 'Balance', 'Status'], rows);
  },
  exportReceivablesCsv: async () => {
    const { persons, transactions } = await getData();
    const rows = personsBalances(persons, transactions).filter(p => p.remaining > 0).sort((a, b) => b.remaining - a.remaining).map(p => ({ Person: p.name, Phone: p.phone, 'Amount Receivable': p.remaining }));
    return rowsToCsv(['Person', 'Phone', 'Amount Receivable'], rows);
  },
  exportPayablesCsv: async () => {
    const { persons, transactions } = await getData();
    const rows = personsBalances(persons, transactions).filter(p => p.remaining < 0).sort((a, b) => Math.abs(b.remaining) - Math.abs(a.remaining)).map(p => ({ Person: p.name, Phone: p.phone, 'Amount Payable': Math.abs(p.remaining) }));
    return rowsToCsv(['Person', 'Phone', 'Amount Payable'], rows);
  },
  exportActiveLoansSummaryCsv: async () => {
    const { loans } = await getData();
    const rows = loans.map(l => {
      const schedule = l.schedule || [];
      return { 'Loan Name': l.loanName, Person: l.person, 'Loan Amount': l.loanAmount, 'Monthly EMI': l.monthlyEmi, 'EMI Paid': `${schedule.filter(s => s.paid).length}/${schedule.length}`, Status: l.status };
    });
    return rowsToCsv(['Loan Name', 'Person', 'Loan Amount', 'Monthly EMI', 'EMI Paid', 'Status'], rows);
  },
  exportAllLoanEmiRecordsCsv: async () => {
    const { loans } = await getData();
    const rows = [];
    loans.forEach(l => (l.schedule || []).forEach(s => rows.push({ 'Loan Name': l.loanName, Person: l.person, 'EMI No': s.emiNo, Date: s.date, 'EMI Amount': s.emiAmount, 'Outstanding Bal': s.outstandingBal, Paid: s.paid ? 'Yes' : 'No', 'Who Paid': s.whoPaid, 'Txn Id': s.paymentId, 'Paid Date': s.paidDate })));
    return rowsToCsv(['Loan Name', 'Person', 'EMI No', 'Date', 'EMI Amount', 'Outstanding Bal', 'Paid', 'Who Paid', 'Txn Id', 'Paid Date'], rows);
  }
};
