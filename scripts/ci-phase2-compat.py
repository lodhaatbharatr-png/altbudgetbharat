from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'ci-phase2-finalize.py'
text = SCRIPT.read_text(encoding='utf-8')

# The Phase-2 UX pass already creates the grouped Data Exports menu.
# Make the later finalizer skip its older replacement when that grouped
# implementation is already present, instead of failing because the legacy
# flat-menu marker is no longer present.
old = "replace_once('Data Exports grouped menu', exports_pattern, exports_replacement)"
new = """if 'exportGroup' not in text:\n    replace_once('Data Exports grouped menu', exports_pattern, exports_replacement)"""
if old in text and new not in text:
    text = text.replace(old, new, 1)

# Keep the existing idempotent address mapping guard from the previous fix.
start_marker = '# Preserve optional address if the installed plugin/device exposes one.'
end_marker = '# Replace the phase-2 preload with a real startup permission + cache pass.'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Phase2 address-mapping section markers not found')

replacement = '''# Preserve optional address if the installed plugin/device exposes one.\n# This transformation is intentionally idempotent because earlier contact-picker\n# passes may already have added the address field.\nif 'address: contact._address || prev.address ||' not in text:\n    replace_once(\n        'contact address mapping',\n        r"(name: contact\\._name \\|\\| prev\\.name \\|\\| '',\\n\\s*phone: contact\\._phone \\|\\| prev\\.phone \\|\\| '',\\n\\s*email: contact\\._email \\|\\| prev\\.email \\|\\| '',)(\\n\\s*\\}\\)\\);)",\n        r"\\1\\n      address: contact._address || prev.address || '',\\2",\n    )\n\n'''
text = text[:start] + replacement + text[end:]
SCRIPT.write_text(text, encoding='utf-8')
print('Phase2 finalization guards normalized: grouped exports + address mapping.')
