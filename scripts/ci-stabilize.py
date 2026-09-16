from pathlib import Path
import re
import subprocess

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

# New Record -> + Category follows the current record type:
# Expense entry => Expense selected; Income entry => Income selected.
forced_expense = """    if (targetView === 'addCategory') {\n      window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ = 'expense';\n    }\n"""
contextual_category = """    if (targetView === 'addCategory' && categoryType) {\n      window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ = categoryType;\n    }\n"""
if forced_expense in text:
    text = text.replace(forced_expense, contextual_category, 1)

# Payment reminder: light app-gray ticket card, logo watermark, greeting first,
# then reminder title, amount and supporting details. Keep it native-canvas based.
start = text.find('const createPaymentReminderImage = async ({ personName, amount, dueDate, loanName, emiNo, admin }) => {')
if start >= 0:
    end = text.find('\n\nconst AppContext = createContext();', start)
    if end < 0:
        raise SystemExit('Payment reminder function end marker not found')
    replacement = r'''const createPaymentReminderImage = async ({ personName, amount, dueDate, loanName, emiNo, admin }) => {
  const width = 900, height = 620;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device.');

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  ctx.fillStyle = '#F4F3F8';
  ctx.fillRect(0, 0, width, height);

  const ticketX = 48, ticketY = 34, ticketW = width - 96, ticketH = height - 68;
  ctx.save();
  roundRect(ticketX, ticketY, ticketW, ticketH, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.arc(ticketX, ticketY + ticketH * 0.62, 24, -Math.PI / 2, Math.PI / 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ticketX + ticketW, ticketY + ticketH * 0.62, 24, Math.PI / 2, Math.PI * 1.5); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#D8D3E0';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 10]);
  ctx.beginPath();
  ctx.moveTo(ticketX + 34, ticketY + ticketH * 0.62);
  ctx.lineTo(ticketX + ticketW - 34, ticketY + ticketH * 0.62);
  ctx.stroke();
  ctx.restore();

  const logoSrc = Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED;
  if (logoSrc) await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 330, maxH = 150;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.save();
      ctx.globalAlpha = 0.055;
      ctx.drawImage(img, (width - w) / 2, ticketY + 118, w, h);
      ctx.restore();
      resolve();
    };
    img.onerror = resolve;
    img.src = logoSrc;
  });

  const centerX = width / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1E104B';
  ctx.font = '900 34px sans-serif';
  ctx.fillText(`Hello ${personName || 'there'}!`, centerX, 95);

  ctx.fillStyle = '#625E70';
  ctx.font = '800 25px sans-serif';
  ctx.fillText('Payment reminder for', centerX, 140);

  roundRect(205, 166, 490, 86, 22);
  ctx.fillStyle = '#F1EAF4'; ctx.fill();
  ctx.fillStyle = '#7B2B8C';
  ctx.font = '900 58px sans-serif';
  ctx.fillText(formatMoney(amount), centerX, 211);

  ctx.fillStyle = '#1E104B';
  ctx.font = '800 25px sans-serif';
  ctx.fillText(`Due on ${formatDisplayDate(dueDate)}`, centerX, 285);

  ctx.fillStyle = '#625E70';
  ctx.font = '700 23px sans-serif';
  ctx.fillText(`${loanName || 'Loan EMI'}${emiNo ? `  •  EMI #${emiNo}` : ''}`, centerX, 322);

  ctx.fillStyle = '#1E104B';
  ctx.font = '800 21px sans-serif';
  ctx.fillText(`Sent by ${admin?.name || 'Bharat Rasve'}`, centerX, 430);
  ctx.fillStyle = '#625E70';
  ctx.font = '700 19px sans-serif';
  ctx.fillText(admin?.contact || '7218838122', centerX, 462);

  ctx.fillStyle = '#8A8596';
  ctx.font = '700 16px sans-serif';
  ctx.fillText('Budget Bharat • Personal Finance', centerX, 530);

  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Unable to create reminder image.')), 'image/jpeg', 0.92));
  return new File([blob], `Budget_Bharat_Payment_Reminder_${Date.now()}.jpg`, { type: 'image/jpeg' });
};'''
    text = text[:start] + replacement + text[end:]

# Export-image footer logos: explicit dimensions prevent html2canvas/WebView flex stretching.
text = text.replace(
    'className="w-32 h-auto max-h-12 object-contain select-none"',
    'className="w-[104px] h-[32px] object-contain select-none flex-none"',
)
text = text.replace(
    'alt="Logo"\n                  className="w-[104px] h-[104px] object-contain select-none"',
    'alt="Logo"\n                  className="w-[104px] h-[32px] object-contain select-none flex-none"',
)

# Active-loans first column: give date text normal line-height and vertical alignment.
text = text.replace(
    '<td className="py-2 px-2 border">{formatDisplayDate(row.date)}</td>',
    '<td className="py-2 px-2 border align-middle leading-normal whitespace-nowrap">{formatDisplayDate(row.date)}</td>',
    1,
)

# Use html-to-image for the statement/ledger image path and route the resulting Blob
# through the unified native Filesystem + Share service. Keep html2canvas/html2pdf
# available for the existing PDF path until Android PDF rendering is separately validated.
if "from './export/exportService.js'" not in text:
    text = text.replace(
        "import { GoogleDriveSync } from './googleSync.js';",
        "import { GoogleDriveSync } from './googleSync.js';\nimport { exportDomAsJpeg, EXPORT_STATUS } from './export/exportService.js';",
        1,
    )

share_start = text.find('const shareReceiptToWhatsApp = async (ref, filename, captionText) => {')
if share_start >= 0:
    share_end = text.find('\n\nconst waitForPaint', share_start)
    if share_end < 0:
        raise SystemExit('shareReceiptToWhatsApp end marker not found')
    share_replacement = r'''const shareReceiptToWhatsApp = async (ref, filename, captionText) => {
  let target = ref && ref.current ? ref.current : (typeof ref === 'string' ? document.getElementById(ref) : ref);
  if (!target) throw new Error('Target render reference not found');
  if (target instanceof HTMLElement === false && target.nodeType !== 1) target = target.current || target;

  const result = await exportDomAsJpeg(target, {
    filename: `${filename}.jpg`,
    title: filename,
    text: captionText,
    quality: 0.9,
    backgroundColor: '#FFFFFF'
  });

  if (result.status === EXPORT_STATUS.CANCELLED) return false;
  if (result.status === EXPORT_STATUS.FAILED) {
    throw result.error || new Error('Statement image generation failed.');
  }
  return true;
};'''
    text = text[:share_start] + share_replacement + text[share_end:]

p.write_text(text, encoding='utf-8')

# Google sign-in diagnostics. This identifies Android OAuth configuration errors.
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

# The authoritative launcher artwork is assets/icon.png from commit 9eb05a0.
# Restore that exact historical blob in every stabilization build; do not substitute 2icon.png.
try:
    icon_bytes = subprocess.check_output(['git', 'show', '9eb05a0324b5e57de93e79b144ba3c9480920bad:assets/icon.png'])
    (ROOT / 'assets' / 'icon.png').write_bytes(icon_bytes)
    print(f'Authoritative launcher icon restored from 9eb05a0/assets/icon.png ({len(icon_bytes)} bytes).')
except Exception as exc:
    print(f'Authoritative launcher icon restore skipped: {exc}')

print(f'LoadingScreen removed: {n1}; loading early return removed: {n2}')
print('Stabilization source pass complete.')
