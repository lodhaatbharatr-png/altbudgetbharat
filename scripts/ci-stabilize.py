from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# main.jsx stabilization fixes
p = ROOT / 'src' / 'main.jsx'
text = p.read_text(encoding='utf-8')

# Remove the legacy full-screen startup loader and its early return.
text, n1 = re.subn(
    r"\nconst LoadingScreen = \(\) => \(.*?\n\);",
    "",
    text,
    count=1,
    flags=re.S,
)
text, n2 = re.subn(
    r"\n  if \(loading && transactions\.length === 0 && persons\.length === 0\) \{\n    return <div className=\"app-shell\"><LoadingScreen \/><\/div>;\n  \}\n",
    "\n",
    text,
    count=1,
)

# Central transaction ordering: newest transaction date first.
if 'const sortTransactionsByDateDesc' not in text:
    helper = """const sortTransactionsByDateDesc = (items = []) => [...items].sort((a, b) => {\n  const dateDiff = parseDate(b?.date || b?.Date || b?.transactionDate || b?.timestamp || b?.Timestamp).getTime()\n    - parseDate(a?.date || a?.Date || a?.transactionDate || a?.timestamp || a?.Timestamp).getTime();\n  if (dateDiff !== 0) return dateDiff;\n  return String(b?.timestamp || b?.Timestamp || b?.entryId || b?.ENTRY_ID || b?.id || '')\n    .localeCompare(String(a?.timestamp || a?.Timestamp || a?.entryId || a?.ENTRY_ID || a?.id || ''));\n});\n\n"""
    marker = 'const toInputDate_ ='
    if marker not in text:
        raise SystemExit('Date helper insertion marker not found')
    text = text.replace(marker, helper + marker, 1)

old_table = 'const displayTxs = expanded ? transactions : transactions.slice(0, maxRows);'
new_table = """const sortedTransactions = sortTransactionsByDateDesc(transactions);\n  const displayTxs = expanded ? sortedTransactions : sortedTransactions.slice(0, maxRows);"""
if old_table in text:
    text = text.replace(old_table, new_table, 1)

old_section = 'const displayTxs = txs.slice(0, visibleCount);'
new_section = """const sortedTxs = sortTransactionsByDateDesc(txs);\n    const displayTxs = sortedTxs.slice(0, visibleCount);"""
if old_section in text:
    text = text.replace(old_section, new_section, 1)

# New Record -> + Category opens the shared manager with Expense selected by default.
old_open = """    if (targetView === 'addCategory' && categoryType) {\n      window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ = categoryType;\n    }\n"""
new_open = """    if (targetView === 'addCategory') {\n      window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ = 'expense';\n    }\n"""
if old_open in text:
    text = text.replace(old_open, new_open, 1)

p.write_text(text, encoding='utf-8')

# Google sign-in diagnostics. This identifies Android OAuth configuration errors
# without inventing credentials or hiding ordinary cancellation/errors.
gp = ROOT / 'src' / 'googleSync.js'
g = gp.read_text(encoding='utf-8')
marker = "  login: async function () {\n    try: {"
replacement = "  login: async function () {\n    try: {\n      try { GoogleAuth.initialize(); } catch (_) {}"
if 'GoogleAuth.initialize();' not in g and marker in g:
    g = g.replace(marker, replacement, 1)

old_catch = """    } catch (err) {\n      throw this._normalizeError(err, 'Sign-in canceled or failed.');\n    }\n  },"""
new_catch = """    } catch (err) {\n      const code = String(err?.code ?? err?.statusCode ?? err?.errorCode ?? '');\n      if (code === '10' || String(err?.message || '').toLowerCase().includes('something went wrong')) {\n        throw new Error('Google sign-in developer configuration error (code 10). The installed Android APK must be signed with a SHA-1 registered on the Android OAuth client for com.bharatrasve.budgetbharat.');\n      }\n      throw this._normalizeError(err, 'Sign-in canceled or failed.');\n    }\n  },"""
if old_catch in g and 'Google sign-in developer configuration error (code 10)' not in g:
    g = g.replace(old_catch, new_catch, 1)
gp.write_text(g, encoding='utf-8')

print(f'LoadingScreen removed: {n1}; loading early return removed: {n2}')
print('Stabilization source pass complete.')
