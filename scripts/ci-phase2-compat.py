from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'ci-phase2-finalize.py'
text = SCRIPT.read_text(encoding='utf-8')

start_marker = '# Preserve optional address if the installed plugin/device exposes one.'
end_marker = '# Replace the phase-2 preload with a real startup permission + cache pass.'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Phase2 address-mapping section markers not found')

replacement = '''# Preserve optional address if the installed plugin/device exposes one.
# This transformation is intentionally idempotent because earlier contact-picker
# passes may already have added the address field.
if 'address: contact._address || prev.address ||' not in text:
    replace_once(
        'contact address mapping',
        r"(name: contact\\._name \\|\\| prev\\.name \\|\\| '',\\n\\s*phone: contact\\._phone \\|\\| prev\\.phone \\|\\| '',\\n\\s*email: contact\\._email \\|\\| prev\\.email \\|\\| '',)(\\n\\s*\\}\\)\\);)",
        r"\\1\\n      address: contact._address || prev.address || '',\\2",
    )

'''
text = text[:start] + replacement + text[end:]
SCRIPT.write_text(text, encoding='utf-8')
print('Phase2 address mapping made idempotent.')
