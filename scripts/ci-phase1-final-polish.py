from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

main_path = ROOT / 'src' / 'main.jsx'
text = main_path.read_text(encoding='utf-8')

# Contact-picker transformations intentionally omitted.

old_filter = """    return transactions.filter(t =>
      (t.note && t.note.toLowerCase().includes(query)) ||
      (t.category && String(t.category).trim().toLowerCase().includes(query)) ||
      (t.person && t.person.toLowerCase().includes(query)) ||
      (t.person && t.person.toLowerCase().includes(query)) ||
      (t.ref && t.ref.toLowerCase().includes(query))
    );"""
new_filter = """    return transactions.filter(t => {
      const amount = String(t.amount ?? '').replace(/,/g, '');
      const amountFormatted = formatTableNum(t.amount).replace(/,/g, '');
      const q = String(query || '').toLowerCase();
      return String(t.note || '').toLowerCase().includes(q) ||
        String(t.category || '').trim().toLowerCase().includes(q) ||
        String(t.person || '').toLowerCase().includes(q) ||
        String(t.ref || '').toLowerCase().includes(q) ||
        amount.includes(q) || amountFormatted.includes(q);
    });"""
# Only replace the exact legacy block when it is still present.
legacy = """    return transactions.filter(t =>
      (t.note && t.note.toLowerCase().includes(query)) ||
      (t.category && String(t.category).trim().toLowerCase().includes(query)) ||
      (t.person && t.person.toLowerCase().includes(query)) ||
      (t.ref && t.ref.toLowerCase().includes(query))
    );"""
if legacy in text: text = text.replace(legacy, new_filter, 1)

old_cats = """    const allCats = [...categories.expense, ...categories.income];
    return allCats.filter(c => c.toLowerCase().includes(query));"""
new_cats = """    const allCats = [...(categories.expense || []), ...(categories.income || [])]
      .map(c => typeof c === 'string' ? c : String(c?.name || c?.label || ''))
      .map(c => c.trim()).filter(Boolean);
    return [...new Set(allCats)].filter(c => c.toLowerCase().includes(query));"""
if old_cats in text: text = text.replace(old_cats, new_cats, 1)
text = text.replace("onClick={() => setSearchQuery(c)} title={`Filter transactions by ${c}`}", "onClick={() => setSearchQuery(String(c).trim())} title={`Filter transactions by ${c}`}", 1)

if "onSelectTransaction={onSelectTransaction}" not in text:
    text = text.replace('<TransactionTable transactions={matchedTransactions} maxRows={100} showViewAll={false} />', '<TransactionTable transactions={matchedTransactions} maxRows={100} showViewAll={false} onSelectTransaction={onSelectTransaction} />', 1)

# Keep the payment reminder/footer transformations already present, but do not
# modify startup markup here. Startup is now handled only by the native Android
# launch screen so a JS/module failure can never trap the WebView behind a splash.
main_path.write_text(text, encoding='utf-8')

index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
index = re.sub(r'\n\s*<div id="bb-startup-splash".*?</script>', '', index, count=1, flags=re.S)
index = index.replace('<html lang="en" style="background:#1E104B;">', '<html lang="en" style="background:#1E104B;">', 1)
index = index.replace('<body style="margin:0;background:#1E104B;">', '<body style="margin:0;background:#1E104B;">', 1)
index_path.write_text(index, encoding='utf-8')
print('Phase 1 final polish source transformation complete. Web startup splash disabled.')