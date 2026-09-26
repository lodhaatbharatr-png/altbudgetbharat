from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'src' / 'main.jsx'
INDEX = ROOT / 'index.html'
EXPORT = ROOT / 'src' / 'export' / 'exportService.js'

text = MAIN.read_text(encoding='utf-8')


def replace_once(label, pattern, replacement, flags=re.S):
    global text
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    text = updated

# ------------------------------------------------------------
# 1) Contacts: use the dynamically loaded Capacitor 5 plugin so
#    the picker can never reference a removed static import.
#    The same helper is used at startup and from Add Person.
# ------------------------------------------------------------
contact_handler_pattern = r"  const openDeviceContactPicker = async \(\) => \{.*?\n  \};\n\n  const selectDeviceContact"
contact_handler_replacement = '''  const openDeviceContactPicker = async () => {
    if (contactPickerLoading) return;
    setContactPickerLoading(true);
    showFeedback('Requesting Contacts permission…');
    try {
      const Contacts = await loadContactsPlugin();
      if (!Contacts) {
        showFeedback('Device Contacts are unavailable in this build.');
        return;
      }

      let permission = null;
      if (typeof Contacts.getPermissions === 'function') {
        permission = await Contacts.getPermissions();
      }
      const permissionGranted = permission?.granted === true || permission?.contacts === 'granted';
      if (!permissionGranted) {
        showFeedback('Contacts permission was not granted. Allow Contacts access in Android settings and try again.');
        return;
      }

      showFeedback('Loading device contacts…');
      const result = await Contacts.getContacts();
      const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
      const usable = contacts
        .map(normalizeDeviceContact)
        .filter(contact => contact._name || contact._phone || contact._email)
        .sort((a, b) => a._name.localeCompare(b._name, undefined, { sensitivity: 'base' }));

      cacheDeviceContacts(usable);
      setDeviceContacts(usable);
      setContactPickerSearch('');
      setContactPickerOpen(true);
      showFeedback(`${usable.length} device contacts loaded`);
    } catch (err) {
      console.error('Device contact picker error:', err);
      showFeedback(`Unable to load device contacts: ${err?.message || 'Please allow Contacts permission and try again.'}`);
    } finally {
      setContactPickerLoading(false);
    }
  };

  const selectDeviceContact'''
replace_once('contact picker handler', contact_handler_pattern, contact_handler_replacement)

# Preserve optional address if the installed plugin/device exposes one.
# This transformation is intentionally idempotent because earlier contact-picker
# passes may already have added the address field.
if 'address: contact._address || prev.address ||' not in text:
    replace_once(
        'contact address mapping',
        r"(name: contact\._name \|\| prev\.name \|\| '',\n\s*phone: contact\._phone \|\| prev\.phone \|\| '',\n\s*email: contact\._email \|\| prev\.email \|\| '',)(\n\s*\}\)\);)",
        r"\1\n      address: contact._address || prev.address || '',\2",
    )

# Replace the phase-2 preload with a real startup permission + cache pass.
preload_pattern = r"  // DEVICE_CONTACTS_PRELOAD_PHASE2\n  useEffect\(\(\) => \{.*?\n  \}, \[\]\);\n\n"
preload_replacement = '''  // DEVICE_CONTACTS_PRELOAD_PHASE2
  useEffect(() => {
    let cancelled = false;
    const preloadContacts = async () => {
      try {
        const cached = readCachedDeviceContacts();
        if (cached.length && !cancelled) setDeviceContacts(prev => prev.length ? prev : cached);

        const Contacts = await loadContactsPlugin();
        if (!Contacts || cancelled) return;

        // The Capacitor-community Contacts v5 plugin uses getPermissions()
        // to request/check Android contacts access before getContacts().
        const permission = typeof Contacts.getPermissions === 'function'
          ? await Contacts.getPermissions()
          : null;
        const granted = permission?.granted === true || permission?.contacts === 'granted';
        if (!granted || cancelled) return;

        const result = await Contacts.getContacts();
        const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
        const usable = contacts
          .map(normalizeDeviceContact)
          .filter(contact => contact._name || contact._phone || contact._email)
          .sort((a, b) => a._name.localeCompare(b._name, undefined, { sensitivity: 'base' }));
        if (!cancelled) {
          cacheDeviceContacts(usable);
          setDeviceContacts(usable);
        }
      } catch (err) {
        console.warn('Background contact permission/cache pass skipped:', err);
      }
    };
    const timer = setTimeout(preloadContacts, 900);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

'''
replace_once('startup contact preload', preload_pattern, preload_replacement)

# Add Person: load cached contacts on focus and show live suggestions while typing.
name_input_pattern = r"<input type=\"text\" required value=\{formData\.name \|\| ''\} onChange=\{e => setFormData\(\{ \.\.\.formData, name: e\.target\.value \}\)\} className=\"w-full border border-\[#E4E1EA\] rounded-xl px-3\.5 py-2\.5 font-bold text-sm bg-\[#F4F3F8\] focus:bg-white text-\[#1E104B\] outline-none\" />"
name_input_replacement = '''<div className="relative">
                        <input
                          type="text"
                          required
                          value={formData.name || ''}
                          autoComplete="off"
                          onFocus={() => {
                            const cached = readCachedDeviceContacts();
                            if (cached.length && !deviceContacts.length) setDeviceContacts(cached);
                          }}
                          onChange={e => setFormData({ ...formData, name: e.target.value })}
                          className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none"
                        />
                        {String(formData.name || '').trim().length >= 1 && deviceContacts.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 z-[80] bg-white border border-[#E4E1EA] rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                            {deviceContacts
                              .filter(contact => `${contact._name} ${contact._phone} ${contact._email}`.toLowerCase().includes(String(formData.name || '').trim().toLowerCase()))
                              .slice(0, 8)
                              .map((contact, index) => (
                                <button
                                  key={contact.contactId || contact.id || `${contact._name}-${contact._phone}-${index}`}
                                  type="button"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => selectDeviceContact(contact)}
                                  className="w-full text-left px-3 py-2.5 hover:bg-[#F4F3F8] active:bg-[#EDE9F6] border-b border-[#E4E1EA]/60 last:border-b-0"
                                >
                                  <span className="block text-xs font-black text-[#1E104B] truncate">{contact._name || 'Unnamed contact'}</span>
                                  <span className="block text-[10px] font-semibold text-[#625E70] truncate mt-0.5">{contact._phone || contact._email || 'No phone/email'}</span>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>'''
replace_once('Add Person name suggestions', name_input_pattern, name_input_replacement, flags=0)

# ------------------------------------------------------------
# 2) Data Exports: replace the long flat list with exactly two
#    expandable groups while preserving existing export actions.
# ------------------------------------------------------------
if 'const [exportGroup, setExportGroup]' not in text:
    text = text.replace(
        "  const [contactPickerLoading, setContactPickerLoading] = useState(false);\n",
        "  const [contactPickerLoading, setContactPickerLoading] = useState(false);\n  const [exportGroup, setExportGroup] = useState('');\n",
        1,
    )

exports_pattern = r"            <div className=\"px-6 mt-6 mb-2 text-\[10px\] font-bold text-\[#8A8596\] uppercase tracking-widest\">Data Exports</div>\s*.*?<button[^\n]*>.*?All Payables</button>"
exports_replacement = '''            <div className="px-6 mt-6 mb-2 text-[10px] font-bold text-[#8A8596] uppercase tracking-widest">Data Exports</div>
            <div className="px-4 space-y-2">
              <button
                type="button"
                onClick={() => setExportGroup(exportGroup === 'summaries' ? '' : 'summaries')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#F4F3F8] border border-[#E4E1EA] text-xs font-black text-[#1E104B]"
              >
                <span><i className="fa-solid fa-chart-pie w-7 text-[#078A87]"></i>Summaries</span>
                <i className={`fa-solid fa-chevron-${exportGroup === 'summaries' ? 'up' : 'down'} text-[10px] text-[#8A8596]`}></i>
              </button>
              {exportGroup === 'summaries' && (
                <div className="grid grid-cols-2 gap-1.5 px-1">
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportIncomeSummaryCsv', 'income_summary.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">Income</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportExpenseSummaryCsv', 'expense_summary.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">Expenses</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportActiveLoansSummaryCsv', 'active_loans_summary.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">Active Loans</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportPersonsSummaryCsv', 'persons_summary.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">Persons</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportReceivablesCsv', 'receivables_report.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">Receivables</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportPayablesCsv', 'payables_report.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">Payables</button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setExportGroup(exportGroup === 'transactions' ? '' : 'transactions')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#F4F3F8] border border-[#E4E1EA] text-xs font-black text-[#1E104B]"
              >
                <span><i className="fa-solid fa-list-check w-7 text-[#7B2B8C]"></i>Transactions</span>
                <i className={`fa-solid fa-chevron-${exportGroup === 'transactions' ? 'up' : 'down'} text-[10px] text-[#8A8596]`}></i>
              </button>
              {exportGroup === 'transactions' && (
                <div className="grid grid-cols-2 gap-1.5 px-1">
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportAllLoanEmiRecordsCsv', 'all_loan_emi_records.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">Loans EMI Records</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportTransactionsCsv', 'transactions_export.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">All Transactions</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportAllIncomesCsv', 'all_incomes.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">Incomes</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportAllExpensesCsv', 'all_expenses.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">Expenses</button>
                </div>
              )}
            </div>'''
replace_once('Data Exports grouped menu', exports_pattern, exports_replacement)

# ------------------------------------------------------------
# 3) Header sync icon: show cloud-arrow-up during upload, cloud-
#    arrow-down during restore, cloud-check after success, and a
#    plain cloud when idle/error. The existing sync button/action
#    remains unchanged.
# ------------------------------------------------------------
text = text.replace(
    "const isSyncing = syncStatus === 'syncing';",
    "const isSyncing = syncStatus === 'syncing';\n  const isRestoring = syncStatus === 'restoring';\n  const isSuccess = syncStatus === 'success';",
    1,
)
replace_once(
    'header sync icon',
    r"<i className=\{`fa-solid fa-rotate text-sm \$\{isSyncing \? 'animate-spin' : ''\}`\}></i>",
    r"<i className={`fa-solid ${isSyncing ? 'fa-cloud-arrow-up animate-pulse' : isRestoring ? 'fa-cloud-arrow-down animate-pulse' : isSuccess ? 'fa-cloud-check' : 'fa-cloud'} text-sm`}></i>",
    flags=0,
)

# Mark upload/restore status without changing the underlying data flow.
upload_start = text.find('  const uploadBackupToCloud = async () => {')
upload_end = text.find('\n  const restoreBackupFromCloud = async () => {', upload_start)
if upload_start < 0 or upload_end < 0:
    raise SystemExit('uploadBackupToCloud block not found')
upload = text[upload_start:upload_end]
upload = upload.replace("showFeedback('Backup uploaded successfully');", "setSyncStatus('success');\n      showFeedback('Backup uploaded successfully');", 1)
upload = upload.replace("finally {\n      setSyncStatus('idle');\n    }", "finally {\n      setTimeout(() => setSyncStatus(prev => prev === 'success' ? 'idle' : prev), 1400);\n    }", 1)
text = text[:upload_start] + upload + text[upload_end:]

restore_start = text.find('  const restoreBackupFromCloud = async () => {')
restore_end = text.find('\n  const addTransaction = (tx) => {', restore_start)
if restore_start < 0 or restore_end < 0:
    raise SystemExit('restoreBackupFromCloud block not found')
restore = text[restore_start:restore_end]
restore = restore.replace("setSyncStatus('syncing');", "setSyncStatus('restoring');", 1)
restore = restore.replace("showFeedback('Backup restored from Google Drive');", "setSyncStatus('success');\n      showFeedback('Backup restored from Google Drive');", 1)
restore = restore.replace("finally {\n      setSyncStatus('idle');\n    }", "finally {\n      setTimeout(() => setSyncStatus(prev => prev === 'success' ? 'idle' : prev), 1400);\n    }", 1)
text = text[:restore_start] + restore + text[restore_end:]

# ------------------------------------------------------------
# 4) Payment reminder: no footer container and no bottom label.
#    Keep the ticket style, move footer below the separator, use
#    two clean horizontal areas, and preserve logo aspect ratio.
# ------------------------------------------------------------
reminder_start = text.find('const createPaymentReminderImage = async ({ personName, amount, dueDate, loanName, emiNo, admin }) => {')
reminder_end = text.find('\n\nconst AppContext = createContext();', reminder_start)
if reminder_start < 0 or reminder_end < 0:
    raise SystemExit('payment reminder function markers not found')

reminder = '''const createPaymentReminderImage = async ({ personName, amount, dueDate, loanName, emiNo, admin }) => {
  const width = 900, height = 650;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
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

  const ticketX = 48, ticketY = 28, ticketW = width - 96, ticketH = height - 46;
  ctx.save();
  roundRect(ticketX, ticketY, ticketW, ticketH, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  // Ticket cut-outs at the footer separator.
  const separatorY = 414;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(ticketX, separatorY, 24, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ticketX + ticketW, separatorY, 24, Math.PI / 2, Math.PI * 1.5);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#D8D3E0';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 10]);
  ctx.beginPath();
  ctx.moveTo(ticketX + 34, separatorY);
  ctx.lineTo(ticketX + ticketW - 34, separatorY);
  ctx.stroke();
  ctx.restore();

  const centerX = width / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#1E104B';
  ctx.font = '900 34px sans-serif';
  ctx.fillText(`Hello ${personName || 'there'}!`, centerX, 100);

  ctx.fillStyle = '#625E70';
  ctx.font = '800 25px sans-serif';
  ctx.fillText('Payment reminder for', centerX, 145);

  roundRect(205, 172, 490, 86, 22);
  ctx.fillStyle = '#F1EAF4';
  ctx.fill();
  ctx.fillStyle = '#7B2B8C';
  ctx.font = '900 58px sans-serif';
  ctx.fillText(formatMoney(amount), centerX, 216);

  ctx.fillStyle = '#1E104B';
  ctx.font = '800 25px sans-serif';
  ctx.fillText(`Due on ${formatDisplayDate(dueDate)}`, centerX, 291);

  ctx.fillStyle = '#625E70';
  ctx.font = '700 23px sans-serif';
  ctx.fillText(`${loanName || 'Loan EMI'}${emiNo ? `  •  EMI #${emiNo}` : ''}`, centerX, 329);

  // Footer is deliberately outside any background container.
  const footerTop = separatorY + 24;
  const dividerX = width / 2;

  ctx.save();
  ctx.strokeStyle = '#D8D3E0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dividerX, footerTop + 8);
  ctx.lineTo(dividerX, height - 28);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#8A8596';
  ctx.font = '800 16px sans-serif';
  ctx.fillText('Sent by', 70, footerTop + 24);
  ctx.fillStyle = '#1E104B';
  ctx.font = '900 22px sans-serif';
  ctx.fillText(admin?.name || 'BHARAT RASVE', 70, footerTop + 54);
  ctx.fillStyle = '#625E70';
  ctx.font = '800 18px sans-serif';
  ctx.fillText(String(admin?.contact || '7218838122'), 70, footerTop + 82);

  const brandingCenterX = dividerX + (width - dividerX) / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8A8596';
  ctx.font = '800 15px sans-serif';
  ctx.fillText('Using', brandingCenterX, footerTop + 18);

  const logoSrc = Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED;
  if (logoSrc) {
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxLogoW = 170;
        const maxLogoH = 46;
        const scale = Math.min(maxLogoW / img.width, maxLogoH / img.height);
        const logoW = Math.max(1, img.width * scale);
        const logoH = Math.max(1, img.height * scale);
        ctx.drawImage(img, brandingCenterX - logoW / 2, footerTop + 28 + (maxLogoH - logoH) / 2, logoW, logoH);
        resolve();
      };
      img.onerror = resolve;
      img.src = logoSrc;
    });
  }

  ctx.fillStyle = '#1E104B';
  ctx.font = '900 17px sans-serif';
  ctx.fillText('Your Personal Finance App', brandingCenterX, footerTop + 88);
  ctx.fillStyle = '#625E70';
  ctx.font = '700 15px sans-serif';
  ctx.fillText('Developed by - Bharat Rasve', brandingCenterX, footerTop + 112);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Unable to create reminder image.')), 'image/jpeg', 0.92);
  });
  return new File([blob], `Budget_Bharat_Payment_Reminder_${Date.now()}.jpg`, { type: 'image/jpeg' });
};'''
text = text[:reminder_start] + reminder + text[reminder_end:]

MAIN.write_text(text, encoding='utf-8')

# ------------------------------------------------------------
# 5) Make every DOM JPEG export retain the already requested top
#    padding even if an earlier CI script did not patch the helper.
# ------------------------------------------------------------
export_text = EXPORT.read_text(encoding='utf-8')
if "paddingTop: options.topPadding || '18px'" not in export_text:
    export_text = export_text.replace(
        "style: options.style || undefined",
        "style: { boxSizing: 'border-box', paddingTop: options.topPadding || '18px', ...(options.style || {}) }",
        1,
    )
if 'const topPadding = Math.max(0, Number.parseInt(options.topPadding ||' not in export_text:
    export_text = export_text.replace(
        "const height = Math.ceil(rect.height || element.offsetHeight || element.scrollHeight || 800);",
        "const baseHeight = Math.ceil(rect.height || element.offsetHeight || element.scrollHeight || 800);\n  const topPadding = Math.max(0, Number.parseInt(options.topPadding || '18', 10) || 18);\n  const height = baseHeight + topPadding;",
        1,
    )
EXPORT.write_text(export_text, encoding='utf-8')

# ------------------------------------------------------------
# 6) Keep the native startup surface navy and use the same current
#    transparent Budget Bharat logo, without introducing a white
#    frame before React mounts.
# ------------------------------------------------------------
html = INDEX.read_text(encoding='utf-8')
html = html.replace('<html lang="en" style="background:#F4F3F8;">', '<html lang="en" style="background:#1E104B;">', 1)
html = html.replace('<meta name="theme-color" content="#F4F3F8" />', '<meta name="theme-color" content="#1E104B" />', 1)
html = html.replace('<body style="margin:0;background:#F4F3F8;">', '<body style="margin:0;background:#1E104B;">', 1)
if 'id="bb-startup-splash-final"' not in html:
    root_old = '<div id="root" style="min-height:100vh;background:#F4F3F8;"></div>'
    root_new = '''<div id="root" style="min-height:100vh;background:#F4F3F8;"></div>
  <div id="bb-startup-splash-final" style="position:fixed;inset:0;z-index:2147483647;background:#1E104B;display:flex;align-items:center;justify-content:center;opacity:1;transition:opacity .18s ease-out;">
    <img src="assets/icon.png" alt="Budget Bharat" style="width:118px;height:118px;object-fit:contain;display:block;" />
  </div>
  <script>
    (function () {
      var splash = document.getElementById('bb-startup-splash-final');
      var root = document.getElementById('root');
      var remove = function () {
        if (!splash || !root || !root.firstElementChild) return;
        splash.style.opacity = '0';
        setTimeout(function () { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); }, 220);
      };
      if (root && window.MutationObserver) new MutationObserver(remove).observe(root, { childList: true, subtree: true });
      window.addEventListener('load', function () { setTimeout(remove, 120); }, { once: true });
    })();
  </script>'''
    if root_old in html:
        html = html.replace(root_old, root_new, 1)
INDEX.write_text(html, encoding='utf-8')

print('Phase 2 finalization complete: startup contacts, typeahead, grouped exports, sync icons, reminder footer, and image padding.')
