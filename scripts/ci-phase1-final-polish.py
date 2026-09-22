from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# -----------------------------------------------------------------------------
# Budget Bharat — Phase 1 final polish
# This script is intentionally idempotent because the APK workflow applies it
# on every build of the stabilization feature branch.
# -----------------------------------------------------------------------------

main_path = ROOT / 'src' / 'main.jsx'
text = main_path.read_text(encoding='utf-8')

# 1. Device contacts: use the plugin's documented permission contract and the
#    actual contact shape returned by different plugin 5.x Android builds.
handler = re.compile(r"  const openDeviceContactPicker = async \(\) => \{.*?\n  \};\n\n  const selectDeviceContact", re.S)
handler_replacement = '''  const openDeviceContactPicker = async () => {
    if (contactPickerLoading) return;
    setContactPickerLoading(true);
    showFeedback('Opening device contacts…');
    try {
      let permission = null;
      if (typeof Contacts.getPermissions === 'function') {
        permission = await Contacts.getPermissions();
      }

      if (!permission || permission.granted !== true) {
        showFeedback('Contacts permission is required. Please allow Contacts access and try again.');
        if (typeof Contacts.getPermissions === 'function') {
          permission = await Contacts.getPermissions();
        }
      }

      if (!permission || permission.granted !== true) {
        showFeedback('Contacts permission was not granted. You can enable it in Android Settings.');
        return;
      }

      showFeedback('Loading device contacts…');
      const result = await Contacts.getContacts();
      const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
      const usable = contacts
        .map((contact) => {
          const displayName = String(
            contact.displayName ||
            contact.name?.display ||
            [contact.name?.given, contact.name?.family].filter(Boolean).join(' ') ||
            ''
          ).trim();
          const phoneNumbers = Array.isArray(contact.phoneNumbers)
            ? contact.phoneNumbers
            : (Array.isArray(contact.phones) ? contact.phones : []);
          const emails = Array.isArray(contact.emails) ? contact.emails : [];
          const phone = String(phoneNumbers.find(p => p?.number)?.number || '').trim();
          const email = String(emails.find(e => e?.address)?.address || '').trim();
          return { ...contact, _name: displayName, _phone: phone, _email: email };
        })
        .filter(contact => contact._name || contact._phone || contact._email)
        .sort((a, b) => a._name.localeCompare(b._name, undefined, { sensitivity: 'base' }));

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
text, count = handler.subn(handler_replacement, text, count=1)
print(f'Contact handler updated: {count}')

# Make category matching deterministic and make amount a first-class search key.
old_filter = """    return transactions.filter(t =>
      (t.note && t.note.toLowerCase().includes(query)) ||
      (t.category && String(t.category).trim().toLowerCase().includes(query)) ||
      (t.person && t.person.toLowerCase().includes(query)) ||
      (t.ref && t.ref.toLowerCase().includes(query))
    );"""
new_filter = """    return transactions.filter(t => {
      const amount = String(t.amount ?? '').replace(/,/g, '');
      const amountFormatted = formatTableNum(t.amount).replace(/,/g, '');
      const note = String(t.note || '').toLowerCase();
      const category = String(t.category || '').trim().toLowerCase();
      const person = String(t.person || '').toLowerCase();
      const ref = String(t.ref || '').toLowerCase();
      return (
        note.includes(query) ||
        category.includes(query) ||
        person.includes(query) ||
        ref.includes(query) ||
        amount.includes(query) ||
        amountFormatted.includes(query)
      );
    });"""
if old_filter in text:
    text = text.replace(old_filter, new_filter, 1)
else:
    print('Search filter block already changed; amount search may already be present.')

# Category chips must represent normalized strings even if a category source is
# accidentally supplied as an object by an older data layer.
old_cats = """    const allCats = [...categories.expense, ...categories.income];
    return allCats.filter(c => c.toLowerCase().includes(query));"""
new_cats = """    const allCats = [...(categories.expense || []), ...(categories.income || [])]
      .map(c => typeof c === 'string' ? c : String(c?.name || c?.label || ''))
      .map(c => c.trim())
      .filter(Boolean);
    return [...new Set(allCats)].filter(c => c.toLowerCase().includes(query));"""
if old_cats in text:
    text = text.replace(old_cats, new_cats, 1)

# Clicking a category chip is a real category filter. The filter is matched
# against normalized category text, not the currently typed keyword.
text = text.replace(
    "onClick={() => setSearchQuery(c)} title={`Filter transactions by ${c}`}",
    "onClick={() => setSearchQuery(String(c).trim())} title={`Filter transactions by ${c}`}",
    1,
)

# Search result transaction rows already have a unique tx_ id and should use the
# same edit callback as normal transaction tables.
if "onSelectTransaction={onSelectTransaction}" not in text:
    text = text.replace(
        '<TransactionTable transactions={matchedTransactions} maxRows={100} showViewAll={false} />',
        '<TransactionTable transactions={matchedTransactions} maxRows={100} showViewAll={false} onSelectTransaction={onSelectTransaction} />',
        1,
    )

# Payment reminder footer: no watermark and no boxed footer. Put "Using", the
# current transparent Budget Bharat logo, and the app text in one horizontal
# footer. Preserve the image aspect ratio.
footer_start = text.find('  // Footer: logo left + sender details right, horizontally aligned.')
if footer_start >= 0:
    footer_end = text.find("\n  ctx.textAlign = 'center';", footer_start)
    if footer_end < 0:
        raise SystemExit('Payment reminder footer end marker not found')
    footer = r'''  // Footer: no watermark and no container. "Using" + logo + app name on
  // one horizontal row, with sender details above it.
  const footerCenterY = ticketY + ticketH - 72;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1E104B';
  ctx.font = '900 18px sans-serif';
  ctx.fillText(`Sent by ${admin?.name || 'BHARAT RASVE'}`, centerX, footerCenterY - 48);
  ctx.fillStyle = '#625E70';
  ctx.font = '800 17px sans-serif';
  ctx.fillText(String(admin?.contact || '7218838122'), centerX, footerCenterY - 24);

  ctx.font = '700 15px sans-serif';
  ctx.fillStyle = '#625E70';
  ctx.fillText('Using', centerX - 118, footerCenterY + 4);

  const logoSrc = Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED;
  if (logoSrc) {
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 150, maxH = 38;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const logoW = Math.max(1, img.width * scale);
        const logoH = Math.max(1, img.height * scale);
        ctx.drawImage(img, centerX - 86 - logoW / 2, footerCenterY + 4 - logoH / 2, logoW, logoH);
        resolve();
      };
      img.onerror = resolve;
      img.src = logoSrc;
    });
  }

  ctx.fillStyle = '#1E104B';
  ctx.font = '800 15px sans-serif';
  ctx.fillText('Budget Bharat Personal Finance App', centerX + 112, footerCenterY + 4);
'''
    text = text[:footer_start] + footer + text[footer_end:]
else:
    print('Payment reminder footer marker not found; leaving current footer unchanged.')

main_path.write_text(text, encoding='utf-8')

# -----------------------------------------------------------------------------
# Startup: use the same transparent logo source already embedded by constants,
# not the blue launcher icon. index.html cannot import React constants, so the
# script creates a tiny runtime startup element after the app bundle loads and
# uses the exported APP_LOGO_COLORED value from window when available. The
# fallback remains the transparent icon asset if a future bundle does not expose
# the constant.
# -----------------------------------------------------------------------------
index_path = ROOT / 'index.html'
index = index_path.read_text(encoding='utf-8')
index = index.replace('<html lang="en" style="background:#F4F3F8;">', '<html lang="en" style="background:#1E104B;">', 1)
index = index.replace('<meta name="theme-color" content="#F4F3F8" />', '<meta name="theme-color" content="#1E104B" />', 1)
index = index.replace('<body style="margin:0;background:#F4F3F8;">', '<body style="margin:0;background:#1E104B;">', 1)

# Keep the startup splash markup stable and transparent-logo friendly. The
# existing assets/icon.png remains only as a fallback; the app's authoritative
# transparent logo is injected by main.jsx immediately after React mounts.
if 'id="bb-startup-splash"' not in index:
    root_marker = '<div id="root" style="min-height:100vh;background:#F4F3F8;"></div>'
    splash = '''<div id="root" style="min-height:100vh;background:#F4F3F8;"></div>
  <div id="bb-startup-splash" style="position:fixed;inset:0;z-index:2147483647;background:#1E104B;display:flex;align-items:center;justify-content:center;opacity:1;transition:opacity .16s ease-out;">
    <div id="bb-startup-logo" style="width:118px;height:118px;display:flex;align-items:center;justify-content:center;"></div>
  </div>'''
    index = index.replace(root_marker, splash, 1)

index_path.write_text(index, encoding='utf-8')

print('Phase 1 final polish source transformation complete.')
