
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

let db = null;
const STORAGE_KEY = 'budget_bharat_sqlite_fallback_v1';

const getFallbackData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    transactions: [
      { id: '1', type: 'EXPENSE', amount: 450, category: 'Food', person: 'Self', date: '14/09/2026', note: 'Lunch', ref: 'Cash' },
      { id: '2', type: 'INCOME', amount: 25000, category: 'Salary', person: 'Employer', date: '01/09/2026', note: 'Monthly Salary', ref: 'Bank' }
    ],
    persons: [
      { id: 'p1', name: 'Self', phone: '', email: '', address: 'Maharashtra' },
      { id: 'p2', name: 'Employer', phone: '', email: '', address: 'Maharashtra' }
    ],
    loans: [],
    categories: {
      expense: ['Food', 'Rent', 'Utilities', 'Shopping', 'Transport'],
      income: ['Salary', 'Freelance', 'Investments', 'Gift']
    },
    admin: { name: 'Bharat Rasve', contact: '7218838122', email: '', headerNote: 'Official Accounting Summary', footerNote: 'Thank you for your business' }
  };
};

const saveFallbackData = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
};

export const initDB = async () => {
  if (db) return db;
  try {
    if (Capacitor.isNativePlatform()) {
      const sqlite = new SQLiteConnection(CapacitorSQLite);
      const ret = await sqlite.checkConnectionsConsistency();
      const isConn = (await sqlite.isConnection('budget_bharat_db', false)).result;
      if (isConn) {
        db = await sqlite.createConnection('budget_bharat_db', false, 'no-encryption', 1, false);
      } else {
        db = await sqlite.createConnection('budget_bharat_db', false, 'no-encryption', 1, false);
      }
      await db.open();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS app_data (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);
    }
  } catch (e) {
    console.warn('Native SQLite unavailable, using web fallback store.', e);
  }
  return db;
};

/** ============ CSV HELPERS ============
 * Shared by every export method below. Mirrors the escaping/section
 * conventions used by the full-backup exporter in main.jsx so a person
 * opening any of these CSVs in Excel/Sheets sees consistent formatting.
 */
const csvEscape = (v) => {
  const s = (v === null || v === undefined) ? '' : String(v);
  return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
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
  const out = Object.keys(map)
    .sort((a, b) => map[b].amount - map[a].amount)
    .map(k => ({
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
  getDashboardPayload: async () => {
    return getFallbackData();
  },
  addTransaction: async (tx) => {
    const data = getFallbackData();
    const newTx = { ...tx, id: 'tx_' + Date.now() };
    data.transactions.unshift(newTx);
    saveFallbackData(data);
    return data;
  },
  updateTransaction: async (tx) => {
    const data = getFallbackData();
    data.transactions = data.transactions.map(t => (String(t.id || t.entryId) === String(tx.id || tx.entryId) ? { ...t, ...tx } : t));
    saveFallbackData(data);
    return data;
  },
  deleteTransaction: async (id) => {
    const data = getFallbackData();
    data.transactions = data.transactions.filter(t => String(t.id || t.entryId) !== String(id));
    saveFallbackData(data);
    return data;
  },
  addPerson: async (p) => {
    const data = getFallbackData();
    if (!data.persons.some(item => item.name.toLowerCase() === p.name.toLowerCase())) {
      data.persons.push({ id: 'p_' + Date.now(), ...p });
      saveFallbackData(data);
    }
    return data;
  },
  updatePerson: async (p) => {
    const data = getFallbackData();
    data.persons = data.persons.map(item => (item.name === p.oldName ? { ...item, ...p } : item));
    saveFallbackData(data);
    return data;
  },
  deletePerson: async (name) => {
    const data = getFallbackData();
    data.persons = data.persons.filter(p => p.name !== name);
    data.transactions = data.transactions.filter(t => t.person !== name);
    saveFallbackData(data);
    return data;
  },
  addCategory: async (type, name) => {
    const data = getFallbackData();
    const target = type === 'income' ? data.categories.income : data.categories.expense;
    if (!target.includes(name)) {
      target.push(name);
      saveFallbackData(data);
    }
    return data;
  },
  updateCategory: async (oldData, newData) => {
    const data = getFallbackData();
    const target = oldData.type === 'income' ? data.categories.income : data.categories.expense;
    const idx = target.indexOf(oldData.oldName);
    if (idx !== -1) target[idx] = newData.newName;
    saveFallbackData(data);
    return data;
  },
  deleteCategory: async (catData) => {
    const data = getFallbackData();
    const target = catData.type === 'income' ? data.categories.income : data.categories.expense;
    const idx = target.indexOf(catData.name);
    if (idx !== -1) target.splice(idx, 1);
    saveFallbackData(data);
    return data;
  },
  updateAdminConfig: async (admin) => {
    const data = getFallbackData();
    data.admin = { ...data.admin, ...admin };
    saveFallbackData(data);
    return data;
  },
  saveLoan: async (loan) => {
    const data = getFallbackData();
    const idx = data.loans.findIndex(l => l.id === loan.id);
    if (idx >= 0) {
      data.loans[idx] = loan;
    } else {
      data.loans.unshift(loan);
    }
    saveFallbackData(data);
    return data;
  },
  deleteLoan: async (loanId) => {
    const data = getFallbackData();
    data.loans = data.loans.filter(l => l.id !== loanId);
    saveFallbackData(data);
    return data;
  },

  /** ============ FULL BACKUP RESTORE ============
   * Replaces ALL current data (including the starter sample rows) with
   * whatever was parsed from an imported backup CSV. Any section missing
   * from the file falls back to an empty shape rather than throwing.
   */
  restoreFullBackup: async (parsed) => {
    const merged = {
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      persons: Array.isArray(parsed.persons) ? parsed.persons : [],
      categories: {
        expense: (parsed.categories && Array.isArray(parsed.categories.expense)) ? parsed.categories.expense : [],
        income: (parsed.categories && Array.isArray(parsed.categories.income)) ? parsed.categories.income : []
      },
      loans: Array.isArray(parsed.loans) ? parsed.loans : [],
      admin: parsed.admin && typeof parsed.admin === 'object' ? parsed.admin : {}
    };
    saveFallbackData(merged);
    return merged;
  },

  /** ============ CSV EXPORTS ============
   * These were previously called via gasRun(...) but had no matching
   * method here (leftover from the Google Apps Script backend), so every
   * export button in the side menu silently downloaded an empty/broken
   * file. Implemented client-side now against the same fallback data.
   */
  exportTransactionsCsv: async () => {
    const { transactions } = getFallbackData();
    return rowsToCsv(['id', 'type', 'amount', 'category', 'person', 'date', 'note', 'ref', 'promiseDate'], transactions);
  },
  exportIncomeSummaryCsv: async () => {
    const { transactions } = getFallbackData();
    return flowSummaryCsv(transactions, 'INCOME');
  },
  exportExpenseSummaryCsv: async () => {
    const { transactions } = getFallbackData();
    return flowSummaryCsv(transactions, 'EXPENSE');
  },
  exportAllExpensesCsv: async () => {
    const { transactions } = getFallbackData();
    return rowsToCsv(['id', 'date', 'category', 'amount', 'note', 'ref'], transactions.filter(t => t.type === 'EXPENSE'));
  },
  exportAllIncomesCsv: async () => {
    const { transactions } = getFallbackData();
    return rowsToCsv(['id', 'date', 'category', 'amount', 'note', 'ref'], transactions.filter(t => t.type === 'INCOME'));
  },
  exportPersonsSummaryCsv: async () => {
    const { persons, transactions } = getFallbackData();
    const rows = personsBalances(persons, transactions)
      .sort((a, b) => Math.abs(b.remaining) - Math.abs(a.remaining))
      .map(p => ({
        Person: p.name, Phone: p.phone, Address: p.address,
        'Total Given (Dr)': p.totalDr, 'Total Received (Cr)': p.totalCr,
        Balance: Math.abs(p.remaining), Status: p.status
      }));
    return rowsToCsv(['Person', 'Phone', 'Address', 'Total Given (Dr)', 'Total Received (Cr)', 'Balance', 'Status'], rows);
  },
  exportReceivablesCsv: async () => {
    const { persons, transactions } = getFallbackData();
    const rows = personsBalances(persons, transactions)
      .filter(p => p.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining)
      .map(p => ({ Person: p.name, Phone: p.phone, 'Amount Receivable': p.remaining }));
    return rowsToCsv(['Person', 'Phone', 'Amount Receivable'], rows);
  },
  exportPayablesCsv: async () => {
    const { persons, transactions } = getFallbackData();
    const rows = personsBalances(persons, transactions)
      .filter(p => p.remaining < 0)
      .sort((a, b) => Math.abs(b.remaining) - Math.abs(a.remaining))
      .map(p => ({ Person: p.name, Phone: p.phone, 'Amount Payable': Math.abs(p.remaining) }));
    return rowsToCsv(['Person', 'Phone', 'Amount Payable'], rows);
  },
  exportActiveLoansSummaryCsv: async () => {
    const { loans } = getFallbackData();
    const rows = loans.map(l => {
      const schedule = l.schedule || [];
      const paid = schedule.filter(s => s.paid).length;
      return {
        'Loan Name': l.loanName, Person: l.person, 'Loan Amount': l.loanAmount,
        'Monthly EMI': l.monthlyEmi, 'EMI Paid': `${paid}/${schedule.length}`, Status: l.status
      };
    });
    return rowsToCsv(['Loan Name', 'Person', 'Loan Amount', 'Monthly EMI', 'EMI Paid', 'Status'], rows);
  },
  exportAllLoanEmiRecordsCsv: async () => {
    const { loans } = getFallbackData();
    const rows = [];
    loans.forEach(l => (l.schedule || []).forEach(s => {
      rows.push({
        'Loan Name': l.loanName, Person: l.person, 'EMI No': s.emiNo, Date: s.date,
        'EMI Amount': s.emiAmount, 'Outstanding Bal': s.outstandingBal, Paid: s.paid ? 'Yes' : 'No',
        'Who Paid': s.whoPaid, 'Txn Id': s.paymentId, 'Paid Date': s.paidDate
      });
    }));
    return rowsToCsv(['Loan Name', 'Person', 'EMI No', 'Date', 'EMI Amount', 'Outstanding Bal', 'Paid', 'Who Paid', 'Txn Id', 'Paid Date'], rows);
  }
};
