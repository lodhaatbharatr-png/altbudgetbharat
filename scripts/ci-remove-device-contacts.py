from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'main.jsx'
text = path.read_text(encoding='utf-8')

# Device Contacts is retired. This pass runs LAST, after every Phase 1/2
# generator. It must leave valid JSX as well as zero plugin references.

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

# Remove generated contact handlers/helpers.
text = re.sub(r"\n\s*const\s+openDeviceContactPicker\s*=\s*async\s*\(\)\s*=>\s*\{.*?\n\s*\};\n", "\n", text, count=1, flags=re.S)
text = re.sub(r"\n\s*const\s+selectDeviceContact\s*=\s*\([^\n]*\)\s*=>\s*\{.*?\n\s*\};\n", "\n", text, count=1, flags=re.S)
text = re.sub(r"\nconst\s+loadContactsPlugin\s*=\s*async\s*\(\)\s*=>\s*\{.*?\n\};\n", "\n", text, count=1, flags=re.S)
text = re.sub(r"\nconst\s+DEVICE_CONTACTS_CACHE_KEY\s*=.*?\nconst\s+normalizeDeviceContact\s*=.*?\n\};\n", "\n", text, count=1, flags=re.S)
text = re.sub(r"\nconst\s+readCachedDeviceContacts\s*=.*?\n\};\n", "\n", text, count=1, flags=re.S)
text = re.sub(r"\nconst\s+cacheDeviceContacts\s*=.*?\n\};\n", "\n", text, count=1, flags=re.S)
text = re.sub(r"\n\s*// DEVICE_CONTACTS_PRELOAD_PHASE2.*?\n\s*\}, \[\]\);\n", "\n", text, count=1, flags=re.S)

# Remove any remaining visible Device Contacts action.
text = re.sub(r"\n\s*<button\b[^>]*onClick=\{openDeviceContactPicker\}[^>]*>.*?\n\s*</button>", "", text, count=1, flags=re.S)

# Remove retired state declarations.
for pattern in [
    r"\n\s*const \[contactPickerLoading, setContactPickerLoading\] = useState\(false\);",
    r"\n\s*const \[contactPickerOpen, setContactPickerOpen\] = useState\(false\);",
    r"\n\s*const \[contactPickerSearch, setContactPickerSearch\] = useState\(''\);",
    r"\n\s*const \[deviceContacts, setDeviceContacts\] = useState\([^;]*\);",
]:
    text = re.sub(pattern, "", text, count=1)

# Final import guard: delete static/dynamic references entirely, never replace
# them with a fake module that Vite would try to resolve.
text = re.sub(r"^\s*import\s+.*?from\s+['\"]@capacitor/contacts['\"]\s*;?\s*$", "", text, flags=re.M)
text = re.sub(r"import\(['\"]@capacitor/contacts['\"]\)", "null", text)
text = text.replace("@capacitor/contacts", "")

path.write_text(text, encoding='utf-8')
remaining = text.count('@capacitor/contacts')
print(f'Device contact feature disabled: category block={category_count}, person name block={person_count}, remaining plugin references={remaining}.')
