from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'main.jsx'
text = path.read_text(encoding='utf-8')

# Device Contacts is retired. This pass intentionally runs AFTER all Phase 1/2
# source generators, so it is the final authority: no contact plugin import,
# loader, cache helper, handler, picker button, or preload may reach Vite.

# 1) Remove the package reference first. This is the critical build guard:
# @capacitor/contacts is no longer installed and Rollup must never see it.
text = re.sub(
    r"\s*const\s+mod\s*=\s*await\s+import\(['\"]@capacitor/contacts['\"]\);\s*\n\s*return\s+mod\.Contacts;",
    "\n    return null;",
    text,
    count=1,
)
text = re.sub(
    r"await\s+import\(['\"]@capacitor/contacts['\"]\)",
    "Promise.resolve(null)",
    text,
)

# 2) Remove the entire plugin loader and retired cache/normalization helpers.
# Match each helper independently so formatting changes in generated code do
# not make cleanup dependent on one exact surrounding block.
text = re.sub(
    r"\nconst\s+loadContactsPlugin\s*=\s*async\s*\(\)\s*=>\s*\{.*?\n\};\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r"\nconst\s+DEVICE_CONTACTS_CACHE_KEY\s*=.*?\nconst\s+normalizeDeviceContact\s*=.*?\n\};\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r"\nconst\s+readCachedDeviceContacts\s*=\s*\(\)\s*=>\s*\{.*?\n\};\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r"\nconst\s+cacheDeviceContacts\s*=\s*\(contacts\)\s*=>\s*\{.*?\n\};\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)

# 3) Remove any generated startup contact preload effect.
text = re.sub(
    r"\n\s*// DEVICE_CONTACTS_PRELOAD_PHASE2.*?\n\s*\}, \[\]\);\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)

# 4) Remove the contact-opening handler. Keep a harmless local stub only if
# surrounding source still references the function; normally the button is
# removed below and the function disappears entirely.
text = re.sub(
    r"\n\s*const\s+openDeviceContactPicker\s*=\s*async\s*\(\)\s*=>\s*\{.*?\n\s*\};\n\s*\n\s*const\s+selectDeviceContact",
    "\n\n  const selectDeviceContact",
    text,
    count=1,
    flags=re.S,
)

# 5) Remove the visible Device Contacts button, regardless of minor JSX
# attribute changes introduced by previous UX passes.
text = re.sub(
    r"\n\s*<button\b(?=[^>]*onClick=\{openDeviceContactPicker\})[^>]*>.*?\n\s*</button>",
    "",
    text,
    count=1,
    flags=re.S,
)

# 6) Remove contact-only suggestion/preload UI if it remains around the Add
# Person name field. The normal name input must remain untouched.
text = re.sub(
    r"\{String\(formData\.name \|\| ''\)\.trim\(\)\.length >= 1 && deviceContacts\.length > 0 && \(.*?\)\}",
    "",
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r"\n\s*onFocus=\{\(\) => \{\s*const cached = readCachedDeviceContacts\(\);.*?\n\s*\}\}\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)

# 7) Remove any remaining contact-specific state declarations. These are safe
# to remove because the feature itself is retired.
text = re.sub(r"\n\s*const \[contactPickerLoading, setContactPickerLoading\] = useState\(false\);", "", text, count=1)
text = re.sub(r"\n\s*const \[contactPickerOpen, setContactPickerOpen\] = useState\(false\);", "", text, count=1)
text = re.sub(r"\n\s*const \[contactPickerSearch, setContactPickerSearch\] = useState\(''\);", "", text, count=1)
text = re.sub(r"\n\s*const \[deviceContacts, setDeviceContacts\] = useState\([^;]*\);", "", text, count=1)

# 8) Final hard guard: if any plugin import survived in a future generated
# variant, neutralize the exact dynamic import so Vite cannot resolve it.
text = text.replace("import('@capacitor/contacts')", "null")

path.write_text(text, encoding='utf-8')

remaining = text.count('@capacitor/contacts')
print(f'Device contact feature disabled: retired code stripped; remaining plugin references={remaining}.')
