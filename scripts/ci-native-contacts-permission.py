from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'src' / 'main.jsx'
text = MAIN.read_text(encoding='utf-8')

# Normalize the contact reader for the Capacitor Community Contacts v5 API.
# v5 exposes requestPermissions()/getPermissions() and returns contacts as
# name/phones/emails/postalAddresses projections.
normalizer_pattern = r"const normalizeDeviceContact = \(contact\) => \(\{.*?\n\}\);"
normalizer_replacement = '''const normalizeDeviceContact = (contact) => ({
  contactId: contact?.contactId || contact?.id || '',
  _name: String(contact?.displayName || contact?.name?.display || contact?.name?.given || '').trim(),
  _phone: String(contact?.phoneNumbers?.find(p => p?.number)?.number || contact?.phones?.find(p => p?.number)?.number || '').trim(),
  _email: String(contact?.emails?.find(e => e?.address)?.address || contact?.emails?.find(e => e?.email)?.email || '').trim(),
  _address: String(
    contact?.postalAddresses?.find(a => a)?.formatted ||
    contact?.postalAddresses?.find(a => a)?.street ||
    contact?.address ||
    ''
  ).trim(),
});'''
text, count = re.subn(normalizer_pattern, normalizer_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'contact normalizer: expected exactly one match, found {count}')

# Replace the picker handler after all previous Phase-2 transformations have run.
handler_pattern = r"  const openDeviceContactPicker = async \(\) => \{.*?\n  \};\n\n  const selectDeviceContact"
handler_replacement = '''  const openDeviceContactPicker = async () => {
    if (contactPickerLoading) return;
    setContactPickerLoading(true);
    showFeedback('Requesting Contacts permission…');
    try {
      const Contacts = await loadContactsPlugin();
      if (!Contacts) {
        showFeedback('Device Contacts are unavailable in this APK.');
        return;
      }

      let permission = null;
      if (typeof Contacts.checkPermissions === 'function') {
        permission = await Contacts.checkPermissions();
      } else if (typeof Contacts.getPermissions === 'function') {
        permission = await Contacts.getPermissions();
      }

      const grantedBefore = permission?.contacts === 'granted' || permission?.granted === true;
      if (!grantedBefore && typeof Contacts.requestPermissions === 'function') {
        permission = await Contacts.requestPermissions();
      }

      const granted = permission?.contacts === 'granted' || permission?.granted === true;
      if (!granted) {
        showFeedback('Contacts permission was not granted. Enable Contacts access in Android Settings and try again.');
        return;
      }

      showFeedback('Loading device contacts…');
      const result = await Contacts.getContacts({
        projection: {
          name: true,
          phones: true,
          emails: true,
          postalAddresses: true,
        },
      });
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
      showFeedback(`Unable to load device contacts: ${err?.message || 'check Contacts permission in Android Settings'}`);
    } finally {
      setContactPickerLoading(false);
    }
  };

  const selectDeviceContact'''
text, count = re.subn(handler_pattern, handler_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'contact picker handler: expected exactly one match, found {count}')

# Make startup request the native Android permission once the app UI has mounted.
# If already granted, immediately refresh the local cache. This is deliberately
# asynchronous so a native permission dialog cannot block React startup.
preload_pattern = r"  // DEVICE_CONTACTS_PRELOAD_PHASE2\n  useEffect\(\(\) => \{.*?\n  \}, \[\]\);\n\n"
preload_replacement = '''  // DEVICE_CONTACTS_PRELOAD_PHASE2
  useEffect(() => {
    let cancelled = false;
    const preloadContacts = async () => {
      try {
        const Contacts = await loadContactsPlugin();
        if (!Contacts || cancelled) return;

        let permission = null;
        if (typeof Contacts.checkPermissions === 'function') {
          permission = await Contacts.checkPermissions();
        } else if (typeof Contacts.getPermissions === 'function') {
          permission = await Contacts.getPermissions();
        }

        const grantedBefore = permission?.contacts === 'granted' || permission?.granted === true;
        if (!grantedBefore && typeof Contacts.requestPermissions === 'function') {
          permission = await Contacts.requestPermissions();
        }

        const granted = permission?.contacts === 'granted' || permission?.granted === true;
        if (!granted || cancelled) return;

        const result = await Contacts.getContacts({
          projection: {
            name: true,
            phones: true,
            emails: true,
            postalAddresses: true,
          },
        });
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
        console.warn('Startup contact permission/cache pass skipped:', err);
      }
    };

    const timer = setTimeout(preloadContacts, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

'''
text, count = re.subn(preload_pattern, preload_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'contact startup preload: expected exactly one match, found {count}')

# Keep address population when a contact is selected.
if 'address: contact._address || prev.address ||' not in text:
    select_pattern = r"(email: contact\._email \|\| prev\.email \|\| '',)(\n\s*\}\)\);)"
    select_replacement = r"\1\n      address: contact._address || prev.address || '',\2"
    text, count = re.subn(select_pattern, select_replacement, text, count=1)
    if count != 1:
        raise SystemExit(f'contact address mapping: expected exactly one match, found {count}')

MAIN.write_text(text, encoding='utf-8')
print('Native contacts permission request, startup preload, picker fetch, and address mapping applied.')
