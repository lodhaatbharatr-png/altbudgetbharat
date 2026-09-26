from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'src' / 'main.jsx'
INDEX = ROOT / 'index.html'
text = MAIN.read_text(encoding='utf-8')

# 1) Do not statically import the native contacts plugin during app bootstrap.
# A bad/missing native plugin must never prevent the React app from mounting.
text = text.replace(
    "import { Contacts } from '@capacitor-community/contacts';\n",
    "",
    1,
)
if 'const loadContactsPlugin = async () => {' not in text:
    marker = "import './index.css';\n"
    helper = marker + """
const loadContactsPlugin = async () => {
  try {
    const mod = await import('@capacitor-community/contacts');
    return mod.Contacts;
  } catch (err) {
    console.error('Contacts plugin unavailable:', err);
    return null;
  }
};

const DEVICE_CONTACTS_CACHE_KEY = 'budget_bharat_device_contacts_v1';
const normalizeDeviceContact = (contact) => ({
  contactId: contact?.contactId || contact?.id || '',
  _name: String(contact?.displayName || contact?.name?.display || contact?.name || '').trim(),
  _phone: String(contact?.phoneNumbers?.find(p => p?.number)?.number || contact?.phones?.find(p => p?.number)?.number || '').trim(),
  _email: String(contact?.emails?.find(e => e?.address)?.address || contact?.emails?.find(e => e?.email)?.email || '').trim(),
  _address: String(contact?.postalAddresses?.find(a => a?.street || a?.formatted)?.formatted || contact?.address || '').trim(),
});

const readCachedDeviceContacts = () => {
  try {
    const raw = localStorage.getItem(DEVICE_CONTACTS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const cacheDeviceContacts = (contacts) => {
  try {
    localStorage.setItem(DEVICE_CONTACTS_CACHE_KEY, JSON.stringify(contacts || []));
  } catch (err) {
    console.warn('Unable to cache device contacts:', err);
  }
};
"""
    if marker not in text:
        raise SystemExit('main import marker not found')
    text = text.replace(marker, helper, 1)

# 2) Existing picker: explicitly request/read permission, then use cached contacts first.
old = """  const openDeviceContactPicker = async () => {
    setContactPickerLoading(true);
    showFeedback('Opening device contacts…');
    try {
      const permission = await Contacts.getPermissions();
      const permissionGranted =
        permission?.granted === true ||
        permission?.readContacts === 'granted' ||
        permission?.contacts === 'granted';
      if (!permissionGranted) {
        showFeedback('Contacts permission is required. Please allow Contacts access and try again.');
        return;
      }
      const result = await Contacts.getContacts();
      const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
      const usable = contacts
        .map((contact) => ({
          ...contact,
          _name: String(contact.displayName || '').trim(),
          _phone: String(contact.phoneNumbers?.find(p => p?.number)?.number || '').trim(),
          _email: String(contact.emails?.find(e => e?.address)?.address || '').trim(),
        }))
        .filter(contact => contact._name || contact._phone);
      setDeviceContacts(usable);
      setContactPickerSearch('');
      setContactPickerOpen(true);
    } catch (err) {
      console.error('Device contact picker error:', err);
      showFeedback('Unable to open device contacts. Please allow Contacts permission in Android settings.');
    } finally {
      setContactPickerLoading(false);
    }
  };"""
new = """  const openDeviceContactPicker = async () => {
    setContactPickerLoading(true);
    showFeedback('Opening device contacts…');
    try {
      const cached = readCachedDeviceContacts();
      if (cached.length) {
        setDeviceContacts(cached);
        setContactPickerSearch('');
        setContactPickerOpen(true);
      }

      const Contacts = await loadContactsPlugin();
      if (!Contacts) {
        if (!cached.length) showFeedback('Device Contacts are unavailable in this build.');
        return;
      }

      const permission = await Contacts.getPermissions();
      const permissionGranted = permission?.granted === true;
      if (!permissionGranted) {
        if (!cached.length) showFeedback('Please allow Contacts access in Android settings, then try again.');
        return;
      }

      const result = await Contacts.getContacts();
      const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
      const usable = contacts.map(normalizeDeviceContact).filter(contact => contact._name || contact._phone);
      cacheDeviceContacts(usable);
      setDeviceContacts(usable);
      setContactPickerSearch('');
      setContactPickerOpen(true);
      showFeedback(`${usable.length} device contacts ready`);
    } catch (err) {
      console.error('Device contact picker error:', err);
      if (!deviceContacts.length) showFeedback('Unable to read device contacts. Check Contacts permission in Android settings.');
    } finally {
      setContactPickerLoading(false);
    }
  };"""
if old in text:
    text = text.replace(old, new, 1)

# 3) Preserve address when a contact is selected.
text = text.replace(
    "email: contact._email || prev.email || '',\n    }));",
    "email: contact._email || prev.email || '',\n      address: contact._address || prev.address || '',\n    }));",
    1,
)

# 4) Preload contacts after the UI has had time to mount. This intentionally runs
# asynchronously so permission dialogs/native plugin failures cannot block startup.
if 'DEVICE_CONTACTS_PRELOAD_PHASE2' not in text:
    marker = "  const showFeedback = (msg) => {\n"
    preload = """  // DEVICE_CONTACTS_PRELOAD_PHASE2
  useEffect(() => {
    let cancelled = false;
    const preloadContacts = async () => {
      try {
        const cached = readCachedDeviceContacts();
        if (cached.length) return;
        const Contacts = await loadContactsPlugin();
        if (!Contacts || cancelled) return;
        const permission = await Contacts.getPermissions();
        if (!permission?.granted || cancelled) return;
        const result = await Contacts.getContacts();
        const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
        const usable = contacts.map(normalizeDeviceContact).filter(contact => contact._name || contact._phone);
        if (!cancelled) cacheDeviceContacts(usable);
      } catch (err) {
        console.warn('Background contact preload skipped:', err);
      }
    };
    const timer = setTimeout(preloadContacts, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

"""
    if marker not in text:
        raise SystemExit('AppProvider showFeedback marker not found')
    text = text.replace(marker, preload + marker, 1)

# 5) Payment reminder footer: no footer container. Two horizontal areas with sender
# on the left and app branding on the right. Transparent logo is aspect-fit.
footer_start = text.find("  // Footer: logo left + sender details right, horizontally aligned.")
footer_end = text.find("  ctx.textAlign = 'center';\n  ctx.fillStyle = '#8A8596';", footer_start)
if footer_start >= 0 and footer_end > footer_start:
    footer = """  // Footer: two clean horizontal branding areas; no enclosing footer container.
  const footerTop = 405;
  const footerBottom = height - 46;
  const dividerX = width / 2;

  ctx.save();
  ctx.strokeStyle = '#D8D3E0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dividerX, footerTop + 8);
  ctx.lineTo(dividerX, footerBottom - 8);
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
        const maxLogoW = 180;
        const maxLogoH = 54;
        const scale = Math.min(maxLogoW / img.width, maxLogoH / img.height);
        const logoW = Math.max(1, img.width * scale);
        const logoH = Math.max(1, img.height * scale);
        ctx.drawImage(img, brandingCenterX - logoW / 2, footerTop + 31 + (maxLogoH - logoH) / 2, logoW, logoH);
        resolve();
      };
      img.onerror = resolve;
      img.src = logoSrc;
    });
  }

  ctx.fillStyle = '#1E104B';
  ctx.font = '900 17px sans-serif';
  ctx.fillText('Your Personal Finance App', brandingCenterX, footerTop + 103);
  ctx.fillStyle = '#625E70';
  ctx.font = '700 15px sans-serif';
  ctx.fillText('Developed by - Bharat Rasve', brandingCenterX, footerTop + 127);

"""
    text = text[:footer_start] + footer + text[footer_end:]
else:
    raise SystemExit('Payment reminder footer block not found')

# Increase reminder canvas height to give the new footer enough breathing room.
text = text.replace("const width = 900, height = 650;", "const width = 900, height = 700;", 1)

# 6) Header sync action icon follows status: upload while idle, spinner while syncing,
# cloud-arrow-down while restoring, and cloud-check after a successful sync.
text = text.replace(
    "<i className={`fa-solid fa-rotate text-sm ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}></i>",
    "<i className={`fa-solid ${syncStatus === 'syncing' ? 'fa-cloud-arrow-up animate-pulse' : syncStatus === 'restoring' ? 'fa-cloud-arrow-down animate-pulse' : syncStatus === 'success' ? 'fa-cloud-check' : 'fa-cloud-arrow-up'} text-sm`}></i>",
)
text = text.replace(
    "title={syncStatus === 'syncing' ? 'Syncing...' : loadError !== '' ? 'Error. Tap to retry.' : 'Upload Backup to Google Drive'}",
    "title={syncStatus === 'syncing' ? 'Uploading backup...' : syncStatus === 'restoring' ? 'Restoring backup...' : syncStatus === 'success' ? 'Backup synced' : loadError !== '' ? 'Error. Tap to retry.' : 'Upload backup to Google Drive'}",
)
text = text.replace(
    "title={isSyncing ? 'Syncing...' : isError ? 'Error. Tap to retry.' : 'Upload Backup to Google Drive'}",
    "title={isSyncing ? 'Uploading backup...' : isError ? 'Error. Tap to retry.' : 'Upload backup to Google Drive'}",
)

# 7) Menu wording requested by the user. Keep view/action IDs untouched.
replacements = {
    'Console Setup & Master Config': 'Your Personal Finance Manager',
    '>Backend Management</': '>Record Setup</',
    'Google Drive Backup': 'Data Backup & Restore',
    'Export CSV': 'Data Exports',
    'Full Data Backup (CSV)': 'Export Backup File',
}
for old_s, new_s in replacements.items():
    text = text.replace(old_s, new_s)

# 8) Simplify the export menu into two groups. Existing backend functions are retained.
start = text.find('            <div className="px-6 mt-6 mb-2 text-[10px] font-bold text-[#8A8596] uppercase tracking-widest">Data Exports</div>')
end_marker = '            <div className="px-6 mt-6 mb-2 text-[10px] font-bold text-[#8A8596] uppercase tracking-widest">'
end = text.find(end_marker, start + 20) if start >= 0 else -1
if start >= 0 and end > start:
    block = text[start:end]
    new_block = '''            <div className="px-6 mt-6 mb-2 text-[10px] font-bold text-[#8A8596] uppercase tracking-widest">Data Exports</div>
            <div className="px-4 space-y-2">
              <button onClick={() => setExportGroup(exportGroup === 'summaries' ? '' : 'summaries')} className="w-full flex items-center justify-between px-3 py-3 bg-[#F4F3F8] rounded-xl border border-[#E4E1EA] text-xs font-black text-[#1E104B]">
                <span><i className="fa-solid fa-chart-pie w-7 text-[#078A87]"></i> Summaries</span>
                <i className={`fa-solid fa-chevron-${exportGroup === 'summaries' ? 'up' : 'down'} text-[10px] text-[#8A8596]`}></i>
              </button>
              {exportGroup === 'summaries' && (
                <div className="grid grid-cols-2 gap-1.5 px-1">
                  <button onClick={() => handleAction(() => exportCsv('exportIncomeSummaryCsv', 'income_summary.csv'))} className="export-mini">Income</button>
                  <button onClick={() => handleAction(() => exportCsv('exportExpenseSummaryCsv', 'expense_summary.csv'))} className="export-mini">Expenses</button>
                  <button onClick={() => handleAction(() => exportCsv('exportActiveLoansSummaryCsv', 'active_loans_summary.csv'))} className="export-mini">Active Loans</button>
                  <button onClick={() => handleAction(() => exportCsv('exportPersonsSummaryCsv', 'persons_summary.csv'))} className="export-mini">Persons</button>
                  <button onClick={() => handleAction(() => exportCsv('exportReceivablesSummaryCsv', 'receivables_summary.csv'))} className="export-mini">Receivables</button>
                  <button onClick={() => handleAction(() => exportCsv('exportPayablesSummaryCsv', 'payables_summary.csv'))} className="export-mini">Payables</button>
                </div>
              )}
              <button onClick={() => setExportGroup(exportGroup === 'transactions' ? '' : 'transactions')} className="w-full flex items-center justify-between px-3 py-3 bg-[#F4F3F8] rounded-xl border border-[#E4E1EA] text-xs font-black text-[#1E104B]">
                <span><i className="fa-solid fa-list-check w-7 text-[#7B2B8C]"></i> Transactions</span>
                <i className={`fa-solid fa-chevron-${exportGroup === 'transactions' ? 'up' : 'down'} text-[10px] text-[#8A8596]`}></i>
              </button>
              {exportGroup === 'transactions' && (
                <div className="grid grid-cols-2 gap-1.5 px-1">
                  <button onClick={() => handleAction(() => exportCsv('exportAllLoanEmiRecordsCsv', 'all_loan_emi_records.csv'))} className="export-mini">Loans EMI Records</button>
                  <button onClick={() => handleAction(() => exportCsv('exportTransactionsCsv', 'transactions_export.csv'))} className="export-mini">All Transactions</button>
                  <button onClick={() => handleAction(() => exportCsv('exportIncomeTransactionsCsv', 'income_transactions.csv'))} className="export-mini">Incomes</button>
                  <button onClick={() => handleAction(() => exportCsv('exportExpenseTransactionsCsv', 'expense_transactions.csv'))} className="export-mini">Expenses</button>
                </div>
              )}
            </div>

'''
    text = text[:start] + new_block + text[end:]

# Export menu local state. Fall back safely if the exact side-menu state block changed.
if 'const [exportGroup, setExportGroup]' not in text:
    marker = "  const [contactPickerLoading, setContactPickerLoading] = useState(false);\n"
    if marker in text:
        text = text.replace(marker, marker + "  const [exportGroup, setExportGroup] = useState('');\n", 1)

MAIN.write_text(text, encoding='utf-8')

# 9) Keep the HTML boot surface navy, but show the transparent Budget Bharat logo while
# React/Capacitor is mounting. It disappears as soon as #root receives children.
html = INDEX.read_text(encoding='utf-8')
if 'id="budget-bharat-boot-splash"' not in html:
    splash = '''\n  <style>#budget-bharat-boot-splash{position:fixed;inset:0;z-index:99999;background:#1E104B;display:flex;align-items:center;justify-content:center;transition:opacity .18s ease}.bb-boot-logo{width:min(62vw,260px);height:auto;object-fit:contain}.bb-boot-hidden{opacity:0;pointer-events:none}</style>\n'''
    html = html.replace('</head>', splash + '</head>', 1)
    html = html.replace('<body style="margin:0;background:#1E104B;">', '<body style="margin:0;background:#1E104B;">\n  <div id="budget-bharat-boot-splash"><img class="bb-boot-logo" src="/assets/icon.png" alt="Budget Bharat" /></div>', 1)
    html = html.replace('<div id="root" style="min-height:100vh;background:#F4F3F8;"></div>', '<div id="root" style="min-height:100vh;background:#F4F3F8;"></div>\n  <script>window.setTimeout(function(){var s=document.getElementById("budget-bharat-boot-splash");var r=document.getElementById("root");if(s&&r&&r.childElementCount){s.classList.add("bb-boot-hidden");setTimeout(function(){s.remove()},220)}},250);</script>', 1)
    INDEX.write_text(html, encoding='utf-8')

print('Phase 2 UX polish source pass complete.')
