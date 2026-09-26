from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts' / 'ci-phase2-finalize.py'
text = SCRIPT.read_text(encoding='utf-8')

# The Phase-2 UX pass already creates the grouped Data Exports menu.
# Make the later finalizer skip its older replacement when that grouped
# implementation is already present, instead of failing because the legacy
# flat-menu marker is no longer present.
old = "replace_once('Data Exports grouped menu', exports_pattern, exports_replacement)"
new = """if 'exportGroup' not in text:
    replace_once('Data Exports grouped menu', exports_pattern, exports_replacement)"""
if old in text and new not in text:
    text = text.replace(old, new, 1)

# Keep the existing idempotent address mapping guard from the previous fix.
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

# Phase-2 UX polish now owns the header sync icon and expresses its state using
# syncStatus. The old finalizer expected the pre-polish rotate icon and therefore
# aborted the APK build. Make that replacement conditional so the finalizer is
# compatible with either source form and never fails merely because the new icon
# is already present.
old_header = '''replace_once(
    'header sync icon',
    r"<i className=\\{`fa-solid fa-rotate text-sm \\$\\{isSyncing \\? 'animate-spin' : ''\\}`\\}></i>",
    r"<i className={`fa-solid ${isSyncing ? 'fa-cloud-arrow-up animate-pulse' : isRestoring ? 'fa-cloud-arrow-down animate-pulse' : isSuccess ? 'fa-cloud-check' : 'fa-cloud'} text-sm`}></i>",
    flags=0,
)'''
if old_header in text:
    new_header = '''if 'fa-cloud-arrow-up animate-pulse' not in text:
    replace_once(
        'header sync icon',
        r"<i className=\\{`fa-solid fa-rotate text-sm \\$\\{isSyncing \\? 'animate-spin' : ''\\}`\\}></i>",
        r"<i className={`fa-solid ${isSyncing ? 'fa-cloud-arrow-up animate-pulse' : isRestoring ? 'fa-cloud-arrow-down animate-pulse' : isSuccess ? 'fa-cloud-check' : 'fa-cloud'} text-sm`}></i>",
        flags=0,
    )'''
    text = text.replace(old_header, new_header, 1)
else:
    # If a later source revision has already changed the exact call, still make
    # the script tolerant of an already-polished sync icon.
    text = text.replace(
        "replace_once(\n    'header sync icon',",
        "if 'fa-cloud-arrow-up' not in text:\n    replace_once(\n    'header sync icon',",
        1,
    )

SCRIPT.write_text(text, encoding='utf-8')
print('Phase2 finalization guards normalized: grouped exports + address mapping + header sync compatibility.')
