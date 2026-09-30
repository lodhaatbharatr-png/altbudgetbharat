from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src' / 'main.jsx'
PACKAGE = ROOT / 'package.json'

# This is a regression guard, not a source rewriter. Fail if a future CI
# transformation reintroduces the retired Device Contacts feature.
source = SOURCE.read_text(encoding='utf-8')
for marker in (
    'contactPickerOpen',
    'contactPickerSearch',
    'deviceContacts',
    'openDeviceContactPicker',
    'selectDeviceContact',
    'loadContactsPlugin',
    'DEVICE_CONTACTS_PRELOAD_PHASE2',
    '@capacitor/contacts',
    '@capacitor-community/contacts',
    'Select Device Contact',
    'Search device contacts',
):
    if marker in source:
        raise SystemExit(f'Retired Device Contacts marker found in src/main.jsx: {marker}')

package = PACKAGE.read_text(encoding='utf-8')
if re.search(r'["\']@capacitor(?:-community)?/contacts["\']\s*:', package):
    raise SystemExit('Retired Capacitor Contacts plugin is still declared in package.json')

# Check native Android config where present. Some branches generate Android
# during CI, so absence of a committed android/ directory is allowed.
for native_root in (ROOT / 'android', ROOT / 'capacitor-cordova-android-plugins'):
    if not native_root.exists():
        continue
    for path in native_root.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in {'.xml', '.gradle', '.kts', '.java', '.kt'}:
            continue
        try:
            body = path.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        if re.search(r'android\.permission\.(?:READ|WRITE)_CONTACTS|READ_CONTACTS|WRITE_CONTACTS|@capacitor-community/contacts', body, re.I):
            raise SystemExit(f'Retired contacts permission/plugin reference found: {path.relative_to(ROOT)}')

print('Retired Device Contacts feature is absent from source, dependencies, and available native Android configuration.')
