from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]

# Add the Capacitor 5-compatible contacts plugin without changing the rest of the dependency set.
package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
deps = package.setdefault('dependencies', {})
deps.setdefault('@capacitor-community/contacts', '^5.1.1')
package_path.write_text(json.dumps(package, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

p = ROOT / 'src' / 'main.jsx'
text = p.read_text(encoding='utf-8')

if "from '@capacitor-community/contacts'" not in text:
    text = text.replace(
        "import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';",
        "import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';\nimport { Contacts } from '@capacitor-community/contacts';",
        1,
    )

# Global search: category chips become actionable filters. Selecting a chip simply
# sets the global search to that category, so existing search/result behavior remains intact.
text = text.replace(
    "const SearchView = ({ onSelectPerson }) => {\n  const { searchQuery, transactions, persons, categories } = useContext(AppContext);",
    "const SearchView = ({ onSelectPerson }) => {\n  const { searchQuery, setSearchQuery, transactions, persons, categories } = useContext(AppContext);",
    1,
)
text = text.replace(
    "<span key={i} className=\"px-3 py-1 bg-white border border-[#E4E1EA] rounded-full text-xs font-bold text-[#1E104B] shadow-xs flex items-center\">\n                    <i className=\"fa-solid fa-tag mr-1.5 text-[#7B2B8C] text-[10px]\"></i>{c}\n                  </span>",
    "<button key={i} type=\"button\" onClick={() => setSearchQuery(c)} title={`Filter transactions by ${c}`} className=\"px-3 py-1 bg-white border border-[#E4E1EA] rounded-full text-xs font-bold text-[#1E104B] shadow-xs flex items-center hover:bg-[#7B2B8C] hover:text-white active:scale-95 transition-all\">\n                    <i className=\"fa-solid fa-tag mr-1.5 text-[#7B2B8C] text-[10px]\"></i>{c}\n                  </button>",
    1,
)

# SideMenu: native Android contact access with explicit permission handling and an
# in-app searchable directory. The selected contact fills name, phone and email.
marker = "  const [catToDelete, setCatToDelete] = useState(null);\n"
if 'const [contactPickerOpen, setContactPickerOpen]' not in text:
    addition = marker + """  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactPickerSearch, setContactPickerSearch] = useState('');
  const [deviceContacts, setDeviceContacts] = useState([]);
  const [contactPickerLoading, setContactPickerLoading] = useState(false);

  const openDeviceContactPicker = async () => {
    setContactPickerLoading(true);
    try {
      const permission = await Contacts.getPermissions();
      if (!permission || permission.granted !== true) {
        showFeedback('Contacts permission is required to select a device contact.');
        return;
      }
      const result = await Contacts.getContacts();
      const contacts = Array.isArray(result?.contacts) ? result.contacts : [];
      const usable = contacts
        .map((contact) => ({
          ...contact,
          _name: String(contact.displayName || '').trim(),
          _phone: String(contact.phoneNumbers?.find(p => p?.number)?.number || '').trim(),
          _email: String(contact.emails?.find(e => e?.address)?.address || '').trim(),
        }))
        .filter(contact => contact._name || contact._phone);
      setDeviceContacts(usable);
      setContactPickerSearch('');
      setContactPickerOpen(true);
    } catch (err) {
      console.error('Device contact picker error:', err);
      showFeedback('Unable to open device contacts. Please allow Contacts permission in Android settings.');
    } finally {
      setContactPickerLoading(false);
    }
  };

  const selectDeviceContact = (contact) => {
    setFormData(prev => ({
      ...prev,
      name: contact._name || prev.name || '',
      phone: contact._phone || prev.phone || '',
      email: contact._email || prev.email || '',
    }));
    setContactPickerOpen(false);
    setContactPickerSearch('');
    showFeedback('Contact details filled');
  };
"""
    if marker not in text:
        raise SystemExit('SideMenu state marker not found')
    text = text.replace(marker, addition, 1)

old_name_field = '''                    <div>\n                      <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">Name *</label>\n                      <input type="text" required value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" />\n                    </div>'''
new_name_field = '''                    <div>\n                      <div className="flex items-center justify-between mb-1">\n                        <label className="block text-[10px] font-bold text-[#625E70] uppercase">Name *</label>\n                        <button\n                          type="button"\n                          onClick={openDeviceContactPicker}\n                          disabled={contactPickerLoading}\n                          title="Select from device contacts"\n                          className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#078A87] hover:text-[#056E6C] active:scale-95 disabled:opacity-50 transition-all"\n                        >\n                          <i className={`fa-solid ${contactPickerLoading ? 'fa-spinner animate-spin' : 'fa-address-book'} text-[11px]`}></i>\n                          <span>{contactPickerLoading ? 'Opening...' : 'Device Contacts'}</span>\n                        </button>\n                      </div>\n                      <input type="text" required value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" />\n                    </div>'''
if old_name_field not in text:
    raise SystemExit('Add Person name field marker not found')
text = text.replace(old_name_field, new_name_field, 1)

# Insert the picker modal immediately before the SideMenu component's outer closing div.
modal_marker = '''      {catToDelete && ('''
if 'contactPickerOpen &&' not in text:
    modal = '''      {contactPickerOpen && (\n        <div className="fixed inset-0 z-[70] bg-[#1E104B]/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setContactPickerOpen(false)}>\n          <div className="bg-white rounded-3xl w-full max-w-md max-h-[82vh] shadow-2xl overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>\n            <div className="p-4 border-b border-[#E4E1EA]">\n              <div className="flex items-center justify-between gap-3 mb-3">\n                <div>\n                  <h3 className="text-sm font-black text-[#1E104B]">Select Device Contact</h3>\n                  <p className="text-[9px] text-[#8A8596] font-semibold mt-0.5">Choose a contact to fill name, phone and email.</p>\n                </div>\n                <button type="button" onClick={() => setContactPickerOpen(false)} className="w-8 h-8 rounded-full bg-[#F4F3F8] text-[#625E70] flex items-center justify-center">\n                  <i className="fa-solid fa-xmark text-xs"></i>\n                </button>\n              </div>\n              <div className="relative">\n                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8596] text-xs pointer-events-none"></i>\n                <input\n                  type="text"\n                  value={contactPickerSearch}\n                  onChange={e => setContactPickerSearch(e.target.value)}\n                  autoFocus\n                  placeholder="Search device contacts..."\n                  className="w-full bg-[#F4F3F8] border border-[#E4E1EA] rounded-xl py-2.5 pl-8 pr-3 text-xs font-semibold text-[#1E104B] outline-none focus:bg-white focus:border-[#078A87]"\n                />\n              </div>\n            </div>\n            <div className="max-h-[58vh] overflow-y-auto hide-scrollbar p-2">\n              {deviceContacts\n                .filter(contact => {\n                  const q = contactPickerSearch.trim().toLowerCase();\n                  if (!q) return true;\n                  return `${contact._name} ${contact._phone} ${contact._email}`.toLowerCase().includes(q);\n                })\n                .map((contact, index) => (\n                  <button\n                    key={contact.contactId || contact.id || `${contact._name}-${contact._phone}-${index}`}\n                    type="button"\n                    onClick={() => selectDeviceContact(contact)}\n                    className="w-full text-left p-3 rounded-xl hover:bg-[#F4F3F8] active:bg-[#EDE9F6] transition-all flex items-center gap-3 border-b border-[#E4E1EA]/60 last:border-b-0"\n                  >\n                    <span className="w-9 h-9 rounded-full bg-[#078A87]/12 text-[#078A87] flex items-center justify-center font-black text-xs flex-none">\n                      {(contact._name || '?').charAt(0).toUpperCase()}\n                    </span>\n                    <span className="min-w-0 flex-1">\n                      <span className="block text-xs font-black text-[#1E104B] truncate">{contact._name || 'Unnamed contact'}</span>\n                      <span className="block text-[10px] text-[#625E70] font-semibold truncate mt-0.5">{contact._phone || contact._email || 'No phone/email'}</span>\n                    </span>\n                    <i className="fa-solid fa-chevron-right text-[9px] text-[#8A8596]"></i>\n                  </button>\n                ))}\n              {deviceContacts.length === 0 && (\n                <div className="text-center py-10 px-5">\n                  <i className="fa-solid fa-address-book text-3xl text-[#7B2B8C]/25 mb-2"></i>\n                  <p className="text-xs font-bold text-[#625E70]">No usable contacts found.</p>\n                </div>\n              )}\n            </div>\n          </div>\n        </div>\n      )}\n\n'''
    if modal_marker not in text:
        raise SystemExit('SideMenu modal insertion marker not found')
    text = text.replace(modal_marker, modal_marker + '\n' + modal, 1)

p.write_text(text, encoding='utf-8')
print('Category filter chips and native device contact picker source pass complete.')
