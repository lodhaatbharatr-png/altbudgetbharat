from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'main.jsx'
text = path.read_text(encoding='utf-8')

# Device Contacts is retired. This pass runs LAST, after every Phase 1/2
# generator. It must leave valid JSX as well as zero plugin references.

# 1) Remove the entire generated category/contact suggestion block. Previous
# cleanup attempted to remove individual <button> elements, which could leave
# their surrounding JSX containers unbalanced. Replace the whole conditional
# block with the original simple category-name input.
category_block = re.compile(
    r"\n\s*\{\(menuView === 'addCategory' \|\| menuView === 'editCategory'\) && \(.*?\n\s*\}\)\n\s*\n\s*\{\(menuView === 'addPerson' \|\| menuView === 'editPerson'\) && \(",
    re.S,
)
category_replacement = '''
                {(menuView === 'addCategory' || menuView === 'editCategory') && (
                  <div>
                    <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">Category Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      autoComplete="off"
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none"
                    />
                  </div>
                )}

                {(menuView === 'addPerson' || menuView === 'editPerson') && ('''
text, category_count = category_block.subn(category_replacement, text, count=1)

# 2) Replace the Add Person/Edit Person name section with a clean plain input.
# This removes all contact suggestions and cached-contact focus behavior while
# preserving the existing Name field and form state.
person_name = re.compile(
    r"\n\s*<div>\n\s*<div className=\"flex items-center justify-between mb-1\">\n\s*<label[^>]*>Name \*</label>\n\s*</div>\n\s*<div className=\"relative\">.*?\n\s*</div>\n\s*</div>\n\s*<div>\n\s*<label[^>]*>Phone</label>",
    re.S,
)
person_name_replacement = '''
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-bold text-[#625E70] uppercase">Name *</label>
                      </div>
                      <input
                        type="text"
                        required
                        value={formData.name || ''}
                        autoComplete="off"
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">Phone</label>'''
text, person_count = person_name.subn(person_name_replacement, text, count=1)

# 3) Remove the native/device contact handler and helpers regardless of which
# generator version produced them.
text = re.sub(
    r"\n\s*const\s+openDeviceContactPicker\s*=\s*async\s*\(\)\s*=>\s*\{.*?\n\s*\};\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
text = re.sub(
    r"\n\s*const\s+selectDeviceContact\s*=\s*\([^\n]*\)\s*=>\s*\{.*?\n\s*\};\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)
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
text = re.sub(r"\nconst\s+readCachedDeviceContacts\s*=.*?\n\};\n", "\n", text, count=1, flags=re.S)
text = re.sub(r"\nconst\s+cacheDeviceContacts\s*=.*?\n\};\n", "\n", text, count=1, flags=re.S)

# 4) Remove any generated startup contact preload effect.
text = re.sub(
    r"\n\s*// DEVICE_CONTACTS_PRELOAD_PHASE2.*?\n\s*\}, \[\]\);\n",
    "\n",
    text,
    count=1,
    flags=re.S,
)

# 5) Remove the visible Device Contacts action if a generator still emits it.
text = re.sub(
    r"\n\s*<button\b[^>]*onClick=\{openDeviceContactPicker\}[^>]*>.*?\n\s*</button>",
    "",
    text,
    count=1,
    flags=re.S,
)

# 6) Remove any remaining contact-specific state declarations.
text = re.sub(r"\n\s*const \[contactPickerLoading, setContactPickerLoading\] = useState\(false\);", "", text, count=1)
text = re.sub(r"\n\s*const \[contactPickerOpen, setContactPickerOpen\] = useState\(false\);", "", text, count=1)
text = re.sub(r"\n\s*const \[contactPickerSearch, setContactPickerSearch\] = useState\(''\);", "", text, count=1)
text = re.sub(r"\n\s*const \[deviceContacts, setDeviceContacts\] = useState\([^;]*\);", "", text, count=1)

# 7) Remove all remaining exact package imports. There should be none, but this
# is an explicit final Vite safety guard.
text = re.sub(r"import\(['\"]@capacitor/contacts['\"]\)", "null", text)
text = re.sub(r"from\s+['\"]@capacitor/contacts['\"]", "from '__retired_contacts__'", text)

path.write_text(text, encoding='utf-8')

remaining = text.count('@capacitor/contacts')
print(
    f'Device contact feature disabled: category block={category_count}, '
    f'person name block={person_count}, remaining plugin references={remaining}.'
)
