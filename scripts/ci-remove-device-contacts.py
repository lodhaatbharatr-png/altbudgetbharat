from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'main.jsx'
text = path.read_text(encoding='utf-8')

# Remove the device-contact plugin helpers/cache from the module header.
text, n = re.subn(
    r"\nconst loadContactsPlugin = async \(\) => \{.*?\nconst SafePortal =",
    "\nconst SafePortal =",
    text,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit('Device-contact module helper block not found')

# Remove the startup cached-contact preload effect.
text, n = re.subn(
    r"\n  // DEVICE_CONTACTS_PRELOAD_PHASE2\n  useEffect\(\(\) => \{.*?\n  \}, \[\]\);\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit('Device-contact preload block not found')

# Remove SideMenu state and native picker functions.
text, n = re.subn(
    r"\n  const \[contactPickerOpen, setContactPickerOpen\] = useState\(false\);.*?\n  const exportGroup",
    "\n  const exportGroup",
    text,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit('Device-contact SideMenu state/functions block not found')

# Remove all cached-device-contact autocomplete dropdowns injected around form inputs.
text, n = re.subn(
    r"\n\s*\{String\(formData\.name \|\| ''\).*?</div>\n\s*\)\}",
    "",
    text,
    flags=re.S,
)
if n == 0:
    raise SystemExit('Device-contact autocomplete blocks not found')

# Remove cached-contact onFocus handlers left on the form fields.
text, n = re.subn(
    r"\n\s*onFocus=\{\(\) => \{\n\s*const cached = readCachedDeviceContacts\(\);\n\s*if \(cached\.length && !deviceContacts\.length\) setDeviceContacts\(cached\);\n\s*\}\}",
    "",
    text,
    flags=re.S,
)

# Remove the Device Contacts action next to the Add/Edit Person name field.
text, n = re.subn(
    r"\n\s*<button\n\s*type=\"button\"\n\s*onClick=\{openDeviceContactPicker\}.*?\n\s*</button>",
    "",
    text,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit('Device Contacts UI button not found')

# Remove the legacy in-app device-contact picker modal.
text, n = re.subn(
    r"\n\s*\{contactPickerOpen && \(.*?\n\s*\)\}\n\n\s*</div>\n\s*\);\n\};\n\nconst HomeView",
    "\n\n    </div>\n  );\n};\n\nconst HomeView",
    text,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit('Device-contact picker modal not found')

# Sanity checks: no contact picker code must remain in the shipped source.
leftovers = [
    '@capacitor/contacts',
    'loadContactsPlugin',
    'DEVICE_CONTACTS_CACHE_KEY',
    'deviceContacts',
    'contactPickerOpen',
    'openDeviceContactPicker',
    'selectDeviceContact',
    'Device Contacts',
    'READ_CONTACTS',
    'WRITE_CONTACTS',
]
found = [x for x in leftovers if x in text]
if found:
    raise SystemExit('Contact cleanup incomplete; leftovers: ' + ', '.join(found))

path.write_text(text, encoding='utf-8')
print('Device contact picker removed from src/main.jsx.')
