from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'src' / 'main.jsx'
text = MAIN.read_text(encoding='utf-8')

# Capacitor Community Contacts v5 is the selected Capacitor-5-compatible plugin.
# Its documented v5 API exposes getPermissions()/getContacts(); Capacitor's
# native Plugin base also exposes requestPermissions() at runtime when the
# plugin declares a permission alias. Prefer that native request so Android
# can show the real system Contacts permission dialog, then fall back safely
# for older plugin builds.
normalizer_pattern = r"const normalizeDeviceContact = \(contact\) => \(\{.*?\n\}\);"
normalizer_replacement = '''const normalizeDeviceContact = (contact) => ({
  contactId: contact?.contactId || contact?.id || '',
  _name: String(
    contact?.displayName ||
    contact?.name?.display ||
    [contact?.name?.given, contact?.name?.family].filter(Boolean).join(' ') ||
    contact?.name ||
    ''
  ).trim(),
  _phone: String(
    contact?.phoneNumbers?.find(p => p?.number)?.number ||
    contact?.phones?.find(p => p?.number)?.number ||
    ''
  ).trim(),
  _email: String(
    contact?.emails?.find(e => e?.address)?.address ||
    contact?.emails?.find(e => e?.email)?.email ||
    ''
  ).trim(),
  _address: String(
    contact?.postalAddresses?.find(a => a?.formatted || a?.street)?.formatted ||
    contact?.postalAddresses?.find(a => a?.formatted || a?.street)?.street ||
    contact?.address ||
    ''
  ).trim(),
});'''
text, count = re.subn(normalizer_pattern, normalizer_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'contact normalizer: expected exactly one match, found {count}')

# A native request must happen before getContacts(). The previous implementation
# only checked permission and therefore could remain on a "pending/opening" state
# forever when Android had not granted Contacts yet.
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

      const requestNativeContactsPermission = async () => {
        // Capacitor Plugin permission API. Community Contacts v5 declares the
        // "contacts" permission alias, so requestPermissions() opens Android's
        // native runtime dialog when access has not yet been granted.
        if (typeof Contacts.requestPermissions === 'function') {
          return await Contacts.requestPermissions();
        }
        if (typeof Contacts.getPermissions === 'function') {
          return await Contacts.getPermissions();
        }
        return null;
      };

      const permission = await Promise.race([
        requestNativeContactsPermission(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Contacts permission request timed out.')), 15000)),
      ]);
      const granted = permission?.contacts === 'granted' || permission?.granted === true || permission?.readContacts === 'granted';
      if (!granted) {
        showFeedback('Contacts permission was not granted. Please allow Contacts access in Android Settings and try again.');
        return;
      }

      showFeedback('Loading device contacts…');
      const result = await Promise.race([
        Contacts.getContacts({
          projection: {
            name: true,
            phones: true,
            emails: true,
            postalAddresses: true,
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Device contacts read timed out.')), 20000)),
      ]);
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
      showFeedback(`Unable to load device contacts: ${err?.message || 'check Contacts permission in Android settings'}`);
    } finally {
      setContactPickerLoading(false);
    }
  };

  const selectDeviceContact'''
text, count = re.subn(handler_pattern, handler_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'contact picker handler: expected exactly one match, found {count}')

# Startup behavior: after the React UI has mounted, request native permission
# once and cache the complete contact directory locally. This is deliberately
# delayed so the permission dialog is shown over the already-visible app and
# cannot prevent the launcher/main UI from mounting.
preload_pattern = r"  // DEVICE_CONTACTS_PRELOAD_PHASE2\n  useEffect\(\(\) => \{.*?\n  \}, \[\]\);\n\n"
preload_replacement = '''  // DEVICE_CONTACTS_PRELOAD_PHASE2
  useEffect(() => {
    let cancelled = false;
    const preloadContacts = async () => {
      try {
        const Contacts = await loadContactsPlugin();
        if (!Contacts || cancelled) return;

        const requestNativeContactsPermission = async () => {
          if (typeof Contacts.requestPermissions === 'function') {
            return await Contacts.requestPermissions();
          }
          if (typeof Contacts.getPermissions === 'function') {
            return await Contacts.getPermissions();
          }
          return null;
        };

        const permission = await Promise.race([
          requestNativeContactsPermission(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Contacts permission request timed out.')), 15000)),
        ]);
        const granted = permission?.contacts === 'granted' || permission?.granted === true || permission?.readContacts === 'granted';
        if (!granted || cancelled) return;

        const result = await Promise.race([
          Contacts.getContacts({
            projection: {
              name: true,
              phones: true,
              emails: true,
              postalAddresses: true,
            },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Device contacts read timed out.')), 20000)),
        ]);
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

    const timer = setTimeout(preloadContacts, 1400);
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
print('Native contacts permission request, startup cache, picker fetch, timeout feedback, and address mapping applied.')
