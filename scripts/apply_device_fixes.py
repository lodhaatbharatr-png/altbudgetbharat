from pathlib import Path
import re

main = Path('src/main.jsx')
s = main.read_text(encoding='utf-8')


def sub(pattern, replacement, label):
    global s
    new_s, count = re.sub(pattern, replacement, s, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'Missing expected source block: {label}')
    s = new_s


# Reliable export/share behavior. Replacing the whole helpers avoids brittle whitespace matching.
sub(
    r"const downloadCsv = async \(csv, filename\) => \{.*?\n\};\n\nconst shareReceiptToWhatsApp",
    r'''const downloadCsv = async (csv, filename) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const file = new File([blob], filename, { type: 'text/csv' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text: 'Budget Bharat Export' });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
      throw e;
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const shareReceiptToWhatsApp''',
    'downloadCsv'
)

sub(
    r"const shareReceiptToWhatsApp = async \(ref, filename, captionText\) => \{.*?\n\};\n\nconst waitForPaint",
    r'''const shareReceiptToWhatsApp = async (ref, filename, captionText) => {
  let target = ref && ref.current ? ref.current : (typeof ref === 'string' ? document.getElementById(ref) : ref);
  if (!target) throw new Error('Target render reference not found');
  if (target instanceof HTMLElement === false && target.nodeType !== 1) target = target.current || target;

  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) {}
  }

  const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : { width: 640, height: target.offsetHeight || target.scrollHeight };
  const targetWidth = parseInt(target.style?.width || 0, 10) || Math.ceil(rect.width || 0) || 640;
  const targetHeight = Math.ceil(rect.height || target.offsetHeight || target.scrollHeight || 800);
  const dynamicScale = targetHeight > 2500 ? 1.2 : targetHeight > 1500 ? 1.5 : 2;

  let canvas;
  try {
    canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: dynamicScale,
      logging: false,
      useCORS: true,
      allowTaint: false,
      foreignObjectRendering: false,
      letterRendering: false,
      width: targetWidth,
      height: targetHeight,
      windowWidth: targetWidth,
      windowHeight: targetHeight,
      scrollY: 0,
      scrollX: 0
    });
  } catch (_) {
    throw new Error('Statement is too long to export as a single image on this device.');
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Canvas blob generation failed')), 'image/jpeg', 0.9);
  });
  if (!blob) throw new Error('Empty image blob created');

  const file = new File([blob], `${filename}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text: captionText });
      return true;
    } catch (err) {
      if (err && err.name === 'AbortError') return false;
      throw err;
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const waitForPaint''',
    'shareReceiptToWhatsApp'
)

sub(
    r"  const exportCsv = \(rpcFn, filename\) => \{.*?\n  \};",
    r'''  const exportCsv = async (rpcFn, filename) => {
    showFeedback('Preparing export...');
    try {
      const csv = await gasRun(rpcFn);
      const exported = await downloadCsv(csv, filename);
      showFeedback(exported ? 'Exported ' + filename : 'Export canceled');
      return exported;
    } catch (err) {
      showFeedback('Export failed: ' + (err.message || String(err)));
      return false;
    }
  };''',
    'exportCsv'
)

s = re.sub(r"  const exportFullBackupCsv = \(\) => \{", "  const exportFullBackupCsv = async () => {", s, count=1)
sub(
    r"      downloadCsv\(lines\.join\('\\\\n'\), `budget_bharat_full_backup_\$\{Date\.now\(\)\}\.csv`\);\n      showFeedback\('Full backup exported'\);",
    r"""      const exported = await downloadCsv(lines.join('\\n'), `budget_bharat_full_backup_${Date.now()}.csv`);
      showFeedback(exported ? 'Full backup exported' : 'Backup export canceled');
      return exported;""",
    'full backup export'
)

# Keep add-person/add-category entry screen open after a successful save.
sub(
    r"      setFormData\(\{\}\);\n      setEditItem\(null\);\n      setMenuView\('menu'\);\n      setIsMenuOpen\(false\);\n    \} catch \(err\) \{",
    r"""      const keepAddFormOpen = menuView === 'addPerson' || menuView === 'addCategory';
      setFormData({});
      setEditItem(null);
      if (!keepAddFormOpen) {
        setMenuView('menu');
        setIsMenuOpen(false);
      }
    } catch (err) {""",
    'keep add screens open'
)

# Shared Add Category dialog: both Expense and Income, with the New Record flow selecting the matching type.
sub(
    r"  const \[catType, setCatType\] = useState\('expense'\);",
    r"""  const [catType, setCatType] = useState(() => window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ || 'expense');

  useEffect(() => {
    if (menuView === 'addCategory' && window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__) {
      setCatType(window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__);
      delete window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__;
    }
  }, [menuView]);""",
    'catType'
)
sub(
    r"  const openAddMenu = \(targetView\) => \{\n    onClose\(\);\n    setMenuView\(targetView\);\n    setIsMenuOpen\(true\);\n  \};",
    r"""  const openAddMenu = (targetView, categoryType = null) => {
    onClose();
    if (targetView === 'addCategory' && categoryType) {
      window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ = categoryType;
    }
    setMenuView(targetView);
    setIsMenuOpen(true);
  };""",
    'openAddMenu'
)
sub(
    r"            <p className=\"text-\[10px\] font-bold text-\[#078A87\] uppercase tracking-wider mb-4\">\n              \{menuView === 'addCategory' \? `Target Ledger: \$\{catType\.toUpperCase\(\)\}` : menuView === 'addPerson' \? 'Directory Party Entry' : 'Configuration Setup'\}\n            </p>\n            <form onSubmit=\{handleFormSubmit\}",
    r'''            <p className="text-[10px] font-bold text-[#078A87] uppercase tracking-wider mb-4">
              {menuView === 'addCategory' ? `Target Ledger: ${catType.toUpperCase()}` : menuView === 'addPerson' ? 'Directory Party Entry' : 'Configuration Setup'}
            </p>
            {menuView === 'addCategory' && (
              <div className="flex gap-2 mb-4">
                <button type="button" onClick={() => setCatType('expense')} className={`flex-1 py-2 rounded-lg text-xs font-black ${catType === 'expense' ? 'bg-[#1E104B] text-white' : 'bg-[#F4F3F8] text-[#625E70]'}`}>Expense</button>
                <button type="button" onClick={() => setCatType('income')} className={`flex-1 py-2 rounded-lg text-xs font-black ${catType === 'income' ? 'bg-[#1E104B] text-white' : 'bg-[#F4F3F8] text-[#625E70]'}`}>Income</button>
              </div>
            )}
            <form onSubmit={handleFormSubmit}''',
    'category dialog'
)
sub(
    r"onClick=\{\(\) => openAddMenu\('addCategory'\)\}",
    "onClick={() => openAddMenu('addCategory', type === 'INCOME' ? 'income' : 'expense')}",
    'New Record category plus'
)

# Direct canvas generation avoids the DOM/html2canvas path for the small EMI reminder card.
helper = r'''
const createPaymentReminderImage = async ({ personName, amount, dueDate, loanName, emiNo, admin }) => {
  const width = 900;
  const height = 620;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device.');
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#7B2B8C');
  gradient.addColorStop(1, '#F45777');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.fillStyle = '#fff';
  ctx.font = '900 82px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BUDGET BHARAT', 0, 0);
  ctx.restore();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '900 34px sans-serif';
  ctx.fillText('Payment reminder for', width / 2, 95);
  ctx.font = '900 76px sans-serif';
  ctx.fillText(formatMoney(amount), width / 2, 190);
  ctx.font = '800 34px sans-serif';
  ctx.fillText(`on ${formatDisplayDate(dueDate)}`, width / 2, 255);
  ctx.font = '700 25px sans-serif';
  ctx.fillText(`${personName || 'Customer'} • ${loanName || 'EMI'}${emiNo ? ` • EMI #${emiNo}` : ''}`, width / 2, 315);
  ctx.font = '700 25px sans-serif';
  ctx.fillText('Sent by', width / 2, 405);
  ctx.font = '900 30px sans-serif';
  ctx.fillText(`${admin?.name || 'Bharat Rasve'} | ${admin?.contact || '7218838122'}`, width / 2, 448);
  const logoSrc = Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED;
  if (logoSrc) await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(210 / img.width, 90 / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (width - w) / 2, 505, w, h);
      resolve();
    };
    img.onerror = resolve;
    img.src = logoSrc;
  });
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Unable to create reminder image.')), 'image/jpeg', 0.92));
  return new File([blob], `Budget_Bharat_Payment_Reminder_${Date.now()}.jpg`, { type: 'image/jpeg' });
};
'''
if 'const createPaymentReminderImage = async' not in s:
    s = s.replace(
        "const waitForPaint = () => new Promise(resolve => {\n  requestAnimationFrame(() => requestAnimationFrame(resolve));\n});\n",
        "const waitForPaint = () => new Promise(resolve => {\n  requestAnimationFrame(() => requestAnimationFrame(resolve));\n});\n" + helper + "\n",
        1
    )

sub(
    r"  const handleSendWhatsAppReminder = \(\) => \{\n    if \(!currentLoan\) return;.*?\n  \};",
    r'''  const handleSendWhatsAppReminder = async () => {
    if (!currentLoan) return;
    const nextPending = currentLoan.schedule.find(s => !s.paid);
    if (!nextPending) {
      showFeedback('All EMIs for this loan are cleared!');
      return;
    }
    const textMsg = `Hello ${currentLoan.person}, your ${currentLoan.loanName} EMI #${nextPending.emiNo} with amount ${formatMoney(nextPending.emiAmount)} is due on ${nextPending.date} please pay.`;
    try {
      const file = await createPaymentReminderImage({ personName: currentLoan.person, amount: nextPending.emiAmount, dueDate: nextPending.date, loanName: currentLoan.loanName, emiNo: nextPending.emiNo, admin });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Budget Bharat Payment Reminder', text: textMsg });
        showFeedback('Reminder ready to share');
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showFeedback('Reminder image saved; share it in WhatsApp');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        showFeedback('Reminder share canceled');
        return;
      }
      console.error('Payment reminder image error:', err);
      showFeedback('Reminder failed: ' + (err && err.message ? err.message : 'image generation failed'));
    }
  };''',
    'WhatsApp reminder handler'
)

main.write_text(s, encoding='utf-8')

css = Path('src/index.css')
c = css.read_text(encoding='utf-8')
c = re.sub(
    r"\.grad-dark \{\n\s*background: linear-gradient\([^;]+;\n\s*\}",
    """.grad-dark {
    background: linear-gradient(90deg, #7B2B8C 0%, #F45777 100%);
  }""",
    c,
    count=1
)
css.write_text(c, encoding='utf-8')
