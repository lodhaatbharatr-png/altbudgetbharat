from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# ------------------------------------------------------------
# 1) Native Android contact picker: request permission first.
#    The previous build only called getPermissions(), so Android
#    never displayed the runtime permission dialog on a fresh install.
# ------------------------------------------------------------
p = ROOT / 'src' / 'main.jsx'
text = p.read_text(encoding='utf-8')

contact_handler = re.compile(
    r"  const openDeviceContactPicker = async \(\) => \{.*?\n  \};\n\n  const selectDeviceContact",
    re.S,
)
contact_replacement = '''  const openDeviceContactPicker = async () => {
    if (contactPickerLoading) return;
    setContactPickerLoading(true);
    showFeedback('Requesting Contacts permission…');
    try {
      let permission = null;
      try {
        if (typeof Contacts.requestPermissions === 'function') {
          permission = await Contacts.requestPermissions();
        } else if (typeof Contacts.getPermissions === 'function') {
          permission = await Contacts.getPermissions();
        }
      } catch (permissionError) {
        console.error('Contacts permission request failed:', permissionError);
      }

      const permissionGranted =
        permission?.granted === true ||
        permission?.readContacts === 'granted' ||
        permission?.contacts === 'granted';

      if (!permissionGranted) {
        showFeedback('Contacts permission was not granted. Allow Contacts access in Android settings and try again.');
        return;
      }

      showFeedback('Loading device contacts…');
      const result = await Contacts.getContacts();
      const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
      const usable = contacts
        .map((contact) => ({
          ...contact,
          _name: String(contact.displayName || contact.name?.display || '').trim(),
          _phone: String(contact.phoneNumbers?.find(p => p?.number)?.number || '').trim(),
          _email: String(contact.emails?.find(e => e?.address)?.address || '').trim(),
        }))
        .filter(contact => contact._name || contact._phone || contact._email);

      setDeviceContacts(usable);
      setContactPickerSearch('');
      setContactPickerOpen(true);
      showFeedback(`${usable.length} device contacts loaded`);
    } catch (err) {
      console.error('Device contact picker error:', err);
      showFeedback('Unable to open device contacts. Please allow Contacts permission and try again.');
    } finally {
      setContactPickerLoading(false);
    }
  };

  const selectDeviceContact'''
text, contact_count = contact_handler.subn(contact_replacement, text, count=1)
print(f'Contact picker handler replaced: {contact_count}')

# ------------------------------------------------------------
# 2) Search results: category-chip filtering must use the same
#    normalized category matching as typed global search.
#    Search result transaction rows must pass the existing edit
#    callback so they behave exactly like Home/Records rows.
# ------------------------------------------------------------
text = text.replace(
    "const SearchView = ({ onSelectPerson }) => {",
    "const SearchView = ({ onSelectPerson, onSelectTransaction }) => {",
    1,
)
text = text.replace(
    "(t.category && t.category.toLowerCase().includes(query)) ||",
    "(t.category && String(t.category).trim().toLowerCase().includes(query)) ||",
    1,
)
text = text.replace(
    "<TransactionTable transactions={matchedTransactions} maxRows={100} showViewAll={false} />",
    "<TransactionTable transactions={matchedTransactions} maxRows={100} showViewAll={false} onSelectTransaction={onSelectTransaction} />",
    1,
)
print('Search category normalization and editable transaction-row callback applied.')

# ------------------------------------------------------------
# 3) Payment reminder: clean ticket layout, no watermark, with
#    logo on the left and sender text on the right in one footer
#    container. Preserve logo aspect ratio; never stretch it.
# ------------------------------------------------------------
start = text.find('const createPaymentReminderImage = async ({ personName, amount, dueDate, loanName, emiNo, admin }) => {')
if start >= 0:
    end = text.find('\n\nconst AppContext = createContext();', start)
    if end < 0:
        raise SystemExit('Payment reminder function end marker not found')

    replacement = r'''const createPaymentReminderImage = async ({ personName, amount, dueDate, loanName, emiNo, admin }) => {
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

  // Ticket body with generous top breathing room.
  const ticketX = 48, ticketY = 30, ticketW = width - 96, ticketH = height - 60;
  ctx.save();
  roundRect(ticketX, ticketY, ticketW, ticketH, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  // Ticket perforation.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(ticketX, ticketY + ticketH * 0.61, 24, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ticketX + ticketW, ticketY + ticketH * 0.61, 24, Math.PI / 2, Math.PI * 1.5);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#D8D3E0';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 10]);
  ctx.beginPath();
  ctx.moveTo(ticketX + 34, ticketY + ticketH * 0.61);
  ctx.lineTo(ticketX + ticketW - 34, ticketY + ticketH * 0.61);
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

  // Footer: logo left + sender details right, horizontally aligned.
  const footerX = ticketX + 55;
  const footerY = ticketY + ticketH * 0.61 + 48;
  const footerW = ticketW - 110;
  const footerH = 88;
  roundRect(footerX, footerY, footerW, footerH, 18);
  ctx.fillStyle = '#F4F3F8';
  ctx.fill();

  const logoSrc = Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED;
  if (logoSrc) {
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxLogoW = 180;
        const maxLogoH = 58;
        const scale = Math.min(maxLogoW / img.width, maxLogoH / img.height);
        const logoW = Math.max(1, img.width * scale);
        const logoH = Math.max(1, img.height * scale);
        const logoX = footerX + 18 + (maxLogoW - logoW) / 2;
        const logoY = footerY + (footerH - logoH) / 2;
        ctx.drawImage(img, logoX, logoY, logoW, logoH);
        resolve();
      };
      img.onerror = resolve;
      img.src = logoSrc;
    });
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#1E104B';
  ctx.font = '900 20px sans-serif';
  ctx.fillText(`Sent by ${admin?.name || 'BHARAT RASVE'}`, footerX + 225, footerY + 27);
  ctx.fillStyle = '#625E70';
  ctx.font = '800 18px sans-serif';
  ctx.fillText(String(admin?.contact || '7218838122'), footerX + 225, footerY + 53);
  ctx.fillStyle = '#625E70';
  ctx.font = '700 16px sans-serif';
  ctx.fillText('Budget Bharat Personal Finance App', footerX + 225, footerY + 75);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8A8596';
  ctx.font = '700 15px sans-serif';
  ctx.fillText('Payment reminder', centerX, height - 18);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Unable to create reminder image.')), 'image/jpeg', 0.92);
  });
  return new File([blob], `Budget_Bharat_Payment_Reminder_${Date.now()}.jpg`, { type: 'image/jpeg' });
};'''
    text = text[:start] + replacement + text[end:]
else:
    print('Payment reminder function not found; leaving current implementation unchanged.')

p.write_text(text, encoding='utf-8')

# ------------------------------------------------------------
# 4) All DOM image exports get a small, consistent top inset.
#    The cloned render height is expanded so content is never clipped.
# ------------------------------------------------------------
ep = ROOT / 'src' / 'export' / 'exportService.js'
export_text = ep.read_text(encoding='utf-8')
old_render = """    style: options.style || undefined\n  });"""
new_render = """    style: {
      boxSizing: 'border-box',
      paddingTop: options.topPadding || '18px',
      ...(options.style || {})
    }
  });"""
if old_render in export_text:
    export_text = export_text.replace(old_render, new_render, 1)
export_text = export_text.replace(
    "const height = Math.ceil(rect.height || element.offsetHeight || element.scrollHeight || 800);",
    "const baseHeight = Math.ceil(rect.height || element.offsetHeight || element.scrollHeight || 800);\n  const topPadding = Math.max(0, Number.parseInt(options.topPadding || '18', 10) || 18);\n  const height = baseHeight + topPadding;",
    1,
)
ep.write_text(export_text, encoding='utf-8')
print('DOM image export top padding applied.')

# ------------------------------------------------------------
# 5) Native startup splash: eliminate the white flash and show
#    the authoritative Budget Bharat icon on dark navy while
#    React/Vite mounts. It is removed automatically once #root
#    receives the app UI.
# ------------------------------------------------------------
ip = ROOT / 'index.html'
index = ip.read_text(encoding='utf-8')
index = index.replace('<html lang="en" style="background:#F4F3F8;">', '<html lang="en" style="background:#1E104B;">', 1)
index = index.replace('<meta name="theme-color" content="#F4F3F8" />', '<meta name="theme-color" content="#1E104B" />', 1)
index = index.replace('<body style="margin:0;background:#F4F3F8;">', '<body style="margin:0;background:#1E104B;">', 1)
root_old = '<div id="root" style="min-height:100vh;background:#F4F3F8;"></div>'
root_new = '''<div id="root" style="min-height:100vh;background:#F4F3F8;"></div>
  <div id="bb-startup-splash" style="position:fixed;inset:0;z-index:2147483647;background:#1E104B;display:flex;align-items:center;justify-content:center;opacity:1;transition:opacity .18s ease-out;">
    <img src="assets/icon.png" alt="Budget Bharat" style="width:118px;height:118px;object-fit:contain;display:block;" />
  </div>
  <script>
    (function () {
      var splash = document.getElementById('bb-startup-splash');
      var root = document.getElementById('root');
      var remove = function () {
        if (!splash || !root || !root.firstElementChild) return;
        splash.style.opacity = '0';
        setTimeout(function () { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); }, 220);
      };
      if (root) {
        new MutationObserver(remove).observe(root, { childList: true, subtree: true });
        if (root.firstElementChild) remove();
      }
      window.addEventListener('load', function () { setTimeout(remove, 150); }, { once: true });
    })();
  </script>'''
if root_old in index:
    index = index.replace(root_old, root_new, 1)
ip.write_text(index, encoding='utf-8')
print('Native startup splash added.')

print('Contact/search/reminder/export/startup hotfix complete.')
