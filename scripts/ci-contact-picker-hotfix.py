from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
p = ROOT / 'src' / 'main.jsx'
text = p.read_text(encoding='utf-8')

# Make the contact action visibly responsive and provide immediate feedback before
# the native permission/plugin call. Keep the existing contact-plugin API intact.
old = """  const openDeviceContactPicker = async () => {\n    setContactPickerLoading(true);\n    try {\n      const permission = await Contacts.getPermissions();"""
new = """  const openDeviceContactPicker = async () => {\n    if (contactPickerLoading) return;\n    setContactPickerLoading(true);\n    showFeedback('Opening device contacts…');\n    try {\n      const permission = await Contacts.getPermissions();"""
if old in text:
    text = text.replace(old, new, 1)
else:
    print('Contact handler marker already patched or not found.')

# Handle plugin permission responses that expose a nested read state as well as
# the older { granted: boolean } shape.
old = """      if (!permission || permission.granted !== true) {\n        showFeedback('Contacts permission is required to select a device contact.');\n        return;\n      }"""
new = """      const permissionGranted = permission?.granted === true || permission?.readContacts === 'granted' || permission?.contacts === 'granted';\n      if (!permissionGranted) {\n        showFeedback('Contacts permission is required. Please allow Contacts access and try again.');\n        return;\n      }"""
if old in text:
    text = text.replace(old, new, 1)

# Remove the payment-reminder watermark completely while retaining the final
# logo-free reminder card layout and all text/content.
watermark = re.compile(r"\n  const logoSrc = Array\.isArray\(APP_LOGO_COLORED\).*?\n\n  const centerX = width / 2;", re.S)
text, removed = watermark.subn("\n  const centerX = width / 2;", text, count=1)
print(f'Removed payment reminder watermark block: {removed}')

p.write_text(text, encoding='utf-8')
print('Contact picker hotfix and reminder watermark removal applied.')
