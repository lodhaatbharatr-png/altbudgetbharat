from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'src' / 'main.jsx'
text = path.read_text(encoding='utf-8')

# The contact feature is retired. Phase 1 may still regenerate its handler,
# so this pass must be idempotent and must never fail merely because an older
# contact state/modal block has already been transformed.

# Remove the retired contact plugin loader and cache helpers from the module
# header. This is the important build fix: no @capacitor/contacts import may
# survive into Vite/Rollup after the feature has been retired.
text, n_module = re.subn(
    r"\nconst loadContactsPlugin = async \(\) => \{.*?\nconst SafePortal =",
    "\nconst SafePortal =",
    text,
    count=1,
    flags=re.S,
)

# Disable the native contact-opening function after Phase 1 has had its chance
# to inject/normalize it. Keep the surrounding code structurally intact so
# unrelated Add Person logic is untouched.
text, n_handler = re.subn(
    r"  const openDeviceContactPicker = async \(\) => \{.*?\n  \};\n\n  const selectDeviceContact",
    "  const openDeviceContactPicker = async () => {\n    showFeedback('Device contacts are disabled.');\n  };\n\n  const selectDeviceContact",
    text,
    count=1,
    flags=re.S,
)

# Remove the visible Device Contacts button if present. Do not fail when it is
# already gone; repeated workflow runs are expected.
text, n_button = re.subn(
    r"\n\s*<button\n\s*type=\"button\"\n\s*onClick=\{openDeviceContactPicker\}.*?\n\s*</button>",
    "",
    text,
    count=1,
    flags=re.S,
)

# Remove any explicit permission-request strings/UI that might have survived
# an older generated variant, without touching unrelated app functionality.
text = text.replace("Contacts permission is required. Please allow Contacts access and try again.", "Device contacts are disabled.")
text = text.replace("Opening device contacts…", "Device contacts are disabled.")
text = text.replace("Opening contacts…", "Device contacts are disabled.")

path.write_text(text, encoding='utf-8')
print(f'Device contact feature disabled: module={n_module}, handler={n_handler}, button_removed={n_button}.')
