from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'ci-phase2-finalize.py'
text = SCRIPT.read_text(encoding='utf-8')

# Make the finalizer genuinely idempotent. Earlier Phase-2 scripts already
# perform some of the same transformations, so the finalizer must not abort
# merely because its older exact marker has already changed.
old_replace = '''def replace_once(label, pattern, replacement, flags=re.S):
    global text
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    text = updated
'''
new_replace = '''def replace_once(label, pattern, replacement, flags=re.S):
    global text
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count == 1:
        text = updated
        return

    # Already-applied transformations are valid. Treat them as success when
    # the desired Phase-2 marker is already present.
    already_applied = {
        'Data Exports grouped menu': 'exportGroup',
        'header sync icon': 'fa-cloud-arrow-up',
    }
    marker = already_applied.get(label)
    if marker and marker in text:
        return

    # The Add Person name input is intentionally allowed to evolve across the
    # UX passes. If its old exact one-line JSX marker changed, use a structural
    # fallback that targets the input bound to formData.name instead of failing.
    if label == 'Add Person name suggestions':
        fallback_pattern = r'<input(?=[^>]*value=\\{formData\\.name[^>]*)(?=[^>]*setFormData\\(\\{[^}]*name:\\s*e\\.target\\.value)[^>]*?/?>'
        fallback_updated, fallback_count = re.subn(
            fallback_pattern,
            replacement,
            text,
            count=1,
            flags=re.S,
        )
        if fallback_count == 1:
            text = fallback_updated
            return

    raise SystemExit(f'{label}: expected exactly one match, found {count}')
'''
if old_replace in text:
    text = text.replace(old_replace, new_replace, 1)
else:
    # Do not silently continue if the finalizer's helper changed unexpectedly.
    if 'already_applied = {' not in text:
        raise SystemExit('Phase2 replace_once helper marker not found')

# The Phase-2 UX pass already creates the grouped Data Exports menu.
# Keep the legacy replacement guarded as an additional safety net.
old = "replace_once('Data Exports grouped menu', exports_pattern, exports_replacement)"
new = """if 'exportGroup' not in text:
    replace_once('Data Exports grouped menu', exports_pattern, exports_replacement)"""
if old in text and new not in text:
    text = text.replace(old, new, 1)

# Preserve optional address mapping without requiring the old exact surrounding
# JSX if a prior pass has already inserted it.
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

# The sync icon is owned by the newer UX pass. The generic idempotence guard
# above handles the already-polished icon; retain this explicit guard too for
# clarity and for future revisions of the finalizer.
text = text.replace(
    "replace_once(\n    'header sync icon',",
    "if 'fa-cloud-arrow-up' not in text:\n    replace_once(\n    'header sync icon',",
    1,
)

SCRIPT.write_text(text, encoding='utf-8')
print('Phase2 finalization guards normalized: idempotent transforms + grouped exports + address mapping + header sync.')
