from pathlib import Path


def replace_once(text, old, new, label, required=True):
    if old not in text:
        if required:
            raise SystemExit(f'Missing expected source fragment: {label}')
        return text
    return text.replace(old, new, 1)


main = Path('src/main.jsx')
s = main.read_text(encoding='utf-8')

s = replace_once(s,
"""      return;\n    }\n  }\n\n  const url = URL.createObjectURL(blob);""",
"""      return false;\n    }\n  }\n\n  const url = URL.createObjectURL(blob);""", 'downloadCsv success return')
s = replace_once(s,
"""  URL.revokeObjectURL(url);\n};\n\nconst shareReceiptToWhatsApp""",
"""  URL.revokeObjectURL(url);\n  return true;\n};\n\nconst shareReceiptToWhatsApp""", 'downloadCsv fallback return')
s = replace_once(s,
"""      if (e.name === 'AbortError') return;\n    }\n  }\n\n  const url = URL.createObjectURL(blob);""",
"""      if (e.name === 'AbortError') return false;\n    }\n  }\n\n  const url = URL.createObjectURL(blob);""", 'downloadCsv cancel return')
s = replace_once(s,
"""      if (err.name === 'AbortError') return true;\n      if (err.name === 'NotAllowedError') {""",
"""      if (err.name === 'AbortError') return false;\n      if (err.name === 'NotAllowedError') {""", 'image share cancel return')
s = replace_once(s,
"""      foreignObjectRendering: true,\n      letterRendering: false,\n      width: targetWidth,""",
"""      foreignObjectRendering: false,\n      letterRendering: false,\n      width: targetWidth,""", 'blank image fix')
s = replace_once(s,
"""  const exportCsv = (rpcFn, filename) => {\n    showFeedback('Preparing export...');\n    gasRun(rpcFn)\n      .then((csv) => { downloadCsv(csv, filename); showFeedback('Exported ' + filename); })\n      .catch((err) => showFeedback('Export failed: ' + err.message));\n  };""",
"""  const exportCsv = async (rpcFn, filename) => {\n    showFeedback('Preparing export...');\n    try {\n      const csv = await gasRun(rpcFn);\n      const exported = await downloadCsv(csv, filename);\n      showFeedback(exported ? 'Exported ' + filename : 'Export canceled');\n      return exported;\n    } catch (err) {\n      showFeedback('Export failed: ' + err.message);\n      return false;\n    }\n  };""", 'CSV status')
s = replace_once(s, "  const exportFullBackupCsv = () => {", "  const exportFullBackupCsv = async () => {", 'full backup async')
s = replace_once(s,
"""      downloadCsv(lines.join('\\n'), `budget_bharat_full_backup_${Date.now()}.csv`);\n      showFeedback('Full backup exported');""",
"""      const exported = await downloadCsv(lines.join('\\n'), `budget_bharat_full_backup_${Date.now()}.csv`);\n      showFeedback(exported ? 'Full backup exported' : 'Backup export canceled');\n      return exported;""", 'full backup status')
s = replace_once(s,
"""      setFormData({});\n      setEditItem(null);\n      setMenuView('menu');\n      setIsMenuOpen(false);\n    } catch (err) {""",
"""      const keepAddFormOpen = menuView === 'addPerson' || menuView === 'addCategory';\n      setFormData({});\n      setEditItem(null);\n      if (!keepAddFormOpen) {\n        setMenuView('menu');\n        setIsMenuOpen(false);\n      }\n    } catch (err) {""", 'keep add screens open')
s = replace_once(s,
"""  const [catType, setCatType] = useState('expense');""",
"""  const [catType, setCatType] = useState(() => window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ || 'expense');\n\n  useEffect(() => {\n    if (menuView === 'addCategory' && window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__) {\n      setCatType(window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__);\n      delete window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__;\n    }\n  }, [menuView]);""", 'category type handoff')
s = replace_once(s,
"""  const openAddMenu = (targetView) => {\n    onClose();\n    setMenuView(targetView);\n    setIsMenuOpen(true);\n  };""",
"""  const openAddMenu = (targetView, categoryType = null) => {\n    onClose();\n    if (targetView === 'addCategory' && categoryType) {\n      window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ = categoryType;\n    }\n    setMenuView(targetView);\n    setIsMenuOpen(true);\n  };""", 'shared category entry point')
s = replace_once(s,
"""            <p className=\"text-[10px] font-bold text-[#078A87] uppercase tracking-wider mb-4\">\n              {menuView === 'addCategory' ? `Target Ledger: ${catType.toUpperCase()}` : menuView === 'addPerson' ? 'Directory Party Entry' : 'Configuration Setup'}\n            </p>\n            <form onSubmit={handleFormSubmit}""",
"""            <p className=\"text-[10px] font-bold text-[#078A87] uppercase tracking-wider mb-4\">\n              {menuView === 'addCategory' ? `Target Ledger: ${catType.toUpperCase()}` : menuView === 'addPerson' ? 'Directory Party Entry' : 'Configuration Setup'}\n            </p>\n            {menuView === 'addCategory' && (\n              <div className=\"flex gap-2 mb-4\">\n                <button type=\"button\" onClick={() => setCatType('expense')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${catType === 'expense' ? 'bg-[#1E104B] text-white' : 'bg-[#F4F3F8] text-[#625E70]'}`}>Expense</button>\n                <button type=\"button\" onClick={() => setCatType('income')} className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${catType === 'income' ? 'bg-[#1E104B] text-white' : 'bg-[#F4F3F8] text-[#625E70]'}`}>Income</button>\n              </div>\n            )}\n            <form onSubmit={handleFormSubmit}""", 'add category type buttons')
s = replace_once(s,
"""                  <button type=\"button\" onClick={() => openAddMenu('addCategory')} className=\"w-10 h-10 flex-none rounded-xl bg-theme-gray border border-theme-dark/20 flex items-center justify-center text-[#66419C] hover:bg-[#66419C] hover:text-white transition-colors\">""",
"""                  <button type=\"button\" onClick={() => openAddMenu('addCategory', type === 'INCOME' ? 'income' : 'expense')} className=\"w-10 h-10 flex-none rounded-xl bg-theme-gray border border-theme-dark/20 flex items-center justify-center text-[#66419C] hover:bg-[#66419C] hover:text-white transition-colors\">""", 'new record category type')

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
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 82px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BUDGET BHARAT', 0, 0);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
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
  if (logoSrc) {
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(210 / img.width, 90 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (width - w) / 2, 505, w, h);
        resolve();
      };
      img.onerror = resolve;
      img.src = logoSrc;
    });
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Unable to create reminder image.')), 'image/jpeg', 0.92);
  });
  return new File([blob], `Budget_Bharat_Payment_Reminder_${Date.now()}.jpg`, { type: 'image/jpeg' });
};
'''
if 'const createPaymentReminderImage = async' not in s:
    s = replace_once(s,
"""const waitForPaint = () => new Promise(resolve => {\n  requestAnimationFrame(() => requestAnimationFrame(resolve));\n});\n\nconst AppContext = createContext();""",
"""const waitForPaint = () => new Promise(resolve => {\n  requestAnimationFrame(() => requestAnimationFrame(resolve));\n});\n""" + helper + """\nconst AppContext = createContext();""", 'payment reminder image helper')

s = replace_once(s,
"""  const handleSendWhatsAppReminder = () => {\n    if (!currentLoan) return;""",
"""  const handleSendWhatsAppReminder = async () => {\n    if (!currentLoan) return;""", 'async reminder handler')
s = replace_once(s,
"""    const textMsg = `Hello ${currentLoan.person}, your ${currentLoan.loanName} EMI #${nextPending.emiNo} with amount ${formatMoney(nextPending.emiAmount)} is due on ${nextPending.date} please pay.`;\n\n    const waUrl = phone\n      ? `https://wa.me/${phone}?text=${encodeURIComponent(textMsg)}`\n      : `https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg)}`;\n    window.open(waUrl, '_blank', 'noopener,noreferrer');\n  };""",
"""    const textMsg = `Hello ${currentLoan.person}, your ${currentLoan.loanName} EMI #${nextPending.emiNo} with amount ${formatMoney(nextPending.emiAmount)} is due on ${nextPending.date} please pay.`;\n\n    try {\n      const file = await createPaymentReminderImage({ personName: currentLoan.person, amount: nextPending.emiAmount, dueDate: nextPending.date, loanName: currentLoan.loanName, emiNo: nextPending.emiNo, admin });\n      if (navigator.canShare && navigator.canShare({ files: [file] })) {\n        await navigator.share({ files: [file], title: 'Budget Bharat Payment Reminder', text: textMsg });\n        showFeedback('Reminder ready to share');\n      } else {\n        const url = URL.createObjectURL(file);\n        const link = document.createElement('a');\n        link.href = url;\n        link.download = file.name;\n        document.body.appendChild(link);\n        link.click();\n        link.remove();\n        URL.revokeObjectURL(url);\n        showFeedback('Reminder image saved; share it in WhatsApp');\n      }\n    } catch (err) {\n      if (err && err.name === 'AbortError') { showFeedback('Reminder share canceled'); return; }\n      console.error('Payment reminder image error:', err);\n      showFeedback('Reminder failed: ' + (err && err.message ? err.message : 'image generation failed'));\n    }\n  };""", 'image reminder sharing')
main.write_text(s, encoding='utf-8')

css = Path('src/index.css')
c = css.read_text(encoding='utf-8')
old = """  .grad-dark {\n    background: linear-gradient(135deg, #1E104B 0%, #2A186B 100%);\n  }"""
new = """  .grad-dark {\n    background: linear-gradient(90deg, #7B2B8C 0%, #F45777 100%);\n  }"""
if old in c:
    c = c.replace(old, new, 1)
css.write_text(c, encoding='utf-8')
