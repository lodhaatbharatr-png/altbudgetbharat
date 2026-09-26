from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'src' / 'main.jsx'
text = MAIN.read_text(encoding='utf-8')


def replace_once(label, pattern, replacement, flags=re.S):
    global text
    text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')


# Use the official Capacitor Contacts plugin that matches Capacitor 5.
replace_once(
    'contacts plugin import',
    r"const loadContactsPlugin = async \(\) => \{.*?\n\};",
    '''const loadContactsPlugin = async () => {
  try {
    const mod = await import('@capacitor/contacts');
    return mod.Contacts;
  } catch (err) {
    console.error('Contacts plugin unavailable:', err);
    return null;
  }
};''',
)

# Normalize the official @capacitor/contacts Contact shape into the app's
# existing internal fields. Keep this small so the rest of Budget Bharat stays intact.
replace_once(
    'contact normalizer',
    r"const normalizeDeviceContact = \(contact\) => \(\{.*?\n\}\);",
    '''const normalizeDeviceContact = (contact) => ({
  contactId: contact?.id || contact?.rawId || '',
  _name: String(
    contact?.displayName ||
    [contact?.name?.givenName, contact?.name?.middleName, contact?.name?.familyName]
      .filter(Boolean).join(' ') ||
    ''
  ).trim(),
  _phone: String(
    contact?.phoneNumbers?.find(p => p?.value)?.value || ''
  ).trim(),
  _email: String(
    contact?.emails?.find(e => e?.value)?.value || ''
  ).trim(),
  _address: String(
    contact?.addresses?.find(a => a?.formatted || a?.street)?.formatted ||
    contact?.addresses?.find(a => a?.formatted || a?.street)?.street ||
    ''
  ).trim(),
});''',
)

# Replace the old permission + bulk getContacts flow with the native OS picker.
# @capacitor/contacts intentionally requests READ_CONTACTS internally when
# pickContact() is called on Android. There is no separate permission call,
# which removes the hanging getPermissions/requestPermissions round-trip.
replace_once(
    'native contact picker handler',
    r"  const openDeviceContactPicker = async \(\) => \{.*?\n  \};\n\n  const selectDeviceContact",
    '''  const openDeviceContactPicker = async () => {
    if (contactPickerLoading) return;
    setContactPickerLoading(true);
    showFeedback('Opening Contacts…');
    try {
      const Contacts = await loadContactsPlugin();
      if (!Contacts || typeof Contacts.pickContact !== 'function') {
        showFeedback('Device Contacts are unavailable in this APK.');
        return;
      }

      const picked = await Contacts.pickContact();
      if (!picked) {
        showFeedback('No contact selected.');
        return;
      }

      const normalized = normalizeDeviceContact(picked);
      if (!normalized._name && !normalized._phone && !normalized._email) {
        showFeedback('Selected contact has no usable details.');
        return;
      }

      setFormData(prev => ({
        ...prev,
        name: normalized._name || prev.name || '',
        phone: normalized._phone || prev.phone || '',
        email: normalized._email || prev.email || '',
        address: normalized._address || prev.address || '',
      }));
      showFeedback(`${normalized._name || 'Contact'} loaded`);
    } catch (err) {
      console.error('Device contact picker error:', err);
      const code = err?.code || '';
      if (code === 'OS-PLUG-CONT-0006') {
        showFeedback('Contact picker canceled.');
      } else if (code === 'OS-PLUG-CONT-0020') {
        showFeedback('Contacts permission was denied. Allow Contacts access in Android Settings and try again.');
      } else {
        showFeedback(`Unable to open contacts: ${err?.message || 'Please try again.'}`);
      }
    } finally {
      setContactPickerLoading(false);
    }
  };

  const selectDeviceContact''',
)

# Do not request contacts permission at startup. Android runtime permission is
# requested by the native picker only when the user actually taps Pick Contact.
replace_once(
    'startup contact preload',
    r"  // DEVICE_CONTACTS_PRELOAD_PHASE2\n  useEffect\(\(\) => \{.*?\n  \}, \[\]\);\n\n",
    '''  // DEVICE_CONTACTS_PRELOAD_PHASE2
  useEffect(() => {
    // Restore only previously cached suggestions. Do not touch the native
    // Contacts API during startup; the native picker owns the permission flow.
    try {
      const cached = readCachedDeviceContacts();
      if (cached.length) setDeviceContacts(cached);
    } catch (err) {
      console.warn('Cached contact preload skipped:', err);
    }
  }, []);

''',
)

MAIN.write_text(text, encoding='utf-8')
print('Applied official @capacitor/contacts native picker flow; removed startup permission request.')
