import React, { useState, useEffect, useMemo, useRef, createContext, useContext } from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas';
import html2pdf from 'html2pdf.js';

import { 
  INCOME_TYPES, 
  SELECT_STYLE, 
  MONTHS_SHORT, 
  APP_ICON_WHITE, 
  APP_LOGO_COLORED, 
  APP_LOGO_WHITE 
} from './constants';

import { initDB, BackendBridge } from './db.js';
import { GoogleDriveSync } from './googleSync.js';
import { exportDomAsJpeg, EXPORT_STATUS } from './export/exportService.js';
import './index.css';

const SafePortal = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || typeof document === 'undefined' || !document.body) return null;
  return ReactDOM.createPortal(children, document.body);
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error in "' + (this.props.label || 'section') + '":', error, info);
  }
  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  };
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3 min-h-[240px]">
          <i className="fa-solid fa-triangle-exclamation text-3xl text-red-400"></i>
          <p className="text-sm font-bold text-theme-dark">{this.props.label || 'This section'} hit a snag</p>
          <p className="text-xs text-theme-dark/60 max-w-xs break-words">
            {String((this.state.error && this.state.error.message) || this.state.error || 'Unknown error')}
          </p>
          <button onClick={this.handleReset} className="px-4 py-2 bg-theme-dark text-white rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all">
            {translate("Try Again")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppBottomBranding = () => {
  const handleWhatsAppDeveloper = (e) => {
    e.preventDefault();
    const phone = '917218838122';
    const textMsg = `${translate('Hi Bharat, i need help regarding..')}`;
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(textMsg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="pt-6 pb-2 text-center flex flex-col items-center justify-center select-none">
      <img
        src={APP_LOGO_COLORED}
        alt="Budget Bharat"
        className="h-[31px] object-contain mb-1.5 drop-shadow-sm"
      />
      <p className="text-[10px] font-bold text-[#625E70] tracking-wide mb-2.5">
        {translate("Developed by - Bharat Rasve © 2026")}
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            window.location.href = `tel:0${String(7218838122 || '').replace(/\D/g, '').slice(-10)}`;
          }}
          title="Call Developer"
          className="w-9 h-9 flex items-center justify-center text-[#1E104B] hover:opacity-70 active:scale-90 transition-all"
        >
          <i className="fa-solid fa-phone text-[13px]"></i>
        </button>
        <button
          type="button"
          onClick={handleWhatsAppDeveloper}
          title="WhatsApp Developer"
          className="w-9 h-9 flex items-center justify-center text-[#1E104B] hover:opacity-70 active:scale-90 transition-all"
        >
          <i className="fa-brands fa-whatsapp text-base"></i>
        </button>
        <a
          href="https://www.linkedin.com/in/bharatrasve"
          target="_blank"
          rel="noopener noreferrer"
          title="LinkedIn"
          className="w-9 h-9 flex items-center justify-center text-[#1E104B] hover:opacity-70 active:scale-90 transition-all"
        >
          <i className="fa-brands fa-linkedin-in text-sm"></i>
        </a>
        <a
          href="https://github.com/bharombhar"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub"
          className="w-9 h-9 flex items-center justify-center text-[#1E104B] hover:opacity-70 active:scale-90 transition-all"
        >
          <i className="fa-brands fa-github text-sm"></i>
        </a>
        <a
          href="https://www.instagram.com/bharat_rasve_?r=nametag"
          target="_blank"
          rel="noopener noreferrer"
          title="Instagram"
          className="w-9 h-9 flex items-center justify-center text-[#1E104B] hover:opacity-70 active:scale-90 transition-all"
        >
          <i className="fa-brands fa-instagram text-sm"></i>
        </a>
        <a
          href="https://bharatrasve.blogspot.com/"
          target="_blank"
          rel="noopener noreferrer"
          title="Website"
          className="w-9 h-9 flex items-center justify-center text-[#1E104B] hover:opacity-70 active:scale-90 transition-all"
        >
          <i className="fa-solid fa-globe text-sm"></i>
        </a>
      </div>
    </div>
  );
};

const formatMoney = (val) => new Intl.NumberFormat(({ en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' })[getSelectedLanguage()] || 'en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(val || 0);
const formatTableNum = (val) => new Intl.NumberFormat(({ en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' })[getSelectedLanguage()] || 'en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(val || 0));
const toProperCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

const parseDate = (dStr) => {
  if (!dStr) return new Date(0);
  if (dStr instanceof Date) return dStr;
  const s = String(dStr).trim();

  // Parse ISO dates first; otherwise YYYY-MM-DD is mistaken for DD-MM-YYYY.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (iso) {
    const parsedIso = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(parsedIso.getTime()) ? new Date(0) : parsedIso;
  }

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:$|T|\s)/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = m[3].length === 2 ? parseInt('20' + m[3], 10) : parseInt(m[3], 10);
    const parsedParts = new Date(year, month, day);
    return parsedParts.getFullYear() === year && parsedParts.getMonth() === month && parsedParts.getDate() === day
      ? parsedParts
      : new Date(0);
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const sortTransactionsByDateDesc = (items = []) => [...items].sort((a, b) => {
  const dateDiff = parseDate(b?.date || b?.Date || b?.transactionDate || b?.timestamp || b?.Timestamp).getTime()
    - parseDate(a?.date || a?.Date || a?.transactionDate || a?.timestamp || a?.Timestamp).getTime();
  if (dateDiff !== 0) return dateDiff;
  return String(b?.timestamp || b?.Timestamp || b?.entryId || b?.ENTRY_ID || b?.id || '')
    .localeCompare(String(a?.timestamp || a?.Timestamp || a?.entryId || a?.ENTRY_ID || a?.id || ''));
});

const toInputDate_ = (dStr) => {
  if (!dStr) return '';
  if (dStr instanceof Date) {
    const y = dStr.getFullYear();
    const m = ('0' + (dStr.getMonth() + 1)).slice(-2);
    const d = ('0' + dStr.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
  }
  const s = String(dStr).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const day = ('0' + m[1]).slice(-2);
    const month = ('0' + m[2]).slice(-2);
    const year = m[3].length === 2 ? ('20' + m[3]) : m[3];
    return `${year}-${month}-${day}`;
  }
  return '';
};

const getSelectedLanguage = () => {
  try { return localStorage.getItem('budgetBharat.language') || 'en'; } catch (_) { return 'en'; }
};

const LANGUAGE_LOCALES = { en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' };
const LANGUAGE_NAMES = { en: 'English', mr: 'मराठी', hi: 'हिन्दी' };
const UI_TRANSLATIONS = {
  "Home": {
    "mr": "मुख्यपृष्ठ",
    "hi": "होम"
  },
  "Directory": {
    "mr": "व्यक्ती",
    "hi": "निर्देशिका"
  },
  "Loans / EMIs": {
    "mr": "कर्ज / EMI",
    "hi": "लोन / EMI"
  },
  "Records": {
    "mr": "नोंदी",
    "hi": "रिकॉर्ड"
  },
  "Choose Language": {
    "mr": "भाषा निवडा",
    "hi": "भाषा चुनें"
  },
  "Languages": {
    "mr": "भाषा",
    "hi": "भाषाएँ"
  },
  "Confirm": {
    "mr": "पुष्टी करा",
    "hi": "पुष्टि करें"
  },
  "Record Setup": {
    "mr": "नोंद सेटअप",
    "hi": "रिकॉर्ड सेटअप"
  },
  "Manage Persons": {
    "mr": "व्यक्ती व्यवस्थापित करा",
    "hi": "व्यक्तियों का प्रबंधन"
  },
  "Add New Entry": {
    "mr": "नवीन नोंद जोडा",
    "hi": "नई एंट्री जोड़ें"
  },
  "Save Entry": {
    "mr": "नोंद जतन करा",
    "hi": "एंट्री सेव करें"
  },
  "Saving...": {
    "mr": "जतन करत आहे...",
    "hi": "सेव हो रहा है..."
  },
  "PERSON NAME *": {
    "mr": "व्यक्तीचे नाव *",
    "hi": "व्यक्ति का नाम *"
  },
  "PURPOSE / DESCRIPTION": {
    "mr": "कारण / वर्णन",
    "hi": "उद्देश्य / विवरण"
  },
  "REFERENCE / A/C MODE": {
    "mr": "संदर्भ / पेमेंट पद्धत",
    "hi": "संदर्भ / भुगतान तरीका"
  },
  "CATEGORY": {
    "mr": "श्रेणी",
    "hi": "श्रेणी"
  },
  "PROMISE DATE": {
    "mr": "वचनाची तारीख",
    "hi": "वादा की तारीख"
  },
  "Share transaction statement": {
    "mr": "व्यवहार विवरण शेअर करा",
    "hi": "लेन-देन विवरण साझा करें"
  },
  "Share balance reminder": {
    "mr": "शिल्लक रकमेची आठवण शेअर करा",
    "hi": "बकाया राशि का रिमाइंडर साझा करें"
  },
  "Share EMI table": {
    "mr": "EMI तक्ता शेअर करा",
    "hi": "EMI तालिका साझा करें"
  },
  "Share EMI reminder": {
    "mr": "EMI आठवण शेअर करा",
    "hi": "EMI रिमाइंडर साझा करें"
  },
  "Outstanding balance": {
    "mr": "बाकी रक्कम",
    "hi": "बकाया राशि"
  },
  "Payment reminder for": {
    "mr": "या पेमेंटची आठवण",
    "hi": "इस भुगतान के लिए रिमाइंडर"
  },
  "You will pay": {
    "mr": "तुम्ही पैसे द्याल",
    "hi": "आप भुगतान करेंगे"
  },
  "You will receive": {
    "mr": "तुम्हाला पैसे मिळतील",
    "hi": "आपको भुगतान मिलेगा"
  },
  "On or before": {
    "mr": "या तारखेपर्यंत",
    "hi": "इस तारीख तक"
  },
  "Due on": {
    "mr": "देय तारीख",
    "hi": "देय तिथि"
  },
  "Sent by": {
    "mr": "पाठवणारे",
    "hi": "भेजने वाले"
  },
  "Using": {
    "mr": "वापरत आहे",
    "hi": "उपयोग कर रहे हैं"
  },
  "Your Personal Finance App": {
    "mr": "तुमचे वैयक्तिक आर्थिक ॲप",
    "hi": "आपका व्यक्तिगत वित्त ऐप"
  },
  "Developed by - Bharat Rasve": {
    "mr": "निर्मिती - Bharat Rasve",
    "hi": "निर्माता - Bharat Rasve"
  },
  "Loan updated": {
    "mr": "कर्ज अपडेट केले",
    "hi": "लोन अपडेट हुआ"
  },
  "Loan deleted": {
    "mr": "कर्ज हटवले",
    "hi": "लोन हटाया गया"
  },
  "Data synced locally": {
    "mr": "डेटा स्थानिकरीत्या सिंक झाला",
    "hi": "डेटा स्थानीय रूप से सिंक हुआ"
  },
  "Couldn't load your data": {
    "mr": "तुमचा डेटा लोड होऊ शकला नाही",
    "hi": "आपका डेटा लोड नहीं हो सका"
  },
  "Retry": {
    "mr": "पुन्हा प्रयत्न करा",
    "hi": "पुनः प्रयास करें"
  },
  "Try Again": {
    "mr": "पुन्हा प्रयत्न करा",
    "hi": "फिर से प्रयास करें"
  },
  "All EMIs for this loan are cleared!": {
    "mr": "या कर्जाचे सर्व EMI पूर्ण झाले!",
    "hi": "इस लोन की सभी EMI पूरी हो गई हैं!"
  },
  "Reminder ready to share": {
    "mr": "आठवण शेअर करण्यासाठी तयार आहे",
    "hi": "रिमाइंडर साझा करने के लिए तैयार है"
  },
  "Reminder image saved; share it in WhatsApp": {
    "mr": "आठवणीची प्रतिमा जतन झाली; WhatsApp वर शेअर करा",
    "hi": "रिमाइंडर इमेज सेव हुई; WhatsApp पर साझा करें"
  },
  "Hello": {
    "mr": "नमस्कार",
    "hi": "नमस्ते"
  },
  "there": {
    "mr": "",
    "hi": ""
  },
  "Loan EMI": {
    "mr": "कर्ज EMI",
    "hi": "लोन EMI"
  },
  "Dear": {
    "mr": "प्रिय",
    "hi": "प्रिय"
  },
  "on or before": {
    "mr": "या तारखेपर्यंत",
    "hi": "इस तारीख तक"
  },
  "Budget Bharat Balance Reminder": {
    "mr": "Budget Bharat शिल्लक रकमेची आठवण",
    "hi": "Budget Bharat बकाया राशि रिमाइंडर"
  },
  "Budget Bharat Payment Reminder": {
    "mr": "Budget Bharat पेमेंट आठवण",
    "hi": "Budget Bharat भुगतान रिमाइंडर"
  },
  "your": {
    "mr": "तुमचा",
    "hi": "आपकी"
  },
  "EMI": {
    "mr": "EMI",
    "hi": "EMI"
  },
  "with amount": {
    "mr": "रक्कम",
    "hi": "राशि"
  },
  "is due on": {
    "mr": "देय तारीख",
    "hi": "की देय तिथि"
  },
  "Please pay": {
    "mr": "कृपया पैसे भरा",
    "hi": "कृपया भुगतान करें"
  },
  "I am reminding you to pay": {
    "mr": "तुम्हाला पैसे भरण्याची आठवण करून देत आहे",
    "hi": "आपको भुगतान की याद दिला रहा हूँ"
  },
  "From": { "mr": "पासून", "hi": "से" },
  "To": { "mr": "पर्यंत", "hi": "तक" },
  "No records found.": { "mr": "कोणत्याही नोंदी आढळल्या नाहीत.", "hi": "कोई रिकॉर्ड नहीं मिला।" },
  "Date": { "mr": "तारीख", "hi": "तारीख" },
  "Description": { "mr": "वर्णन", "hi": "विवरण" },
  "Type": { "mr": "प्रकार", "hi": "प्रकार" },
  "Amount": { "mr": "रक्कम", "hi": "राशि" },
  "No matches found": { "mr": "जुळणारे काहीही आढळले नाही", "hi": "कोई मिलान नहीं मिला" },
  "Categories": { "mr": "श्रेण्या", "hi": "श्रेणियाँ" },
  "Your Personal Finance Manager": { "mr": "तुमचे वैयक्तिक आर्थिक व्यवस्थापक", "hi": "आपका व्यक्तिगत वित्त प्रबंधक" },
  "Manage Categories": { "mr": "श्रेण्या व्यवस्थापित करा", "hi": "श्रेणियाँ प्रबंधित करें" },
  "Admin Setup": { "mr": "प्रशासकीय सेटअप", "hi": "व्यवस्थापक सेटअप" },
  "Quick Create": { "mr": "त्वरित तयार करा", "hi": "त्वरित बनाएँ" },
  "Add Person": { "mr": "व्यक्ती जोडा", "hi": "व्यक्ति जोड़ें" },
  "Add Category": { "mr": "श्रेणी जोडा", "hi": "श्रेणी जोड़ें" },
  "Data Backup & Restore": { "mr": "डेटाचा बॅकअप आणि पुनर्संचयित करा", "hi": "डेटा बैकअप और पुनर्स्थापना" },
  "Connected Account": { "mr": "जोडलेले खाते", "hi": "कनेक्ट किया गया खाता" },
  "Data Exports": { "mr": "डेटा निर्यात", "hi": "डेटा निर्यात" },
  "Summaries": { "mr": "सारांश", "hi": "सारांश" },
  "Income": { "mr": "उत्पन्न", "hi": "आय" },
  "Expenses": { "mr": "खर्च", "hi": "व्यय" },
  "Active Loans": { "mr": "सक्रिय कर्जे", "hi": "सक्रिय लोन" },
  "Persons": { "mr": "व्यक्ती", "hi": "व्यक्ति" },
  "Receivables": { "mr": "येणे बाकी", "hi": "प्राप्य राशि" },
  "Payables": { "mr": "देणे बाकी", "hi": "देय राशि" },
  "Transactions": { "mr": "व्यवहार", "hi": "लेन-देन" },
  "Loans EMI Records": { "mr": "कर्ज EMI नोंदी", "hi": "लोन EMI रिकॉर्ड" },
  "All Transactions": { "mr": "सर्व व्यवहार", "hi": "सभी लेन-देन" },
  "Incomes": { "mr": "उत्पन्न", "hi": "आय" },
  "Back": { "mr": "मागे", "hi": "वापस" },
  "Add": { "mr": "जोडा", "hi": "जोड़ें" },
  "Expense": { "mr": "खर्च", "hi": "व्यय" },
  "Category Name *": { "mr": "श्रेणीचे नाव *", "hi": "श्रेणी का नाम *" },
  "Name *": { "mr": "नाव *", "hi": "नाम *" },
  "Phone": { "mr": "फोन", "hi": "फ़ोन" },
  "Email Id": { "mr": "ईमेल आयडी", "hi": "ईमेल आईडी" },
  "Address / Location": { "mr": "पत्ता / ठिकाण", "hi": "पता / स्थान" },
  "Contact": { "mr": "संपर्क", "hi": "संपर्क" },
  "Email id": { "mr": "ईमेल आयडी", "hi": "ईमेल आईडी" },
  "Statement Header note": { "mr": "स्टेटमेंटच्या शीर्षकातील नोंद", "hi": "विवरण के शीर्षक की टिप्पणी" },
  "Statement Footer note": { "mr": "स्टेटमेंटच्या तळटीपेतली नोंद", "hi": "विवरण के नीचे की टिप्पणी" },
  "Delete": { "mr": "हटवा", "hi": "हटाएँ" },
  "and all linked transactions? This action cannot be undone.": { "mr": "आणि सर्व संबंधित व्यवहार? ही कृती पूर्ववत करता येणार नाही.", "hi": "और सभी संबंधित लेन-देन? यह कार्रवाई पूर्ववत नहीं की जा सकती।" },
  "Delete Category?": { "mr": "श्रेणी हटवायची?", "hi": "श्रेणी हटाएँ?" },
  "Given (Dr)": { "mr": "दिलेले (डेबिट)", "hi": "दिया (डेबिट)" },
  "Received": { "mr": "मिळालेले", "hi": "प्राप्त" },
  "Expense & Income Overview": { "mr": "खर्च आणि उत्पन्नाचा आढावा", "hi": "व्यय और आय का अवलोकन" },
  "Total Inflow": { "mr": "एकूण आवक", "hi": "कुल आवक" },
  "(Inc + Recv)": { "mr": "(उत्पन्न + मिळालेले)", "hi": "(आय + प्राप्त)" },
  "Total Outflow": { "mr": "एकूण जावक", "hi": "कुल जावक" },
  "(Exp + Given)": { "mr": "(खर्च + दिलेले)", "hi": "(व्यय + दिया)" },
  "Top Spending Categories": { "mr": "सर्वाधिक खर्चाच्या श्रेण्या", "hi": "सबसे अधिक खर्च वाली श्रेणियाँ" },
  "Recent Transactions": { "mr": "अलीकडील व्यवहार", "hi": "हाल के लेन-देन" },
  "People Overview": { "mr": "व्यक्तींचा आढावा", "hi": "व्यक्तियों का अवलोकन" },
  "Total Receivable": { "mr": "एकूण येणे बाकी", "hi": "कुल प्राप्य राशि" },
  "Total Payable": { "mr": "एकूण देणे बाकी", "hi": "कुल देय राशि" },
  "Active Loans Overview": { "mr": "सक्रिय कर्जांचा आढावा", "hi": "सक्रिय लोन का अवलोकन" },
  "Total to Pay": { "mr": "एकूण देय", "hi": "कुल देय" },
  "Paid So Far": { "mr": "आतापर्यंत भरलेले", "hi": "अब तक चुकाया" },
  "Remaining": { "mr": "शिल्लक", "hi": "शेष" },
  "No active loans.": { "mr": "कोणतेही सक्रिय कर्ज नाही.", "hi": "कोई सक्रिय लोन नहीं है।" },
  "Loan / Person": { "mr": "कर्ज / व्यक्ती", "hi": "लोन / व्यक्ति" },
  "Loan Rs.": { "mr": "कर्जाची रक्कम", "hi": "लोन राशि" },
  "EMI Rs.": { "mr": "EMI रक्कम", "hi": "EMI राशि" },
  "EMI Paid": { "mr": "भरलेले EMI", "hi": "चुकाई गई EMI" },
  "RECEIVABLE": { "mr": "येणे बाकी", "hi": "प्राप्य" },
  "PAYABLE": { "mr": "देणे बाकी", "hi": "देय" },
  "BALANCE": { "mr": "शिल्लक", "hi": "शेष" },
  "Person Name": { "mr": "व्यक्तीचे नाव", "hi": "व्यक्ति का नाम" },
  "Given": { "mr": "दिले", "hi": "दिया" },
  "Recv": { "mr": "मिळाले", "hi": "प्राप्त" },
  "Balance": { "mr": "शिल्लक", "hi": "बकाया" },
  "STATEMENT BY -": { "mr": "स्टेटमेंट तयार करणारे -", "hi": "विवरण तैयार करने वाले -" },
  "Budget Bharat-Personal finance App": { "mr": "Budget Bharat-वैयक्तिक वित्त ॲप", "hi": "Budget Bharat-व्यक्तिगत वित्त ऐप" },
  "Mo.No: 7218838122": { "mr": "मो. नं.: 7218838122", "hi": "मो. नं.: 7218838122" },
  "GIVEN (DR)": { "mr": "दिलेले (डेबिट)", "hi": "दिया (डेबिट)" },
  "RECEIVED (CR)": { "mr": "मिळालेले (क्रेडिट)", "hi": "प्राप्त (क्रेडिट)" },
  "Ref A/C": { "mr": "संदर्भ / खाते", "hi": "संदर्भ / खाता" },
  "Promise": { "mr": "वचन तारीख", "hi": "वादा तारीख" },
  "New Loan": { "mr": "नवीन कर्ज", "hi": "नया लोन" },
  "No active loans found. Create your first loan above.": { "mr": "सक्रिय कर्ज आढळले नाही. वर पहिले कर्ज तयार करा.", "hi": "कोई सक्रिय लोन नहीं मिला। ऊपर अपना पहला लोन बनाएँ।" },
  "Active Loans Statement": { "mr": "सक्रिय कर्जांचे स्टेटमेंट", "hi": "सक्रिय लोन विवरण" },
  "TOTAL TO PAY": { "mr": "एकूण देय", "hi": "कुल देय" },
  "PAID SO FAR": { "mr": "आतापर्यंत भरलेले", "hi": "अब तक चुकाया" },
  "REMAINING": { "mr": "शिल्लक", "hi": "शेष" },
  "Foreclose": { "mr": "कर्ज बंद करा", "hi": "लोन बंद करें" },
  "New Loan Details": { "mr": "नवीन कर्जाचा तपशील", "hi": "नए लोन का विवरण" },
  "Amortization Setup": { "mr": "परतफेड नियोजन", "hi": "भुगतान योजना" },
  "Borrower *": { "mr": "कर्जदार *", "hi": "उधारकर्ता *" },
  "Loan Name *": { "mr": "कर्जाचे नाव *", "hi": "लोन का नाम *" },
  "Loan Taken (Disbursed) *": { "mr": "घेतलेली कर्जरक्कम *", "hi": "प्राप्त लोन राशि *" },
  "Loan to Pay (Total) *": { "mr": "एकूण परतफेड रक्कम *", "hi": "कुल चुकाने की राशि *" },
  "Monthly EMI (₹) *": { "mr": "मासिक EMI (₹) *", "hi": "मासिक EMI (₹) *" },
  "Tenure (Mo)": { "mr": "कालावधी (महिने)", "hi": "अवधि (महीने)" },
  "First Date": { "mr": "पहिली तारीख", "hi": "पहली तारीख" },
  "Total Loan Taken": { "mr": "एकूण घेतलेले कर्ज", "hi": "कुल लिया गया लोन" },
  "Total Loan to Pay": { "mr": "एकूण परतफेड", "hi": "कुल चुकौती" },
  "Interest": { "mr": "व्याज", "hi": "ब्याज" },
  "Payment Made": { "mr": "केलेले पेमेंट", "hi": "किया गया भुगतान" },
  "DATE": { "mr": "तारीख", "hi": "तारीख" },
  "AMOUNT": { "mr": "रक्कम", "hi": "राशि" },
  "Paid/ Not": { "mr": "भरले / नाही", "hi": "भुगतान / नहीं" },
  "Txn. Id": { "mr": "व्यवहार आयडी", "hi": "लेन-देन आईडी" },
  "Loan Foreclosure": { "mr": "कर्ज बंद करणे", "hi": "लोन बंद करना" },
  "Closure EMI / Date *": { "mr": "शेवटचा EMI / तारीख *", "hi": "अंतिम EMI / तारीख *" },
  "Closure Settlement Amount (₹) *": { "mr": "कर्ज बंद करण्याची अंतिम रक्कम (₹) *", "hi": "लोन बंद करने की अंतिम राशि (₹) *" },
  "Are you sure you want to delete": { "mr": "तुम्हाला खरोखर हटवायचे आहे का", "hi": "क्या आप वाकई हटाना चाहते हैं" },
  "? This action cannot be undone.": { "mr": "? ही कृती पूर्ववत करता येणार नाही.", "hi": "? यह कार्रवाई पूर्ववत नहीं की जा सकती।" },
  "Record EMI Payment": { "mr": "EMI पेमेंट नोंदवा", "hi": "EMI भुगतान दर्ज करें" },
  "Who Paid this EMI? *": { "mr": "हा EMI कोणी भरला? *", "hi": "यह EMI किसने चुकाई? *" },
  "UTR / Payment ID / Note": { "mr": "UTR / पेमेंट आयडी / नोंद", "hi": "UTR / भुगतान आईडी / टिप्पणी" },
  "EMI TABLE": { "mr": "EMI तक्ता", "hi": "EMI तालिका" },
  "TOTAL LOAN TAKEN": { "mr": "एकूण घेतलेले कर्ज", "hi": "कुल लिया गया लोन" },
  "TOTAL LOAN TO PAY": { "mr": "एकूण परतफेड", "hi": "कुल चुकौती" },
  "INTEREST": { "mr": "व्याज", "hi": "ब्याज" },
  "EMI PAID": { "mr": "भरलेले EMI", "hi": "चुकाई गई EMI" },
  "PAYMENT MADE": { "mr": "केलेले पेमेंट", "hi": "किया गया भुगतान" },
  "STATUS": { "mr": "स्थिती", "hi": "स्थिति" },
  "WHO PAID": { "mr": "कोणी भरले", "hi": "किसने भुगतान किया" },
  "TXN ID": { "mr": "व्यवहार आयडी", "hi": "लेन-देन आईडी" },
  "Edit Transaction": { "mr": "व्यवहार संपादित करा", "hi": "लेन-देन संपादित करें" },
  "AMOUNT (₹) *": { "mr": "रक्कम (₹) *", "hi": "राशि (₹) *" },
  "DATE *": { "mr": "तारीख *", "hi": "तारीख *" },
  "DESCRIPTION": { "mr": "वर्णन", "hi": "विवरण" },
  "AC": { "mr": "खाते", "hi": "खाता" },
  "Enter Result": { "mr": "निकाल प्रविष्ट करा", "hi": "परिणाम दर्ज करें" },
  "New Record": { "mr": "नवीन नोंद", "hi": "नया रिकॉर्ड" },
  "NEW RECORD": { "mr": "नवीन नोंद", "hi": "नया रिकॉर्ड" },
  "Optional": { "mr": "ऐच्छिक", "hi": "वैकल्पिक" },
  "City or Village": { "mr": "शहर किंवा गाव", "hi": "शहर या गाँव" },
  "Search people, note, category...": { "mr": "व्यक्ती, नोंद, श्रेणी शोधा...", "hi": "व्यक्ति, टिप्पणी, श्रेणी खोजें..." },
  "Search entry...": { "mr": "नोंद शोधा...", "hi": "रिकॉर्ड खोजें..." },
  "Search person...": { "mr": "व्यक्ती शोधा...", "hi": "व्यक्ति खोजें..." },
  "Select person...": { "mr": "व्यक्ती निवडा...", "hi": "व्यक्ति चुनें..." },
  "Type or select person...": { "mr": "व्यक्तीचे नाव लिहा किंवा निवडा...", "hi": "व्यक्ति का नाम लिखें या चुनें..." },
  "Category...": { "mr": "श्रेणी...", "hi": "श्रेणी..." },
  "e.g. for shopping, to EMI payment..": { "mr": "उदा. खरेदीसाठी, EMI पेमेंटसाठी...", "hi": "जैसे खरीदारी, EMI भुगतान..." },
  "e.g. PhonePe, NetBanking, Cash...": { "mr": "उदा. PhonePe, NetBanking, रोख...", "hi": "जैसे PhonePe, NetBanking, नकद..." },
  "e.g. Phone EMI / Gold Loan": { "mr": "उदा. फोन EMI / सोने कर्ज", "hi": "जैसे फोन EMI / गोल्ड लोन" },
  "Bank Disbursed Amount": { "mr": "बँकेने वितरित केलेली रक्कम", "hi": "बैंक द्वारा वितरित राशि" },
  "Total Repayable": { "mr": "एकूण परतफेड रक्कम", "hi": "कुल चुकाने योग्य राशि" },
  "Enter final settlement amount": { "mr": "अंतिम सेटलमेंट रक्कम भरा", "hi": "अंतिम निपटान राशि दर्ज करें" },
  "e.g. T2403050925367... or paid advance": { "mr": "उदा. T2403050925367... किंवा आगाऊ भरलेले", "hi": "जैसे T2403050925367... या अग्रिम भुगतान" },
  "Received (Cr)": { "mr": "मिळालेले (क्रेडिट)", "hi": "प्राप्त (क्रेडिट)" },
  "Overall Records": { "mr": "सर्व नोंदी", "hi": "सभी रिकॉर्ड" },
  "Delete Transaction": { "mr": "व्यवहार हटवा", "hi": "लेन-देन हटाएँ" },
  "Open Calculator": { "mr": "कॅल्क्युलेटर उघडा", "hi": "कैलकुलेटर खोलें" },
  "Close Calculator": { "mr": "कॅल्क्युलेटर बंद करा", "hi": "कैलकुलेटर बंद करें" },
  "0.00": { "mr": "०.००", "hi": "०.००" },
  "Click to view all Credit (Receivable) parties": { "mr": "सर्व येणे बाकी असलेल्या व्यक्ती पाहण्यासाठी क्लिक करा", "hi": "सभी प्राप्य पक्षों को देखने के लिए क्लिक करें" },
  "Click to view all Debit (Payable) parties": { "mr": "सर्व देणे बाकी असलेल्या व्यक्ती पाहण्यासाठी क्लिक करा", "hi": "सभी देय पक्षों को देखने के लिए क्लिक करें" },
  "Share Directory Summary Image": { "mr": "व्यक्ती निर्देशिका सारांश प्रतिमा शेअर करा", "hi": "व्यक्ति निर्देशिका सारांश इमेज साझा करें" },
  "Share Loans Summary Image": { "mr": "कर्ज सारांश प्रतिमा शेअर करा", "hi": "लोन सारांश इमेज साझा करें" },
  "Share Statement or Reminder": { "mr": "स्टेटमेंट किंवा आठवण शेअर करा", "hi": "विवरण या रिमाइंडर साझा करें" },
  "Open WhatsApp chat": { "mr": "WhatsApp चॅट उघडा", "hi": "WhatsApp चैट खोलें" },
  "Delete Person & All Records": { "mr": "व्यक्ती आणि सर्व नोंदी हटवा", "hi": "व्यक्ति और सभी रिकॉर्ड हटाएँ" },
  "Share EMI Table or Reminder": { "mr": "EMI तक्ता किंवा आठवण शेअर करा", "hi": "EMI तालिका या रिमाइंडर साझा करें" },
  "Send WhatsApp EMI Reminder": { "mr": "WhatsApp EMI आठवण पाठवा", "hi": "WhatsApp EMI रिमाइंडर भेजें" },
  "Delete Loan": { "mr": "कर्ज हटवा", "hi": "लोन हटाएँ" },
  "Foreclose Loan": { "mr": "कर्ज बंद करा", "hi": "लोन बंद करें" },
  "Exit to Directory": { "mr": "निर्देशिकेकडे परत जा", "hi": "निर्देशिका पर जाएँ" },
  "Exit to Loans Directory": { "mr": "कर्ज निर्देशिकेकडे परत जा", "hi": "लोन निर्देशिका पर जाएँ" },
  "Previous Person": { "mr": "मागील व्यक्ती", "hi": "पिछला व्यक्ति" },
  "Next Person": { "mr": "पुढील व्यक्ती", "hi": "अगला व्यक्ति" },
  "Previous Loan": { "mr": "मागील कर्ज", "hi": "पिछला लोन" },
  "Next Loan": { "mr": "पुढील कर्ज", "hi": "अगला लोन" },
  "Share transaction statement": { "mr": "व्यवहार विवरण शेअर करा", "hi": "लेन-देन विवरण साझा करें" },
  "Share balance reminder": { "mr": "बाकी रकमेची आठवण शेअर करा", "hi": "बकाया राशि का रिमाइंडर साझा करें" },
  "Share EMI table": { "mr": "EMI तक्ता शेअर करा", "hi": "EMI तालिका साझा करें" },
  "Share EMI reminder": { "mr": "EMI आठवण शेअर करा", "hi": "EMI रिमाइंडर साझा करें" },
  "Language applied: English": { "mr": "लागू केलेली भाषा: मराठी", "hi": "लागू की गई भाषा: हिन्दी" },
  "Results for": { "mr": "यासाठी परिणाम", "hi": "परिणाम" },
  "matches": { "mr": "जुळण्या", "hi": "मिलान" },
  "People": { "mr": "व्यक्ती", "hi": "लोग" },
  "Borrower Paid": { "mr": "कर्जदाराने भरले", "hi": "उधारकर्ता ने भुगतान किया" },
  "Auto-logs a": { "mr": "आपोआप नोंदवते", "hi": "स्वतः दर्ज करता है" },
  "entry of": { "mr": "इतकी नोंद", "hi": "की प्रविष्टि" },
  "in": { "mr": "मध्ये", "hi": "में" },
  "Marks installment cleared by borrower. Ledger balance remains unchanged.": { "mr": "कर्जदाराने हप्ता भरल्याची नोंद करते. खाते शिल्लक बदलत नाही.", "hi": "उधारकर्ता द्वारा किस्त चुकाने का रिकॉर्ड करता है। खाते का बैलेंस नहीं बदलता।" },
  "Cancel": { "mr": "रद्द करा", "hi": "रद्द करें" },
  "Save": { "mr": "जतन करा", "hi": "सेव करें" },
  "Save Changes": { "mr": "बदल जतन करा", "hi": "बदलाव सेव करें" },
  "Update": { "mr": "अपडेट करा", "hi": "अपडेट करें" },
  "Edit": { "mr": "संपादित करा", "hi": "संपादित करें" },
  "Delete Person?": { "mr": "व्यक्ती हटवायची?", "hi": "व्यक्ति हटाएँ?" },
  "Deleting Person...": { "mr": "व्यक्ती हटवत आहे...", "hi": "व्यक्ति हटाई जा रही है..." },
  "Delete Loan?": { "mr": "कर्ज हटवायचे?", "hi": "लोन हटाएँ?" },
  "Deleting Loan...": { "mr": "कर्ज हटवत आहे...", "hi": "लोन हटाया जा रहा है..." },
  "Delete Transaction?": { "mr": "व्यवहार हटवायचा?", "hi": "लेन-देन हटाएँ?" },
  "Deleting...": { "mr": "हटवत आहे...", "hi": "हटाया जा रहा है..." },
  "Loading...": { "mr": "लोड होत आहे...", "hi": "लोड हो रहा है..." },
  "Preparing export...": { "mr": "निर्यात तयार करत आहे...", "hi": "निर्यात तैयार हो रहा है..." },
  "Preparing full backup...": { "mr": "पूर्ण बॅकअप तयार करत आहे...", "hi": "पूरा बैकअप तैयार हो रहा है..." },
  "Exported ": { "mr": "निर्यात केले: ", "hi": "निर्यात किया: " },
  "Export canceled": { "mr": "निर्यात रद्द केले", "hi": "निर्यात रद्द किया गया" },
  "Export failed: ": { "mr": "निर्यात अयशस्वी: ", "hi": "निर्यात विफल: " },
  "Export Backup File": { "mr": "बॅकअप फाइल निर्यात करा", "hi": "बैकअप फ़ाइल निर्यात करें" },
  "Restore from Backup": { "mr": "बॅकअपमधून पुनर्संचयित करा", "hi": "बैकअप से पुनर्स्थापित करें" },
  "Sign in with Google": { "mr": "Google सह साइन इन करा", "hi": "Google से साइन इन करें" },
  "No transactions found": { "mr": "कोणतेही व्यवहार आढळले नाहीत", "hi": "कोई लेन-देन नहीं मिला" },
  "No persons found": { "mr": "कोणतीही व्यक्ती आढळली नाही", "hi": "कोई व्यक्ति नहीं मिली" },
  "No categories found": { "mr": "कोणत्याही श्रेण्या आढळल्या नाहीत", "hi": "कोई श्रेणी नहीं मिली" },
  "Please enter a name.": { "mr": "कृपया नाव प्रविष्ट करा.", "hi": "कृपया नाम दर्ज करें।" },
  "Name is required": { "mr": "नाव आवश्यक आहे", "hi": "नाम आवश्यक है" },
  "Phone is invalid": { "mr": "फोन क्रमांक अवैध आहे", "hi": "फ़ोन नंबर अमान्य है" },
  "Required": { "mr": "आवश्यक", "hi": "आवश्यक" },
  "Choose a category": { "mr": "श्रेणी निवडा", "hi": "श्रेणी चुनें" },
  "Borrower": { "mr": "कर्जदार", "hi": "उधारकर्ता" },
  "Loan": { "mr": "कर्ज", "hi": "लोन" },
  "Payment": { "mr": "पेमेंट", "hi": "भुगतान" },
  "Paid": { "mr": "भरले", "hi": "भुगतान किया" },
  "Pending": { "mr": "प्रलंबित", "hi": "लंबित" },
  "Cleared": { "mr": "पूर्ण", "hi": "चुकाया गया" },
  "Open": { "mr": "उघडा", "hi": "खोलें" },
  "Close": { "mr": "बंद करा", "hi": "बंद करें" },
  "Share": { "mr": "शेअर करा", "hi": "साझा करें" },
  "Statement": { "mr": "स्टेटमेंट", "hi": "विवरण" },
  "Reminder": { "mr": "आठवण", "hi": "रिमाइंडर" },
  "Download": { "mr": "डाउनलोड करा", "hi": "डाउनलोड करें" },
  "Export": { "mr": "निर्यात", "hi": "निर्यात" },
  "Import": { "mr": "आयात", "hi": "आयात" },
  "Search": { "mr": "शोधा", "hi": "खोजें" },
  "Filter": { "mr": "फिल्टर", "hi": "फ़िल्टर" },
  "All": { "mr": "सर्व", "hi": "सभी" },
  "Today": { "mr": "आज", "hi": "आज" },
  "Week": { "mr": "आठवडा", "hi": "सप्ताह" },
  "Month": { "mr": "महिना", "hi": "महीना" },
  "Year": { "mr": "वर्ष", "hi": "वर्ष" },
  "Custom": { "mr": "सानुकूल", "hi": "कस्टम" },
  "Given (Lent)": { "mr": "दिलेले (कर्ज दिले)", "hi": "दिया (उधार दिया)" },
  "you will pay": { "mr": "तुम्ही पैसे द्याल", "hi": "आप भुगतान करेंगे" },
  "Receivable": { "mr": "येणे बाकी", "hi": "प्राप्य" },
  "BAL (RECEIVABLE)": { "mr": "शिल्लक (येणे बाकी)", "hi": "शेष (प्राप्य)" },
  "and all associated transactions? This cannot be undone.": { "mr": "आणि सर्व संबंधित व्यवहार? ही कृती पूर्ववत करता येणार नाही.", "hi": "और सभी संबंधित लेन-देन? यह कार्रवाई पूर्ववत नहीं की जा सकती।" },
  "Developed by - Bharat Rasve © 2026": { "mr": "निर्मिती - Bharat Rasve © 2026", "hi": "निर्माता - Bharat Rasve © 2026" },
  "Removing": { "mr": "हटवत आहे", "hi": "हटाया जा रहा है" },
  "and associated records.": { "mr": "आणि संबंधित नोंदी.", "hi": "और संबंधित रिकॉर्ड।" },
  "and all associated entries from sheet.": { "mr": "आणि शीटमधील सर्व संबंधित नोंदी.", "hi": "और शीट के सभी संबंधित रिकॉर्ड।" },
  "GIVEN (LENT)": { "mr": "दिलेले (कर्ज दिले)", "hi": "दिया (उधार दिया)" },
  "Credit": { "mr": "जमा", "hi": "क्रेडिट" },
  "Debit": { "mr": "नावे", "hi": "डेबिट" },
  "Qtr": { "mr": "तिमाही", "hi": "तिमाही" },
  "Create Loan": { "mr": "कर्ज तयार करा", "hi": "लोन बनाएँ" },
  "Creating...": { "mr": "तयार करत आहे...", "hi": "बनाया जा रहा है..." },
  "Created": { "mr": "तयार झाले", "hi": "बन गया" },
  "Update Transaction": { "mr": "व्यवहार अपडेट करा", "hi": "लेन-देन अपडेट करें" },
  "Saving Changes...": { "mr": "बदल जतन करत आहे...", "hi": "बदल सेव हो रहे हैं..." },
  "Confirm Closure": { "mr": "कर्ज बंद करण्याची पुष्टी करा", "hi": "लोन बंद करने की पुष्टि करें" },
  "Closing...": { "mr": "बंद करत आहे...", "hi": "बंद हो रहा है..." },
  "Closed": { "mr": "बंद केले", "hi": "बंद हुआ" },
  "Confirm & Save": { "mr": "पुष्टी करून जतन करा", "hi": "पुष्टि करें और सेव करें" },
  "Saved": { "mr": "जतन झाले", "hi": "सेव हुआ" },
  "I Paid": { "mr": "मी भरले", "hi": "मैंने भुगतान किया" },
  "I paid": { "mr": "मी भरले", "hi": "मैंने भुगतान किया" },
  "Yes, Delete": { "mr": "होय, हटवा", "hi": "हाँ, हटाएँ" },
  "No, Cancel": { "mr": "नाही, रद्द करा", "hi": "नहीं, रद्द करें" },
  "Are you sure you want to delete this transaction?": { "mr": "तुम्हाला हा व्यवहार हटवायचा आहे का?", "hi": "क्या आप यह लेन-देन हटाना चाहते हैं?" },
  "Add New Person": { "mr": "नवीन व्यक्ती जोडा", "hi": "नया व्यक्ति जोड़ें" },
  "Directory Party Entry": { "mr": "निर्देशिका व्यक्ती नोंद", "hi": "निर्देशिका पार्टी प्रविष्टि" },
  "Directory Persons": { "mr": "निर्देशिकेतील व्यक्ती", "hi": "निर्देशिका के व्यक्ति" },
  "All Time": { "mr": "संपूर्ण कालावधी", "hi": "सभी समय" },
  "Loading fonts & generating PDF...": { "mr": "फॉन्ट लोड करून PDF तयार करत आहे...", "hi": "फ़ॉन्ट लोड करके PDF बनाया जा रहा है..." },
  "Generating All Persons Ledger Image...": { "mr": "सर्व व्यक्तींच्या लेजरची प्रतिमा तयार करत आहे...", "hi": "सभी व्यक्तियों के लेजर की इमेज बनाई जा रही है..." },
  "Ledger Ready": { "mr": "लेजर तयार आहे", "hi": "लेजर तैयार है" },
  "Error: ": { "mr": "त्रुटी: ", "hi": "त्रुटि: " },
  "Generating PDF failed": { "mr": "PDF तयार करणे अयशस्वी झाले", "hi": "PDF बनाना विफल हुआ" },
  "Statement image generation failed.": { "mr": "स्टेटमेंट प्रतिमा तयार करणे अयशस्वी झाले.", "hi": "विवरण इमेज बनाना विफल हुआ।" },
  "PDF shared successfully": { "mr": "PDF यशस्वीरित्या शेअर केली", "hi": "PDF सफलतापूर्वक साझा हुआ" },
  "PDF downloaded successfully": { "mr": "PDF यशस्वीरित्या डाउनलोड केली", "hi": "PDF सफलतापूर्वक डाउनलोड हुआ" },
  "EMI Table shared": { "mr": "EMI तक्ता शेअर केला", "hi": "EMI तालिका साझा की गई" },
  "Overall Statement": { "mr": "एकूण_विवरण", "hi": "समग्र_विवरण" },
  "EMI Table": { "mr": "EMI_तक्ता", "hi": "EMI_तालिका" },
  "you will receive": { "mr": "तुम्हाला पैसे मिळतील", "hi": "आपको पैसे प्राप्त होंगे" },
  "is settled at": { "mr": "पूर्णपणे निकाली निघाले आहे:", "hi": "का निपटान हुआ:" },
  "on or before date": { "mr": "या तारखेपर्यंत", "hi": "इस तारीख तक" },
  "Transaction updated": { "mr": "व्यवहार अपडेट केला", "hi": "लेन-देन अपडेट किया गया" },
  "Failed to create loan": { "mr": "कर्ज तयार करता आले नाही", "hi": "लोन बनाने में विफल" },
  "Could not read that file": { "mr": "ही फाइल वाचता आली नाही", "hi": "यह फ़ाइल पढ़ी नहीं जा सकी" },
  "Add New": { "mr": "नवीन जोडा", "hi": "नया जोड़ें" },
  "Category": { "mr": "श्रेणी", "hi": "श्रेणी" },
  "Target Ledger": { "mr": "लक्ष्य खातेवही", "hi": "लक्षित खाता-बही" },
  "Configuration Setup": { "mr": "कॉन्फिगरेशन सेटअप", "hi": "कॉन्फ़िगरेशन सेटअप" },
  "Edit Person": { "mr": "व्यक्ती संपादित करा", "hi": "व्यक्ति संपादित करें" },
  "Edit Category": { "mr": "श्रेणी संपादित करा", "hi": "श्रेणी संपादित करें" },
  "Delete Entry...": { "mr": "नोंद हटवत आहे...", "hi": "रिकॉर्ड हटाया जा रहा है" },
  "Please wait while we update your sheet.": { "mr": "शीट अपडेट होईपर्यंत प्रतीक्षा करा.", "hi": "शीट अपडेट होने तक प्रतीक्षा करें।" },
  "This action cannot be undone.": { "mr": "ही कृती पूर्ववत करता येणार नाही.", "hi": "यह कार्रवाई पूर्ववत नहीं की जा सकती।" },
  "No": { "mr": "नाही", "hi": "नहीं" },
  "I Paid (Me)": { "mr": "मी भरले", "hi": "मैंने भुगतान किया" },
  "entry saved": { "mr": "नोंद जतन झाली", "hi": "रिकॉर्ड सेव हुआ" },
  "Save failed: ": { "mr": "जतन अयशस्वी: ", "hi": "सेव विफल: " },
  "Transaction deleted": { "mr": "व्यवहार हटवला", "hi": "लेन-देन हटाया गया" },
  "Failed to save payment": { "mr": "पेमेंट जतन करता आले नाही", "hi": "भुगतान सेव नहीं हुआ" },
  "Delete failed: ": { "mr": "हटवणे अयशस्वी: ", "hi": "हटाने में विफल: " },
  "Restore failed: ": { "mr": "पुनर्संचयित करणे अयशस्वी: ", "hi": "पुनर्स्थापना विफल: " },
  "Sync failed: ": { "mr": "सिंक अयशस्वी: ", "hi": "सिंक विफल: " },
  "Person Added to Directory": { "mr": "व्यक्ती निर्देशिकेत जोडली", "hi": "व्यक्ति निर्देशिका में जोड़ा गया" },
  "Delete failed": { "mr": "हटवणे अयशस्वी", "hi": "हटाने में विफल" },
  "Expense entry saved": { "mr": "खर्चाची नोंद जतन झाली", "hi": "व्यय रिकॉर्ड सेव हुआ" },
  "Income entry saved": { "mr": "उत्पन्नाची नोंद जतन झाली", "hi": "आय रिकॉर्ड सेव हुआ" },
  "Received entry saved": { "mr": "मिळाल्याची नोंद जतन झाली", "hi": "प्राप्ति रिकॉर्ड सेव हुआ" },
  "Given entry saved": { "mr": "दिल्याची नोंद जतन झाली", "hi": "दिया गया रिकॉर्ड सेव हुआ" },
  "Loans": { "mr": "कर्जे", "hi": "लोन" },
  "No Loans": { "mr": "कर्जे नाहीत", "hi": "कोई लोन नहीं" },
  "Showing ": { "mr": "दाखवत आहे ", "hi": "दिखा रहे हैं " },
  " of ": { "mr": " पैकी ", "hi": " में से " },
  "Language applied": {
    "mr": "लागू केलेली भाषा",
    "hi": "लागू की गई भाषा"
  }
};
const translate = (key) => {
  const language = getSelectedLanguage();
  return language === 'en' ? key : ((UI_TRANSLATIONS[key] && UI_TRANSLATIONS[key][language]) || key);
};

const formatDisplayDate = (dStr) => {
  if (!dStr) return '-';
  let date;
  if (dStr instanceof Date) {
    date = new Date(dStr.getFullYear(), dStr.getMonth(), dStr.getDate());
  } else {
    const s = String(dStr).trim();
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const year = m[3].length === 2 ? parseInt('20' + m[3], 10) : parseInt(m[3], 10);
      date = new Date(year, month, day);
    } else {
      date = new Date(s);
      if (isNaN(date.getTime())) return dStr;
    }
  }
  if (isNaN(date.getTime())) return dStr;
  const locale = ({ en: 'en-IN', mr: 'mr-IN', hi: 'hi-IN' })[getSelectedLanguage()] || 'en-IN';
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: '2-digit' }).format(date);
};

const gasRun = async (fnName, ...args) => {
  try {
    if (BackendBridge[fnName]) {
       return await BackendBridge[fnName](...args);
    } else {
       console.warn(`Function ${fnName} not implemented in SQLite bridge yet.`);
       return null;
    }
  } catch (err) {
    throw err;
  }
};

const downloadCsv = async (csv, filename) => {
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

const shareReceiptToWhatsApp = async (ref, filename, captionText) => {
  let target = ref && ref.current ? ref.current : (typeof ref === 'string' ? document.getElementById(ref) : ref);
  if (!target) throw new Error('Target render reference not found');
  if (target instanceof HTMLElement === false && target.nodeType !== 1) target = target.current || target;

  const result = await exportDomAsJpeg(target, {
    filename: `${filename}.jpg`,
    title: filename,
    text: captionText,
    quality: 0.9,
    backgroundColor: '#FFFFFF'
  });

  if (result.status === EXPORT_STATUS.CANCELLED) return false;
  if (result.status === EXPORT_STATUS.FAILED) {
    throw result.error || new Error('Statement image generation failed.');
  }
  return true;
};

const waitForPaint = () => new Promise(resolve => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
});

const createPaymentReminderImage = async ({ personName, amount, dueDate, loanName, emiNo, admin, reminderType = 'emi', balanceDirection = 'receivable' }) => {
  const width = 900, height = 650;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available on this device.');

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  ctx.fillStyle = '#F4F3F8';
  ctx.fillRect(0, 0, width, height);

  const ticketX = 48, ticketY = 28, ticketW = width - 96, ticketH = height - 46;
  ctx.save();
  roundRect(ticketX, ticketY, ticketW, ticketH, 28);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  // Ticket cut-outs at the footer separator. Use the slip's outer
  // background color so the semicircles never render black/transparent.
  const separatorY = 414;
  ctx.save();
  ctx.fillStyle = '#F4F3F8';
  ctx.beginPath();
  ctx.arc(ticketX, separatorY, 24, -Math.PI / 2, Math.PI / 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ticketX + ticketW, separatorY, 24, Math.PI / 2, Math.PI * 1.5);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#D8D3E0';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 10]);
  ctx.beginPath();
  ctx.moveTo(ticketX + 34, separatorY);
  ctx.lineTo(ticketX + ticketW - 34, separatorY);
  ctx.stroke();
  ctx.restore();

  const centerX = width / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#1E104B';
  ctx.font = '900 34px sans-serif';
  ctx.fillText(`${translate('Hello')} ${personName || translate('there')}!`, centerX, 100);

  ctx.fillStyle = '#625E70';
  ctx.font = '800 25px sans-serif';
  ctx.fillText(reminderType === 'ledger' ? translate('Outstanding balance') : translate('Payment reminder for'), centerX, 145);

  roundRect(205, 172, 490, 86, 22);
  ctx.fillStyle = '#F1EAF4';
  ctx.fill();
  ctx.fillStyle = '#7B2B8C';
  ctx.font = '900 58px sans-serif';
  ctx.fillText(formatMoney(amount), centerX, 216);

  ctx.fillStyle = '#1E104B';
  ctx.font = '800 25px sans-serif';
  ctx.fillText(reminderType === 'ledger' ? translate(balanceDirection === 'receivable' ? 'You will pay' : 'You will receive') : `${translate('Due on')} ${formatDisplayDate(dueDate)}`, centerX, 291);

  ctx.fillStyle = '#625E70';
  ctx.font = '700 23px sans-serif';
  ctx.fillText(reminderType === 'ledger' ? `${translate('On or before')} ${formatDisplayDate(dueDate)}` : `${loanName || translate('Loan EMI')}${emiNo ? `  •  EMI #${emiNo}` : ''}`, centerX, 329);

  // Footer is deliberately outside any background container.
  const footerTop = separatorY + 24;
  const dividerX = width / 2;

  ctx.save();
  ctx.strokeStyle = '#D8D3E0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dividerX, footerTop + 8);
  ctx.lineTo(dividerX, height - 28);
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#8A8596';
  ctx.font = '800 16px sans-serif';
  ctx.fillText(translate('Sent by'), 70, footerTop + 24);
  ctx.fillStyle = '#1E104B';
  ctx.font = '900 22px sans-serif';
  ctx.fillText(admin?.name || 'BHARAT RASVE', 70, footerTop + 54);
  ctx.fillStyle = '#625E70';
  ctx.font = '800 18px sans-serif';
  ctx.fillText(String(admin?.contact || '7218838122'), 70, footerTop + 82);

  const brandingCenterX = dividerX + (width - dividerX) / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8A8596';
  ctx.font = '800 15px sans-serif';
  ctx.fillText(translate('Using'), brandingCenterX, footerTop + 18);

  const logoSrc = Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED;
  if (logoSrc) {
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxLogoW = 170;
        const maxLogoH = 46;
        const scale = Math.min(maxLogoW / img.width, maxLogoH / img.height);
        const logoW = Math.max(1, img.width * scale);
        const logoH = Math.max(1, img.height * scale);
        ctx.drawImage(img, brandingCenterX - logoW / 2, footerTop + 28 + (maxLogoH - logoH) / 2, logoW, logoH);
        resolve();
      };
      img.onerror = resolve;
      img.src = logoSrc;
    });
  }

  ctx.fillStyle = '#1E104B';
  ctx.font = '900 17px sans-serif';
  ctx.fillText(translate('Your Personal Finance App'), brandingCenterX, footerTop + 88);
  ctx.fillStyle = '#625E70';
  ctx.font = '700 15px sans-serif';
  ctx.fillText(translate('Developed by - Bharat Rasve'), brandingCenterX, footerTop + 112);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Unable to create reminder image.')), 'image/jpeg', 0.92);
  });
  return new File([blob], `Budget_Bharat_Payment_Reminder_${Date.now()}.jpg`, { type: 'image/jpeg' });
};

const AppContext = createContext();

const AppProvider = ({ children }) => {
  const [transactions, setTransactions] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loans, setLoans] = useState([]);
  const [categories, setCategories] = useState({ expense: [], income: [] });
  const [admin, setAdmin] = useState({ name: '', contact: '', email: '', headerNote: '', footerNote: '' });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [syncStatus, setSyncStatus] = useState('idle');
  const [searchQuery, setSearchQuery] = useState('');

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState('menu');
  // Language preference is device-local and defaults to English on a fresh install.
  const [languageUpdating, setLanguageUpdating] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState(() => {
    try { return localStorage.getItem('budgetBharat.language') || 'en'; } catch (_) { return 'en'; }
  });
  const [language, setLanguageState] = useState(() => {
    try { return localStorage.getItem('budgetBharat.language') || 'en'; } catch (_) { return 'en'; }
  });
  const setLanguage = (nextLanguage) => {
    const supported = ['en', 'mr', 'hi'];
    const next = supported.includes(nextLanguage) ? nextLanguage : 'en';
    setLanguageUpdating(true);
    setLanguageState(next);
    try { localStorage.setItem('budgetBharat.language', next); } catch (_) {}
    window.setTimeout(() => setLanguageUpdating(false), 1200);
  };

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.appLanguage = language;
  }, [language]);

  const [toast, setToast] = useState({ show: false, msg: '' });

  const [filterPeriod, setFilterPeriod] = useState('All');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState('ALL');

  const [googleUser, setGoogleUser] = useState(null);

  const showFeedback = (msg) => {
    const exact = translate(msg);
    const prefixKey = exact === msg
      ? Object.keys(UI_TRANSLATIONS).filter(key => key.endsWith(': ') && msg.startsWith(key)).sort((a, b) => b.length - a.length)[0]
      : null;
    const translatedMessage = exact !== msg ? exact : prefixKey ? translate(prefixKey) + msg.slice(prefixKey.length) : msg;
    setToast({ show: true, msg: translatedMessage });
    setTimeout(() => setToast({ show: false, msg: '' }), 3000);
  };

  const applyPayload = (payload) => {
    setTransactions(payload.transactions || []);
    setPersons(payload.persons || []);
    setLoans(payload.loans || []);
    setCategories(payload.categories || { expense: [], income: [] });
    setAdmin(payload.admin || { name: '', contact: '', email: '' });
  };

  const saveLoanAction = (loanData) => {
    return gasRun('saveLoan', loanData)
      .then((payload) => { applyPayload(payload); showFeedback('Loan updated'); })
      .catch((err) => { showFeedback('Save failed: ' + err.message); throw err; });
  };

  const deleteLoanAction = (loanId) => {
    return gasRun('deleteLoan', loanId)
      .then((payload) => { applyPayload(payload); showFeedback('Loan deleted'); })
      .catch((err) => { showFeedback('Delete failed: ' + err.message); throw err; });
  };

  const refresh = (verbose = false, force = false) => {
    setLoading(true);
    setSyncStatus('syncing');
    gasRun('getDashboardPayload', force)
      .then((payload) => {
        applyPayload(payload);
        setLoadError('');
        if (verbose) showFeedback('Data synced locally');
      })
      .catch((err) => setLoadError(String(err && err.message ? err.message : err)))
      .finally(() => { setLoading(false); setSyncStatus('idle'); });
  };

  useEffect(() => { 
    refresh(false, false); 
    GoogleDriveSync.getCurrentUser()
      .then(user => { if (user) setGoogleUser(user); })
      .catch(() => {});
  }, []);

  const handleGoogleLogin = async () => {
    try {
      showFeedback('Connecting to Google...');
      const user = await GoogleDriveSync.login();
      setGoogleUser(user);
      showFeedback('Logged in as ' + (user.email || user.name || 'Google User'));
    } catch(err) {
      showFeedback(err.message || 'Google Login Failed');
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await GoogleDriveSync.logout();
    } catch(e){}
    setGoogleUser(null);
    showFeedback('Logged out of Google');
  };

  const uploadBackupToCloud = async () => {
    if (!googleUser) {
      showFeedback('Please sign in to Google first.');
      setMenuView('menu');
      setIsMenuOpen(true);
      return;
    }
    setSyncStatus('syncing');
    showFeedback('Uploading backup to Google Drive...');
    try {
      const currentLocalData = { transactions, persons, categories, loans, admin };
      await GoogleDriveSync.pushToCloud(currentLocalData);
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      showFeedback('Backup uploaded successfully');
    } catch (err) {
      showFeedback('Upload failed: ' + (err.message || 'Error occurred'));
    } finally {
      setTimeout(() => setSyncStatus(prev => prev === 'success' ? 'idle' : prev), 1400);
    }
  };

  const restoreBackupFromCloud = async () => {
    if (!googleUser) {
      showFeedback('Please sign in to Google first.');
      setMenuView('menu');
      setIsMenuOpen(true);
      return;
    }
    if (transactions.length > 0) {
      const confirmRestore = window.confirm(
        'Restoring from Google Drive will replace current local records. Continue?'
      );
      if (!confirmRestore) return;
    }

    setSyncStatus('restoring');
    showFeedback('Retrieving cloud backup...');
    try {
      const cloudData = await GoogleDriveSync.pullFromCloud();
      if (!cloudData || !cloudData.transactions) {
        showFeedback('No valid cloud backup found.');
        return;
      }
      applyPayload(cloudData);
      await gasRun('restoreFullBackup', cloudData);
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      setSyncStatus('success');
      showFeedback('Backup restored from Google Drive');
    } catch (err) {
      showFeedback('Restore failed: ' + (err.message || 'Error occurred'));
    } finally {
      setTimeout(() => setSyncStatus(prev => prev === 'success' ? 'idle' : prev), 1400);
    }
  };

  const addTransaction = (tx) => {
    const typeLabel = translate(tx.type === 'BORROW' ? 'Received' : tx.type === 'LENT' ? 'Given' : tx.type === 'EXPENSE' ? 'Expense' : 'Income');
    return gasRun('addTransaction', tx)
      .then((payload) => { 
        if (payload) applyPayload(payload); 
        showFeedback(`${typeLabel} ${translate('entry saved')}`); 
      })
      .catch((err) => { showFeedback('Save failed: ' + err.message); throw err; });
  };

  const deleteTransaction = (id) => {
    const targetId = typeof id === 'object' ? String(id.id || id.entryId || '').trim() : String(id || '').trim();
    return gasRun('deleteTransaction', targetId)
      .then((payload) => {
        if (payload && payload.transactions) {
          applyPayload(payload);
        } else {
          setTransactions(prev => prev.filter(t => String(t.id || t.entryId).trim() !== targetId));
        }
        showFeedback('Transaction deleted');
      })
      .catch((err) => {
        refresh(false, true);
        showFeedback('Delete failed: ' + (err && err.message ? err.message : String(err)));
        throw err;
      });
  };

  const addPerson = (p) => {
    return gasRun('addPerson', p)
      .then((payload) => { 
        if (payload) applyPayload(payload); 
        showFeedback('Person Added to Directory'); 
      })
      .catch((err) => { showFeedback('Save failed: ' + err.message); throw err; });
  };

  const updatePerson = (p) => {
    return gasRun('updatePerson', p)
      .then((payload) => { 
        if (payload) applyPayload(payload); 
        showFeedback('Person & transactions updated'); 
      })
      .catch((err) => { showFeedback('Update failed: ' + err.message); throw err; });
  };

  const deletePerson = (personName) => {
    return gasRun('deletePerson', personName)
      .then((payload) => { 
        if (payload && payload.persons) {
          applyPayload(payload);
        } else {
          setPersons(prev => prev.filter(p => p.name !== personName));
          setTransactions(prev => prev.filter(t => t.person !== personName));
        }
        showFeedback('Person & related entries deleted'); 
      })
      .catch((err) => { 
        refresh(false, true);
        showFeedback('Delete failed: ' + (err && err.message ? err.message : String(err))); 
        throw err; 
      });
  };

  const addCategory = (type, name) => {
    return gasRun('addCategory', type, name)
      .then((payload) => { 
        if (payload) applyPayload(payload); 
        showFeedback('Category Added'); 
      })
      .catch((err) => { showFeedback('Save failed: ' + err.message); throw err; });
  };

  const updateCategory = (oldData, newData) => {
    return gasRun('updateCategory', oldData, newData)
      .then((payload) => { 
        if (payload) applyPayload(payload); 
        showFeedback('Category Updated'); 
      })
      .catch((err) => { showFeedback('Update failed: ' + err.message); throw err; });
  };

  const deleteCategory = (catData) => {
    return gasRun('deleteCategory', catData)
      .then((payload) => { 
        if (payload) applyPayload(payload); 
        showFeedback('Category Deleted'); 
      })
      .catch((err) => { showFeedback('Delete failed: ' + err.message); throw err; });
  };

  const updateAdminConfig = (adminData) => {
    return gasRun('updateAdminConfig', adminData)
      .then((payload) => { 
        if (payload) applyPayload(payload); 
        showFeedback('Admin settings saved'); 
      })
      .catch((err) => { showFeedback('Save failed: ' + err.message); throw err; });
  };

  const exportCsv = async (rpcFn, filename) => {
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
  };

  const csvEscape = (v) => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csvSection = (headers, rows) => [headers.join(',')]
    .concat(rows.map(r => headers.map(h => csvEscape(r[h])).join(',')))
    .join('\n');

  const exportFullBackupCsv = async () => {
    showFeedback('Preparing full backup...');
    try {
      const lines = [];
      lines.push('##SECTION:transactions');
      lines.push(csvSection(['id', 'type', 'amount', 'category', 'person', 'date', 'note', 'ref', 'promiseDate'], transactions));
      lines.push('##SECTION:persons');
      lines.push(csvSection(['id', 'name', 'phone', 'email', 'address'], persons));
      lines.push('##SECTION:categories');
      const catRows = [
        ...(categories.expense || []).map(name => ({ type: 'expense', name })),
        ...(categories.income || []).map(name => ({ type: 'income', name })),
      ];
      lines.push(csvSection(['type', 'name'], catRows));
      lines.push('##SECTION:loans');
      lines.push(csvSection(
        ['id', 'person', 'loanName', 'principalAmount', 'loanAmount', 'monthlyEmi', 'tenureMonths', 'firstEmiDate', 'status', 'scheduleJson'],
        (loans || []).map(l => ({ ...l, scheduleJson: JSON.stringify(l.schedule || []) }))
      ));
      lines.push('##SECTION:admin');
      lines.push(csvSection(['name', 'contact', 'email', 'headerNote', 'footerNote'], [admin || {}]));

      const exported = await downloadCsv(lines.join('\n'), `budget_bharat_full_backup_${Date.now()}.csv`);
      showFeedback(exported ? 'Full backup exported' : 'Backup export canceled');
      return exported;
    } catch (err) {
      showFeedback('Backup export failed: ' + err.message);
    }
  };

  const parseCsvRows = (text) => {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => !(r.length === 1 && r[0] === ''));
  };

  const importFullBackupCsv = (file) => {
    if (!file) return;
    showFeedback('Restoring backup...');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target.result);
        const parts = text.split(/(?=##SECTION:)/).map(p => p.trim()).filter(Boolean);
        const data = { transactions: [], persons: [], categories: { expense: [], income: [] }, loans: [], admin: {} };

        parts.forEach(part => {
          const firstNL = part.indexOf('\n');
          const sectionName = part.slice(0, firstNL).replace('##SECTION:', '').trim();
          const body = part.slice(firstNL + 1);
          const rows = parseCsvRows(body);
          if (rows.length === 0) return;
          const cols = rows[0];
          const records = rows.slice(1).map(r => {
            const obj = {};
            cols.forEach((c, i) => { obj[c] = r[i] !== undefined ? r[i] : ''; });
            return obj;
          });

          if (sectionName === 'transactions') {
            data.transactions = records.map(r => ({ ...r, amount: Number(r.amount) || 0 }));
          } else if (sectionName === 'persons') {
            data.persons = records;
          } else if (sectionName === 'categories') {
            records.forEach(r => {
              if (r.type === 'income') data.categories.income.push(r.name);
              else data.categories.expense.push(r.name);
            });
          } else if (sectionName === 'loans') {
            data.loans = records.map(r => {
              let schedule = [];
              try { schedule = JSON.parse(r.scheduleJson || '[]'); } catch (e) { schedule = []; }
              return {
                ...r,
                principalAmount: Number(r.principalAmount) || 0,
                loanAmount: Number(r.loanAmount) || 0,
                monthlyEmi: Number(r.monthlyEmi) || 0,
                tenureMonths: Number(r.tenureMonths) || 0,
                schedule
              };
            });
          } else if (sectionName === 'admin') {
            data.admin = records[0] || {};
          }
        });

        gasRun('restoreFullBackup', data)
          .then((payload) => { applyPayload(payload); showFeedback('Backup restored successfully'); })
          .catch((err) => showFeedback('Restore failed: ' + err.message));
      } catch (err) {
        showFeedback('Invalid backup file: ' + err.message);
      }
    };
    reader.onerror = () => showFeedback('Could not read that file');
    reader.readAsText(file);
  };

  const filteredTransactions = useMemo(() => {
    if (filterPeriod === 'All' || filterPeriod === 'All Time') return transactions;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return transactions.filter(t => {
      const d = parseDate(t.date);

      if (filterPeriod === 'Today') return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
      if (filterPeriod === 'Week') {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        return d >= start && d <= today;
      }
      if (filterPeriod === 'Month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      if (filterPeriod === 'Qtr') {
        const q = Math.floor(today.getMonth() / 3);
        return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === today.getFullYear();
      }
      if (filterPeriod === 'Year') return d.getFullYear() === today.getFullYear();
      if (filterPeriod === 'Custom' && customFrom && customTo) {
        const f = parseDate(customFrom);
        const tDate = parseDate(customTo);
        tDate.setHours(23, 59, 59, 999);
        return d >= f && d <= tDate;
      }
      return true;
    });
  }, [transactions, filterPeriod, customFrom, customTo]);

  const updateTransaction = (tx) => {
    return gasRun('updateTransaction', tx)
      .then((payload) => { 
        if (payload) applyPayload(payload); 
        showFeedback('Transaction updated'); 
      })
      .catch((err) => { showFeedback('Update failed: ' + err.message); throw err; });
  };

  return (
    <AppContext.Provider value={{
      transactions, filteredTransactions, persons, loans, categories, admin, loading, loadError, syncStatus,
      searchQuery, setSearchQuery,
      isMenuOpen, setIsMenuOpen, menuView, setMenuView,
      language, setLanguage, languageUpdating,
      filterPeriod, setFilterPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
      directoryFilter, setDirectoryFilter,
      googleUser, handleGoogleLogin, handleGoogleLogout,
      uploadBackupToCloud, restoreBackupFromCloud,
      addTransaction, updateTransaction, deleteTransaction, addPerson, updatePerson, deletePerson, addCategory, updateCategory, deleteCategory, updateAdminConfig,
      saveLoanAction, deleteLoanAction,
      exportCsv, exportFullBackupCsv, importFullBackupCsv, refresh, showFeedback
    }}>
      {children}
      {toast.show && (
        <div className="fixed bottom-24 left-0 right-0 flex justify-center z-50 toast-enter pointer-events-none">
          <div className="bg-theme-dark text-white px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 text-xs font-bold tracking-wide">
            <i className="fa-solid fa-circle-check text-emerald-400 text-sm"></i>
            {toast.msg}
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
};// --- START OF src/main.jsx (PART 2) ---

const AppDatePicker = ({ value, onChange, required = false, className = '', style = {} }) => {
  const inputRef = useRef(null);
  const lockRef = useRef(false);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    if (inputRef.current) {
      lockRef.current = true;
      inputRef.current.blur();
      setTimeout(() => {
        lockRef.current = false;
      }, 450);
    }
  };

  const handleBlock = (e) => {
    if (lockRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div onClick={e => e.stopPropagation()} onTouchStart={handleBlock} onPointerDown={handleBlock} className="relative w-full">
      <input
        ref={inputRef}
        type="date"
        required={required}
        value={value || ''}
        style={{ colorScheme: 'light', touchAction: 'manipulation', ...style }}
        onClick={handleBlock}
        onFocus={handleBlock}
        onChange={handleChange}
        className={className}
      />
    </div>
  );
};

const SearchableDropdown = ({ value, onChange, options = [], placeholder = 'Select or type...' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  const filteredOptions = useMemo(() => {
    if (!value) return options.slice(0, 15);
    const query = String(value).toLowerCase();
    return options.filter(opt => String(opt).toLowerCase().includes(query)).slice(0, 15);
  }, [options, value]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full font-bold text-xs border border-[#1E104B]/20 rounded-xl pl-3.5 pr-8 py-3 outline-none focus:border-[#7B2B8C] focus:ring-2 focus:ring-[#7B2B8C]/20 transition-all bg-[#F4F3F8] focus:bg-white text-[#1E104B] placeholder-[#625E70]/50"
        />
        <button
          type="button"
          tabIndex="-1"
          onClick={() => setIsOpen(prev => !prev)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-dark/40 hover:text-theme-dark p-1"
        >
          <i className={`fa-solid ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]`}></i>
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#241457] border border-[#7B2B8C]/40 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto hide-scrollbar">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, i) => (
              <div
                key={i}
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className="px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#7B2B8C] cursor-pointer transition-colors border-b border-white/5 last:border-b-0 flex justify-between items-center"
              >
                <span className="text-white font-bold">{opt}</span>
                {value === opt && <i className="fa-solid fa-check text-[10px] text-emerald-400"></i>}
              </div>
            ))
          ) : (
            <div className="px-3.5 py-2 text-[11px] text-white/50 italic">
              Press enter or keep typing to add new
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PeriodSelector = () => {
  const { filterPeriod, setFilterPeriod, customFrom, setCustomFrom, customTo, setCustomTo } = useContext(AppContext);
  const options = ['All', 'Today', 'Week', 'Month', 'Qtr', 'Year', 'Custom'];
  const activeIndex = Math.max(0, options.indexOf(filterPeriod));

  return (
    <div className="flex flex-col items-end w-full z-20">
      <div className="w-full max-w-full overflow-x-auto hide-scrollbar flex justify-end">
        <div className="relative flex items-center bg-slate-200/90 p-1 rounded-xl shadow-inner w-full min-w-[360px] sm:min-w-[480px]">
          <div
            className="absolute top-1 bottom-1 bg-white rounded-lg shadow-sm transition-all duration-300 ease-out"
            style={{
              width: `calc((100% - 8px) / ${options.length})`,
              left: `calc(4px + ${activeIndex} * ((100% - 8px) / ${options.length}))`
            }}
          ></div>

          {options.map((opt) => {
            const isSelected = filterPeriod === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setFilterPeriod(opt)}
                className={`flex-1 relative z-10 py-1.5 text-center text-[10px] sm:text-xs font-bold uppercase tracking-tight whitespace-nowrap transition-all duration-200 select-none ${
                  isSelected
                    ? 'text-slate-900 font-black scale-105'
                    : 'text-slate-500 font-semibold hover:text-slate-800'
                }`}
              >
                {translate(opt === 'Qtr' ? 'Qtr' : opt)}
              </button>
            );
          })}
        </div>
      </div>

      {filterPeriod === 'Custom' && (
        <div className="flex space-x-2 mt-1.5 bg-white p-2 rounded-xl border border-theme-dark/15 shadow-sm animate-slide-up origin-top text-[10px] font-bold items-center">
          <div className="flex flex-col w-28">
            <span className="text-theme-dark/60 uppercase text-[8px]">{translate("From")}</span>
            <AppDatePicker value={customFrom} onChange={setCustomFrom} className="outline-none text-theme-dark bg-transparent text-[10px] w-full cursor-pointer" />
          </div>
          <div className="flex flex-col border-l border-theme-dark/20 pl-2 w-28">
            <span className="text-theme-dark/60 uppercase text-[8px]">{translate("To")}</span>
            <AppDatePicker value={customTo} onChange={setCustomTo} className="outline-none text-theme-dark bg-transparent text-[10px] w-full cursor-pointer" />
          </div>
        </div>
      )}
    </div>
  );
};

const TransactionTable = ({ transactions, maxRows = 6, showViewAll = true, onSelectTransaction, embedded = false }) => {
  const [expanded, setExpanded] = useState(false);
  const sortedTransactions = sortTransactionsByDateDesc(transactions);
  const displayTxs = expanded ? sortedTransactions : sortedTransactions.slice(0, maxRows);

  if (transactions.length === 0) return <p className="text-xs text-theme-dark/60 font-semibold px-3 py-3">{translate("No records found.")}</p>;

  return (
    <div className={embedded ? 'w-full' : 'bg-white rounded-lg border border-theme-dark/10 overflow-hidden shadow-sm'}>
      <div className="overflow-x-auto hide-scrollbar">
        <table className="w-full text-left text-[10px] whitespace-nowrap">
          <thead className="bg-[#E2DEEA] text-[#1E104B] uppercase font-black border-b border-[#CDC8DA] tracking-wider">
            <tr>
              <th className="px-3 py-1.5">{translate("Date")}</th>
              <th className="px-3 py-1.5">{translate("Description")}</th>
              <th className="px-3 py-1.5">{translate("Type")}</th>
              <th className="px-3 py-1.5 text-right">{translate("Amount")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-theme-dark/5 font-medium text-theme-dark">
            {displayTxs.map(t => {
              const isPos = ['INCOME', 'BORROW'].includes(t.type);
              const txColor = isPos ? '#078A87' : '#D6455D';

              return (
                <tr
                  key={t.id || t.entryId}
                  data-entry-id={t.id || t.entryId}
                  onClick={() => onSelectTransaction && onSelectTransaction(t)}
                  className="hover:bg-[#EDE9F6]/70 transition-colors cursor-pointer active:bg-[#E2DEEA]/50"
                >
                  <td className="px-3 py-3.5 font-semibold text-[#625E70]">{formatDisplayDate(t.date)}</td>
                  <td className="px-3 py-3.5 font-bold max-w-[130px] truncate text-[#1E104B]">
                    {t.note || t.category}
                    {(t.person || t.ref) && (
                      <span className="block text-[8px] font-semibold text-[#8A8596] mt-0.5">
                        {t.person} {t.person && t.ref ? '•' : ''} {t.ref}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 font-extrabold text-[#8A8596] uppercase text-[9px] tracking-wider">
                    {translate(t.type === 'LENT' ? 'Given' : t.type === 'BORROW' ? 'Received' : t.type === 'EXPENSE' ? 'Expense' : 'Income')}
                  </td>
                  <td className="px-3 py-3.5 text-right font-black text-xs" style={{ color: txColor }}>
                    {isPos ? '+' : '-'}{formatTableNum(t.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showViewAll && transactions.length > maxRows && (
        <div className="border-t border-theme-dark/5 bg-theme-gray/60 p-2 text-center">
          <button onClick={() => setExpanded(!expanded)} className="text-[10px] font-bold text-theme-dark hover:opacity-70 uppercase tracking-widest transition-opacity w-full">
            {expanded ? 'Show Less' : `View All (${transactions.length})`}
          </button>
        </div>
      )}
    </div>
  );
};

const Header = () => {
  const { searchQuery, setSearchQuery, setIsMenuOpen, setMenuView, uploadBackupToCloud, syncStatus, loadError } = useContext(AppContext);
  const isSyncing = syncStatus === 'syncing';
  const isRestoring = syncStatus === 'restoring';
  const isSuccess = syncStatus === 'success';
  const isError = loadError !== '';
  const [isFocused, setIsFocused] = useState(false);

  const handleMenuClick = () => {
    setMenuView('menu');
    setIsMenuOpen(true);
  };

  return (
    <div className="grad-dark pt-3.5 pb-3 px-4 rounded-b-[1.5rem] shadow-md flex items-center space-x-2.5 flex-none z-30">
      <button
        onClick={handleMenuClick}
        className="w-10 h-10 rounded-xl bg-white/10 border-0 flex items-center justify-center text-white active:scale-95 transition-all flex-none hover:bg-white/20 shadow-xs relative overflow-hidden"
        title="Menu"
      >
        <span className="header-menu-cycle absolute inset-0 flex items-center justify-center">
          <i className="fa-solid fa-bars text-base header-menu-bars"></i>
          <img
            src={APP_ICON_WHITE}
            alt="Logo Icon"
            className="absolute h-7 w-7 object-contain header-menu-logo drop-shadow-sm"
          />
        </span>
      </button>

      <div className="flex-1 relative">
        <i
          className="fa-solid fa-search absolute left-3.5 top-1/2 -translate-y-1/2 z-20 text-white text-sm pointer-events-none"
          style={{ display: 'block', lineHeight: 1 }}
        ></i>
        <input
          type="text"
          placeholder={translate("Search people, note, category...")}
          value={searchQuery}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`w-full backdrop-blur-md rounded-xl py-2 pl-9 pr-8 text-sm text-white placeholder-white/60 outline-none transition-colors font-medium ${
            isFocused || searchQuery
              ? 'bg-white/25 border-2 border-white ring-2 ring-white/30'
              : 'bg-white/10 border border-white/20'
          }`}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white">
            <i className="fa-solid fa-xmark text-xs"></i>
          </button>
        )}
      </div>
      <button
        onClick={uploadBackupToCloud}
        disabled={isSyncing}
        className={`sync-header-btn ${isSyncing ? 'is-syncing' : ''} ${isError ? 'is-error' : ''}`}
        title={isSyncing ? 'Uploading backup...' : isError ? 'Error. Tap to retry.' : 'Upload backup to Google Drive'}
      >
        <i className={`fa-solid ${isSyncing ? 'fa-cloud-arrow-up animate-pulse' : isRestoring ? 'fa-cloud-arrow-down animate-pulse' : isSuccess ? 'fa-cloud-check' : 'fa-cloud'} text-sm`}></i>
      </button>
    </div>
  );
};

const SearchView = ({ onSelectPerson, onSelectTransaction }) => {
  const { searchQuery, setSearchQuery, transactions, persons, categories } = useContext(AppContext);
  const query = searchQuery.trim().toLowerCase();

  const matchedPersons = useMemo(() => {
    if (!query) return [];
    return persons.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.phone && String(p.phone).toLowerCase().includes(query))
    );
  }, [persons, query]);

  const matchedTransactions = useMemo(() => {
    if (!query) return [];
    return transactions.filter(t => {
      const amount = String(t.amount ?? '').replace(/,/g, '');
      const amountFormatted = formatTableNum(t.amount).replace(/,/g, '');
      const note = String(t.note || '').toLowerCase();
      const category = String(t.category || '').trim().toLowerCase();
      const person = String(t.person || '').toLowerCase();
      const ref = String(t.ref || '').toLowerCase();
      return (
        note.includes(query) ||
        category.includes(query) ||
        person.includes(query) ||
        ref.includes(query) ||
        amount.includes(query) ||
        amountFormatted.includes(query)
      );
    });
  }, [transactions, query]);

  const matchedCategories = useMemo(() => {
    if (!query) return [];
    const allCats = [...(categories.expense || []), ...(categories.income || [])]
      .map(c => typeof c === 'string' ? c : String(c?.name || c?.label || ''))
      .map(c => c.trim())
      .filter(Boolean);
    return [...new Set(allCats)].filter(c => c.toLowerCase().includes(query));
  }, [categories, query]);

  const hasResults = matchedPersons.length > 0 || matchedTransactions.length > 0 || matchedCategories.length > 0;

  return (
    <div className="px-4 mt-4 pb-8 space-y-5">
      <div className="flex justify-between items-center px-1">
        <span className="text-xs text-theme-dark/60 font-bold">{translate("Results for")} "<span className="text-theme-dark">{searchQuery}</span>"</span>
        <span className="text-[10px] font-bold text-theme-dark/50">{matchedPersons.length + matchedTransactions.length} {translate("matches")}</span>
      </div>

      {!hasResults ? (
        <div className="text-center py-12">
          <i className="fa-solid fa-magnifying-glass text-3xl text-theme-dark/20 mb-2"></i>
          <p className="text-sm font-bold text-theme-dark/60">{translate("No matches found")}</p>
        </div>
      ) : (
        <>
          {matchedPersons.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-[#625E70] uppercase tracking-wider mb-2 px-1">{translate("People")} ({matchedPersons.length})</h3>
              <div className="space-y-2">
                {matchedPersons.map(p => {
                  let dr = 0, cr = 0;
                  transactions.filter(t => t.person === p.name).forEach(t => {
                    if (t.type === 'LENT') dr += t.amount;
                    if (t.type === 'BORROW') cr += t.amount;
                  });
                  const bal = dr - cr;
                  const balColor = bal > 0 ? '#078A87' : bal < 0 ? '#D6455D' : '#625E70';

                  return (
                    <div key={p.id} onClick={() => onSelectPerson(p)} className="p-3 bg-white border border-[#E4E1EA] rounded-2xl shadow-xs cursor-pointer flex justify-between items-center hover:bg-[#F4F3F8] transition-all">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-[#7B2B8C]/15 text-[#7B2B8C] flex items-center justify-center font-black text-xs">
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#1E104B]">{p.name}</p>
                          <p className="text-[10px] text-[#8A8596] font-semibold">{p.phone || 'No phone'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black" style={{ color: balColor }}>
                          {bal > 0 ? '+' : bal < 0 ? '-' : ''}{formatMoney(Math.abs(bal))}
                        </span>
                        <span className="block text-[8px] font-bold text-[#8A8596] uppercase">
                          {bal > 0 ? 'Receivable' : bal < 0 ? 'Payable' : 'Settled'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {matchedCategories.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-[#625E70] uppercase tracking-wider mb-2 px-1">{translate("Categories")}</h3>
              <div className="flex flex-wrap gap-1.5">
                {matchedCategories.map((c, i) => (
                  <button key={i} type="button" onClick={() => setSearchQuery(String(c).trim())} title={`Filter transactions by ${c}`} className="px-3 py-1 bg-white border border-[#E4E1EA] rounded-full text-xs font-bold text-[#1E104B] shadow-xs flex items-center hover:bg-[#7B2B8C] hover:text-white active:scale-95 transition-all">
                    <i className="fa-solid fa-tag mr-1.5 text-[#7B2B8C] text-[10px]"></i>{c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedTransactions.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold text-theme-dark uppercase tracking-wider mb-2 px-1">Transactions ({matchedTransactions.length})</h3>
              <TransactionTable transactions={matchedTransactions} maxRows={100} showViewAll={false} onSelectTransaction={onSelectTransaction} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

const SideMenuBranding = () => (
  <div className="pt-6 pb-3 flex flex-col items-center justify-center text-center opacity-80 flex-none">
    <img
      src={Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED}
      alt="Budget Bharat"
      className="h-6 object-contain mb-1.5"
    />
    <p className="text-[9px] font-bold text-[#8A8596]">{translate("Developed by - Bharat Rasve © 2026")}</p>
  </div>
);
// --- START OF src/main.jsx (PART 3) ---

const SideMenu = () => {
  const {
    isMenuOpen, setIsMenuOpen, menuView, setMenuView,
    language, setLanguage, languageUpdating,
    persons, categories, admin,
    addPerson, updatePerson, deletePerson,
    addCategory, updateCategory, deleteCategory,
    updateAdminConfig, exportCsv,
    googleUser, handleGoogleLogin, handleGoogleLogout, uploadBackupToCloud, restoreBackupFromCloud,
    exportFullBackupCsv, importFullBackupCsv
  } = useContext(AppContext);

  const [formData, setFormData] = useState({});
  const [editItem, setEditItem] = useState(null);
  const [catType, setCatType] = useState(() => window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ || 'expense');

  useEffect(() => {
    if (menuView === 'addCategory' && window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__) {
      setCatType(window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__);
      delete window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__;
    }
  }, [menuView]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [personToDelete, setPersonToDelete] = useState(null);
  const [catToDelete, setCatToDelete] = useState(null);
  const [exportGroup, setExportGroup] = useState('');

  if (!isMenuOpen) return null;

  const openSubView = (view, item = null) => {
    setMenuView(view);
    setEditItem(item);
    if (item && view === 'editCategory') {
      setFormData({ name: item });
    } else if (item) {
      setFormData(item);
    } else if (view === 'manageAdmin') {
      setFormData(admin || {});
    } else {
      setFormData({});
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (menuView === 'addPerson') {
        await addPerson({ name: formData.name, phone: formData.phone, email: formData.email, address: formData.address || 'Maharashtra' });
      } else if (menuView === 'editPerson') {
        await updatePerson({ oldName: editItem.name, name: formData.name, phone: formData.phone, email: formData.email, address: formData.address });
        setMenuView('managePersons');
        setIsSubmitting(false);
        return;
      } else if (menuView === 'addCategory') {
        await addCategory(catType, formData.name);
      } else if (menuView === 'editCategory') {
        await updateCategory({ type: catType, oldName: editItem }, { type: catType, newName: formData.name });
        setMenuView('manageCategories');
        setIsSubmitting(false);
        return;
      } else if (menuView === 'manageAdmin') {
        await updateAdminConfig({
          name: formData.name || '',
          contact: formData.contact || '',
          email: formData.email || '',
          headerNote: formData.headerNote || formData.note || '',
          footerNote: formData.footerNote || ''
        });
      }

      const keepAddFormOpen = menuView === 'addPerson' || menuView === 'addCategory';
      setFormData({});
      setEditItem(null);
      if (!keepAddFormOpen) {
        setMenuView('menu');
        setIsMenuOpen(false);
      }
    } catch (err) {
      console.error("Admin config save error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeletePerson = async () => {
    if (!personToDelete) return;
    setIsSubmitting(true);
    try {
      await deletePerson(personToDelete);
      setPersonToDelete(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteCategory = async () => {
    if (!catToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteCategory(catToDelete);
      setCatToDelete(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = (fn) => {
    setIsMenuOpen(false);
    fn();
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-[#1E104B]/70 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}></div>
      <div className="relative w-5/6 max-w-sm bg-[#F4F3F8] h-full shadow-2xl flex flex-col animate-slide-in">
        <div className="grad-dark p-5 text-white shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={Array.isArray(APP_ICON_WHITE) ? APP_ICON_WHITE.join('') : APP_ICON_WHITE}
              alt="App Icon"
              className="h-9 w-9 object-contain opacity-95 flex-none"
            />
            <div>
              <h2 className="text-lg font-black tracking-tight text-white">Budget Bharat</h2>
              <p className="text-[10px] text-white/80 uppercase tracking-wider font-bold">{translate("Your Personal Finance Manager")}</p>
            </div>
          </div>
          <button onClick={() => setIsMenuOpen(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white flex-none">
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {menuView === 'menu' && (
          <div className="flex-1 overflow-y-auto py-4 hide-scrollbar">
            <div className="px-6 pb-2 mb-2 border-b border-[#E4E1EA]">
              <button type="button" onClick={() => { setPendingLanguage(language); setMenuView('languageSettings'); }} className="w-full text-left py-3 hover:bg-white transition-colors text-sm font-bold text-[#1E104B] flex items-center justify-between rounded-lg" aria-label={translate("Languages")}>
                <span className="flex items-center gap-3 min-w-0">
                  <i className="fa-solid fa-language w-7 text-[#7B2B8C]"></i>
                  <span className="truncate">{translate("Languages")}: {LANGUAGE_NAMES[language] || LANGUAGE_NAMES.en}</span>
                </span>
                <i className="fa-solid fa-chevron-right text-xs text-[#8A8596]"></i>
              </button>
            </div>
            <div className="px-6 mb-2 text-[10px] font-bold text-[#8A8596] uppercase tracking-widest">{translate("Record Setup")}</div>
            <button onClick={() => openSubView('managePersons')} className="w-full text-left px-6 py-3.5 hover:bg-white transition-colors text-sm font-bold text-[#1E104B] flex items-center justify-between">
              <span><i className="fa-solid fa-users w-7 text-[#7B2B8C]"></i> {translate('Manage Persons')} ({persons.length})</span>
              <i className="fa-solid fa-chevron-right text-xs text-[#8A8596]"></i>
            </button>
            <button onClick={() => openSubView('manageCategories')} className="w-full text-left px-6 py-3.5 hover:bg-white transition-colors text-sm font-bold text-[#1E104B] flex items-center justify-between">
              <span><i className="fa-solid fa-tags w-7 text-[#7B2B8C]"></i> {translate("Manage Categories")}</span>
              <i className="fa-solid fa-chevron-right text-xs text-[#8A8596]"></i>
            </button>
            <button onClick={() => openSubView('manageAdmin')} className="w-full text-left px-6 py-3.5 hover:bg-white transition-colors text-sm font-bold text-[#1E104B] flex items-center justify-between">
              <span><i className="fa-solid fa-user-gear w-7 text-[#7B2B8C]"></i> {translate("Admin Setup")}</span>
              <i className="fa-solid fa-chevron-right text-xs text-[#8A8596]"></i>
            </button>

            <div className="px-6 mt-6 mb-2 text-[10px] font-bold text-[#8A8596] uppercase tracking-widest">{translate("Quick Create")}</div>
            <button onClick={() => openSubView('addPerson')} className="w-full text-left px-6 py-3 hover:bg-white transition-colors text-sm font-bold text-[#1E104B]"><i className="fa-solid fa-user-plus w-7 text-[#078A87]"></i> {translate("Add Person")}</button>
            <button onClick={() => openSubView('addCategory')} className="w-full text-left px-6 py-3 hover:bg-white transition-colors text-sm font-bold text-[#1E104B]"><i className="fa-solid fa-tag w-7 text-[#078A87]"></i> {translate("Add Category")}</button>

            <div className="px-6 mt-6 mb-2 text-[10px] font-bold text-[#8A8596] uppercase tracking-widest">{translate("Data Backup & Restore")}</div>
            {googleUser ? (
              <>
                <div className="px-6 py-2 bg-[#F4F3F8] rounded-xl mx-4 my-1 border border-[#E4E1EA]">
                  <p className="text-[9px] font-bold text-[#625E70] uppercase">{translate("Connected Account")}</p>
                  <p className="text-xs font-black text-[#1E104B] truncate">{googleUser.email || googleUser.name}</p>
                </div>
                <button onClick={() => { setIsMenuOpen(false); uploadBackupToCloud(); }} className="w-full text-left px-6 py-2.5 hover:bg-white transition-colors text-xs font-bold text-[#078A87]">
                  <i className="fa-solid fa-cloud-arrow-up w-7"></i> Upload Backup to Google
                </button>
                <button onClick={() => { setIsMenuOpen(false); restoreBackupFromCloud(); }} className="w-full text-left px-6 py-2.5 hover:bg-white transition-colors text-xs font-bold text-[#078A87]">
                  <i className="fa-solid fa-cloud-arrow-down w-7"></i> Restore from Google Drive
                </button>
                <button onClick={handleGoogleLogout} className="w-full text-left px-6 py-2.5 hover:bg-white transition-colors text-xs font-bold text-[#D6455D]">
                  <i className="fa-solid fa-arrow-right-from-bracket w-7"></i> Sign Out
                </button>
              </>
            ) : (
              <button onClick={handleGoogleLogin} className="w-full text-left px-6 py-3 hover:bg-white transition-colors text-sm font-bold text-[#1E104B]">
                <i className="fa-brands fa-google w-7 text-[#7B2B8C]"></i> {translate("Sign in with Google")}
              </button>
            )}

            <button onClick={() => handleAction(() => exportFullBackupCsv())} className="w-full text-left px-6 py-3 hover:bg-white transition-colors text-sm font-bold text-[#1E104B]">
              <i className="fa-solid fa-database w-7 text-[#7B2B8C]"></i> {translate("Export Backup File")}
            </button>
            <label className="w-full flex items-center px-6 py-3 hover:bg-white transition-colors text-sm font-bold text-[#1E104B] cursor-pointer">
              <i className="fa-solid fa-file-import w-7 text-[#078A87]"></i> {translate("Restore from Backup")}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  e.target.value = '';
                  if (!file) return;
                  if (!window.confirm('Restoring a backup replaces all current data on this device. Continue?')) return;
                  setIsMenuOpen(false);
                  importFullBackupCsv(file);
                }}
              />
            </label>

            <div className="px-6 mt-6 mb-2 text-[10px] font-bold text-[#8A8596] uppercase tracking-widest">{translate("Data Exports")}</div>
            <div className="px-4 space-y-2">
              <button
                type="button"
                onClick={() => setExportGroup(exportGroup === 'summaries' ? '' : 'summaries')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#F4F3F8] border border-[#E4E1EA] text-xs font-black text-[#1E104B]"
              >
                <span><i className="fa-solid fa-chart-pie w-7 text-[#078A87]"></i>{translate("Summaries")}</span>
                <i className={`fa-solid fa-chevron-${exportGroup === 'summaries' ? 'up' : 'down'} text-[10px] text-[#8A8596]`}></i>
              </button>
              {exportGroup === 'summaries' && (
                <div className="grid grid-cols-2 gap-1.5 px-1">
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportIncomeSummaryCsv', 'income_summary.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("Income")}</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportExpenseSummaryCsv', 'expense_summary.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("Expenses")}</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportActiveLoansSummaryCsv', 'active_loans_summary.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("Active Loans")}</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportPersonsSummaryCsv', 'persons_summary.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("Persons")}</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportReceivablesCsv', 'receivables_report.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("Receivables")}</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportPayablesCsv', 'payables_report.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("Payables")}</button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setExportGroup(exportGroup === 'transactions' ? '' : 'transactions')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#F4F3F8] border border-[#E4E1EA] text-xs font-black text-[#1E104B]"
              >
                <span><i className="fa-solid fa-list-check w-7 text-[#7B2B8C]"></i>{translate("Transactions")}</span>
                <i className={`fa-solid fa-chevron-${exportGroup === 'transactions' ? 'up' : 'down'} text-[10px] text-[#8A8596]`}></i>
              </button>
              {exportGroup === 'transactions' && (
                <div className="grid grid-cols-2 gap-1.5 px-1">
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportAllLoanEmiRecordsCsv', 'all_loan_emi_records.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("Loans EMI Records")}</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportTransactionsCsv', 'transactions_export.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("All Transactions")}</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportAllIncomesCsv', 'all_incomes.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("Incomes")}</button>
                  <button type="button" onClick={() => handleAction(() => exportCsv('exportAllExpensesCsv', 'all_expenses.csv'))} className="px-2.5 py-2 rounded-lg bg-white border border-[#E4E1EA] text-[10px] font-bold text-[#1E104B]">{translate("Expenses")}</button>
                </div>
              )}
            </div>

            <SideMenuBranding />
          </div>
        )}

        {menuView === 'languageSettings' && (
          <div className="flex-1 p-5 flex flex-col h-full overflow-y-auto hide-scrollbar bg-white">
            <div className="flex justify-between items-center mb-5">
              <button onClick={() => setMenuView('menu')} className="text-xs font-bold text-[#625E70] hover:text-[#1E104B]">
                <i className="fa-solid fa-arrow-left mr-1.5"></i> {translate("Back")}
              </button>
            </div>
            <h3 className="text-base font-black text-[#1E104B] mb-1">{translate("Choose Language")}</h3>
            <p className="text-xs text-[#8A8596] mb-4">{language === 'mr' ? 'अॅपसाठी तुमची भाषा निवडा.' : language === 'hi' ? 'ऐप के लिए अपनी भाषा चुनें।' : 'Select the language for the app.'}</p>
            <div className="space-y-2">
              {[
                { value: 'en', label: 'English', detail: 'English' },
                { value: 'mr', label: 'मराठी', detail: 'Marathi' },
                { value: 'hi', label: 'हिन्दी', detail: 'Hindi' }
              ].map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPendingLanguage(option.value)}
                  className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${pendingLanguage === option.value ? 'border-[#7B2B8C] bg-[#F8F1FA]' : 'border-[#E4E1EA] bg-[#F4F3F8]'}`}
                  aria-pressed={pendingLanguage === option.value}
                >
                  <span>
                    <span className="block text-sm font-bold text-[#1E104B]">{option.label}</span>
                    <span className="block text-[10px] text-[#8A8596]">{option.detail}</span>
                  </span>
                  <i className={`fa-solid ${pendingLanguage === option.value ? 'fa-circle-check text-[#7B2B8C]' : 'fa-circle text-[#C7C3D0]'}`}></i>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={languageUpdating}
              onClick={() => { setLanguage(pendingLanguage); setMenuView('menu'); }}
              className="w-full mt-5 rounded-xl bg-[#21104F] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {languageUpdating ? (pendingLanguage === 'mr' ? 'भाषा अपडेट करत आहोत. कृपया प्रतीक्षा करा.' : pendingLanguage === 'hi' ? 'भाषा अपडेट हो रही है। कृपया प्रतीक्षा करें।' : 'Updating language, please wait...') : translate("Confirm")}
            </button>
            {!languageUpdating && (
              <p className="mt-3 text-[11px] font-semibold text-[#7B2B8C]" role="status" aria-live="polite">
                <i className="fa-solid fa-circle-check mr-1"></i>{translate('Language applied')}: {LANGUAGE_NAMES[language] || LANGUAGE_NAMES.en}
              </p>
            )}
            <div className="mt-auto pt-8"><SideMenuBranding /></div>
          </div>
        )}

        {menuView === 'managePersons' && (
          <div className="flex-1 p-5 flex flex-col h-full overflow-y-auto hide-scrollbar bg-white">
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setMenuView('menu')} className="text-xs font-bold text-[#625E70] hover:text-[#1E104B]"><i className="fa-solid fa-arrow-left mr-1.5"></i> {translate("Back")}</button>
              <button onClick={() => openSubView('addPerson')} className="px-3 py-1.5 rounded-full bg-[#078A87] text-white text-[10px] font-black uppercase"><i className="fa-solid fa-plus mr-1"></i> {translate("Add")}</button>
            </div>
            <h3 className="text-base font-black text-[#1E104B] mb-3">{translate('Directory Persons')} ({persons.length})</h3>
            <div className="space-y-2 flex-1 overflow-y-auto hide-scrollbar">
              {persons.map(p => (
                <div key={p.id || p.name} className="p-3 bg-[#F4F3F8] rounded-xl border border-[#E4E1EA] flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-[#1E104B]">{p.name}</p>
                    <p className="text-[9px] text-[#8A8596] font-medium">{p.phone || 'No phone'} • {p.address || 'Maharashtra'}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openSubView('editPerson', p)} title={translate("Edit Person")} className="w-7 h-7 rounded-lg bg-white text-[#7B2B8C] border border-[#E4E1EA] flex items-center justify-center text-xs hover:bg-[#7B2B8C] hover:text-white transition-all"><i className="fa-solid fa-pen"></i></button>
                    <button onClick={() => setPersonToDelete(p.name)} title="Delete Person" className="w-7 h-7 rounded-lg bg-white text-[#D6455D] border border-[#E4E1EA] flex items-center justify-center text-xs hover:bg-[#D6455D] hover:text-white transition-all"><i className="fa-solid fa-trash-can"></i></button>
                  </div>
                </div>
              ))}
            </div>
            <SideMenuBranding />
          </div>
        )}

        {menuView === 'manageCategories' && (
          <div className="flex-1 p-5 flex flex-col h-full overflow-y-auto hide-scrollbar bg-white">
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setMenuView('menu')} className="text-xs font-bold text-[#625E70] hover:text-[#1E104B]"><i className="fa-solid fa-arrow-left mr-1.5"></i> {translate("Back")}</button>
              <button onClick={() => openSubView('addCategory')} className="px-3 py-1.5 rounded-full bg-[#078A87] text-white text-[10px] font-black uppercase"><i className="fa-solid fa-plus mr-1"></i> {translate("Add")}</button>
            </div>
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => setCatType('expense')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${catType === 'expense' ? 'bg-[#1E104B] text-white' : 'bg-[#F4F3F8] text-[#625E70]'}`}>{translate("Expense")}</button>
              <button type="button" onClick={() => setCatType('income')} className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-all ${catType === 'income' ? 'bg-[#1E104B] text-white' : 'bg-[#F4F3F8] text-[#625E70]'}`}>{translate("Income")}</button>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto hide-scrollbar">
              {(catType === 'expense' ? categories.expense : categories.income).map((c, idx) => (
                <div key={idx} className="p-2.5 bg-[#F4F3F8] rounded-xl border border-[#E4E1EA] flex justify-between items-center">
                  <span className="text-xs font-bold text-[#1E104B]">{c}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => openSubView('editCategory', c)} className="w-7 h-7 rounded-lg bg-white text-[#7B2B8C] border border-[#E4E1EA] flex items-center justify-center text-xs hover:bg-[#7B2B8C] hover:text-white transition-all"><i className="fa-solid fa-pen"></i></button>
                    <button onClick={() => setCatToDelete({ type: catType, name: c })} className="w-7 h-7 rounded-lg bg-white text-[#D6455D] border border-[#E4E1EA] flex items-center justify-center text-xs hover:bg-[#D6455D] hover:text-white transition-all"><i className="fa-solid fa-trash-can"></i></button>
                  </div>
                </div>
              ))}
            </div>
            <SideMenuBranding />
          </div>
        )}

        {(menuView === 'addPerson' || menuView === 'editPerson' || menuView === 'addCategory' || menuView === 'editCategory' || menuView === 'manageAdmin') && (
          <div className="flex-1 p-6 flex flex-col h-full overflow-y-auto hide-scrollbar bg-white">
            <button onClick={() => setMenuView('menu')} className="text-xs font-bold text-[#625E70] mb-3 active:scale-95 self-start hover:text-[#1E104B]"><i className="fa-solid fa-arrow-left mr-1.5"></i> {translate("Back")}</button>
            <h3 className="text-base font-black text-[#1E104B] mb-1">
              {menuView === 'addPerson' ? translate('Add New Person') : menuView === 'editPerson' ? translate('Edit Person') : menuView === 'addCategory' ? `${translate('Add New')} ${translate(catType === 'expense' ? 'Expense' : 'Income')} ${translate('Category')}` : menuView === 'editCategory' ? translate('Edit Category') : translate('Admin Setup')}
            </h3>
            <p className="text-[10px] font-bold text-[#078A87] uppercase tracking-wider mb-4">
              {menuView === 'addCategory' ? `${translate('Target Ledger')}: ${translate(catType === 'expense' ? 'Expense' : 'Income')}` : menuView === 'addPerson' ? translate('Directory Party Entry') : translate('Configuration Setup')}
            </p>
            {menuView === 'addCategory' && (
              <div className="flex gap-2 mb-4">
                <button type="button" onClick={() => setCatType('expense')} className={`flex-1 py-2 rounded-lg text-xs font-black ${catType === 'expense' ? 'bg-[#1E104B] text-white' : 'bg-[#F4F3F8] text-[#625E70]'}`}>{translate("Expense")}</button>
                <button type="button" onClick={() => setCatType('income')} className={`flex-1 py-2 rounded-lg text-xs font-black ${catType === 'income' ? 'bg-[#1E104B] text-white' : 'bg-[#F4F3F8] text-[#625E70]'}`}>{translate("Income")}</button>
              </div>
            )}
            <form onSubmit={handleFormSubmit} className="space-y-4 pb-12">
              <div className="space-y-4">
                {(menuView === 'addCategory' || menuView === 'editCategory') && (
                  <div>
                    <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Category Name *")}</label>
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

                {(menuView === 'addPerson' || menuView === 'editPerson') && (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-bold text-[#625E70] uppercase">{translate("Name *")}</label>
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
                      <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Phone")}</label>
                      <input type="tel" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Email Id")}</label>
                      <input type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" placeholder={translate("Optional")} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#625E70] uppercase tracking-wider mb-1">{translate("Address / Location")}</label>
                      <input type="text" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" placeholder={translate("City or Village")} />
                    </div>
                  </>
                )}

                {menuView === 'manageAdmin' && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Name *")}</label>
                      <input type="text" required value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" placeholder="e.g. Bharat Rasve" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Contact")}</label>
                      <input type="tel" value={formData.contact || ''} onChange={e => setFormData({ ...formData, contact: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" placeholder="e.g. 9876543210" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Email id")}</label>
                      <input type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" placeholder="e.g. user@example.com" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Statement Header note")}</label>
                      <input type="text" value={formData.headerNote || formData.note || ''} onChange={e => setFormData({ ...formData, headerNote: e.target.value, note: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" placeholder="e.g. Official Accounting Summary" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Statement Footer note")}</label>
                      <input type="text" value={formData.footerNote || ''} onChange={e => setFormData({ ...formData, footerNote: e.target.value })} className="w-full border border-[#E4E1EA] rounded-xl px-3.5 py-2.5 font-bold text-sm bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none" placeholder="e.g. Thank you for your business" />
                    </div>
                  </>
                )}
              </div>
              <div className="pt-4 flex justify-center">
                <button type="submit" disabled={isSubmitting} className="w-2/3 min-w-[160px] bg-[#1E104B] hover:bg-[#2A186B] text-white font-bold py-3.5 rounded-xl shadow-md active:scale-95 transition-all uppercase text-xs flex items-center justify-center gap-2">
                  {isSubmitting ? <i className="fa-solid fa-spinner animate-spin"></i> : <i className="fa-solid fa-check"></i>}
                  <span>{isSubmitting ? translate('Saving...') : translate((menuView === 'addPerson' || menuView === 'addCategory') ? 'Save' : 'Save Changes')}</span>
                </button>
              </div>
              <SideMenuBranding />
            </form>
          </div>
        )}
      </div>

      {personToDelete && (
        <div className="fixed inset-0 z-[60] bg-theme-dark/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!isSubmitting) setPersonToDelete(null); }}>
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-3 ${isSubmitting ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-500'}`}>
              <i className={isSubmitting ? "fa-solid fa-spinner animate-spin" : "fa-solid fa-triangle-exclamation"}></i>
            </div>
            <h3 className="text-sm font-black text-theme-dark uppercase tracking-wide">
              {isSubmitting ? translate('Deleting Person...') : translate('Delete Person?')}
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-5">
              {isSubmitting ? `${translate('Removing')} ${personToDelete} ${translate('and associated records.')}` : <>{translate("Delete")} <strong>{personToDelete}</strong> {translate("and all linked transactions? This action cannot be undone.")}</>}
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setPersonToDelete(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 rounded-xl text-xs uppercase transition-all disabled:opacity-50"
              >
                {translate("Cancel")}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={confirmDeletePerson}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs uppercase shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-70 cursor-wait"
              >
                {isSubmitting && <i className="fa-solid fa-spinner animate-spin text-xs"></i>}
                <span>{isSubmitting ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {catToDelete && (
        <div className="fixed inset-0 z-[60] bg-theme-dark/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setCatToDelete(null)}>
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xl mx-auto mb-3">
              <i className="fa-solid fa-tag"></i>
            </div>
            <h3 className="text-sm font-black text-theme-dark uppercase tracking-wide">{translate("Delete Category?")}</h3>
            <p className="text-xs text-gray-500 mt-1 mb-5">
              Delete category <strong>"{catToDelete.name}"</strong>?
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setCatToDelete(null)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 rounded-xl text-xs uppercase transition-all"
              >
                {translate("Cancel")}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={confirmDeleteCategory}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs uppercase shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                {isSubmitting && <i className="fa-solid fa-spinner animate-spin text-xs"></i>}
                <span>{translate("Delete")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const HomeView = ({ onSelectPerson, onSelectTransaction, onNavigateTab }) => {
  const { filteredTransactions, transactions, persons, loans, setDirectoryFilter } = useContext(AppContext);

  const kpi = useMemo(() => {
    let e = 0, i = 0, dr = 0, cr = 0;
    filteredTransactions.forEach(t => {
      if (t.type === 'EXPENSE') e += Number(t.amount) || 0;
      else if (t.type === 'INCOME') i += Number(t.amount) || 0;
      else if (t.type === 'LENT') dr += Number(t.amount) || 0;
      else if (t.type === 'BORROW') cr += Number(t.amount) || 0;
    });
    return { e, i, dr, cr };
  }, [filteredTransactions]);

  const catData = useMemo(() => {
    const map = {};
    let totalExp = 0;
    filteredTransactions.filter(t => t.type === 'EXPENSE').forEach(t => {
      const key = t.category || '(Uncategorized)';
      map[key] = (map[key] || 0) + (Number(t.amount) || 0);
      totalExp += Number(t.amount) || 0;
    });
    return Object.keys(map).map(k => ({ name: k, val: map[k], pct: totalExp ? (map[k] / totalExp) * 100 : 0 })).sort((a, b) => b.val - a.val);
  }, [filteredTransactions]);

  const allPersonBalances = useMemo(() => {
    return persons.map(p => {
      let dr = 0, cr = 0;
      transactions.filter(t => t.person === p.name).forEach(t => {
        if (t.type === 'LENT') dr += Number(t.amount) || 0;
        if (t.type === 'BORROW') cr += Number(t.amount) || 0;
      });
      return { ...p, totalDr: dr, totalCr: cr, bal: dr - cr };
    });
  }, [persons, transactions]);

  const totalReceivable = allPersonBalances.filter(p => p.bal > 0).reduce((s, p) => s + p.bal, 0);
  const totalPayable = allPersonBalances.filter(p => p.bal < 0).reduce((s, p) => s + Math.abs(p.bal), 0);

  const topPeople = useMemo(() => (
    allPersonBalances.filter(p => p.bal !== 0).sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal)).slice(0, 6)
  ), [allPersonBalances]);

  return (
    <div className="px-4 mt-2 pb-32 space-y-3.5">
      <div className="flex justify-end items-start px-1">
        <PeriodSelector />
      </div>

      <div className="grad-kpi rounded-2xl p-3.5 shadow-md flex justify-between divide-x divide-white/10 mt-0.5">
        <div className="flex-1 text-center px-1">
          <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">{translate("Expense")}</p>
          <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(kpi.e)}</p>
        </div>
        <div className="flex-1 text-center px-1">
          <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">{translate("Income")}</p>
          <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(kpi.i)}</p>
        </div>
        <div className="flex-1 text-center px-1">
          <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">{translate("Given (Dr)")}</p>
          <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(kpi.dr)}</p>
        </div>
        <div className="flex-1 text-center px-1">
          <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">{translate("Received")}</p>
          <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(kpi.cr)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 border border-theme-dark/10 shadow-sm space-y-4">
        <h2 className="text-[10px] font-bold text-theme-dark uppercase tracking-widest">{translate("Expense & Income Overview")}</h2>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#078A87]/10 p-2.5 rounded-xl flex flex-col justify-between border border-[#078A87]/25">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#078A87] uppercase tracking-wider">{translate("Total Inflow")}</span>
              <span className="text-[8px] font-semibold text-[#078A87]/70">{translate("(Inc + Recv)")}</span>
            </div>
            <span className="text-base font-extrabold text-[#078A87] mt-0.5">{formatMoney(kpi.i + kpi.cr)}</span>
          </div>
          <div className="bg-[#D6455D]/10 p-2.5 rounded-xl flex flex-col justify-between border border-[#D6455D]/25">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#D6455D] uppercase tracking-wider">{translate("Total Outflow")}</span>
              <span className="text-[8px] font-semibold text-[#D6455D]/70">{translate("(Exp + Given)")}</span>
            </div>
            <span className="text-base font-extrabold text-[#D6455D] mt-0.5">{formatMoney(kpi.e + kpi.dr)}</span>
          </div>
        </div>

        <div className="pt-2 space-y-2.5">
          <p className="text-[10px] font-bold text-theme-dark/50 uppercase tracking-wider">{translate("Top Spending Categories")}</p>
          {catData.slice(0, 3).map((c, i) => (
            <div key={i}>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-theme-dark">{c.name}</span>
                <span className="text-theme-dark">{formatMoney(c.val)}</span>
              </div>
              <div className="w-full bg-theme-gray rounded-full h-1.5 overflow-hidden">
                <div className="bg-theme-dark h-1.5 rounded-full" style={{ width: `${Math.min(c.pct, 100)}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-theme-dark/10 overflow-hidden shadow-sm">
        <div className="px-3.5 py-3 border-b border-theme-dark/5">
          <h2 className="text-[11px] font-black text-theme-dark uppercase tracking-wider">{translate("Recent Transactions")}</h2>
        </div>
        <TransactionTable transactions={filteredTransactions} maxRows={6} showViewAll={false} onSelectTransaction={onSelectTransaction} embedded={true} />
      </div>

      <div className="bg-white rounded-2xl p-4 border border-[#E4E1EA] shadow-xs space-y-3.5">
        <h2 className="text-[10px] font-bold text-[#625E70] uppercase tracking-widest">{translate("People Overview")}</h2>

        <div className="grid grid-cols-2 gap-3">
          <div
            onClick={() => { setDirectoryFilter('RECEIVABLE'); onNavigateTab && onNavigateTab('people'); }}
            className="bg-[#078A87]/10 p-3 rounded-xl flex flex-col border border-[#078A87]/20 cursor-pointer hover:bg-[#078A87]/15 active:scale-95 transition-all"
            title={translate("Click to view all Credit (Receivable) parties")}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#078A87] uppercase tracking-wider">{translate("Total Receivable")}</span>
              <i className="fa-solid fa-arrow-right text-[10px] text-[#078A87]"></i>
            </div>
            <span className="text-base font-black text-[#078A87] mt-0.5">+{formatMoney(totalReceivable)}</span>
          </div>
          <div
            onClick={() => { setDirectoryFilter('PAYABLE'); onNavigateTab && onNavigateTab('people'); }}
            className="bg-[#D6455D]/10 p-3 rounded-xl flex flex-col border border-[#D6455D]/20 cursor-pointer hover:bg-[#D6455D]/15 active:scale-95 transition-all"
            title={translate("Click to view all Debit (Payable) parties")}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#D6455D] uppercase tracking-wider">{translate("Total Payable")}</span>
              <i className="fa-solid fa-arrow-right text-[10px] text-[#D6455D]"></i>
            </div>
            <span className="text-base font-black text-[#D6455D] mt-0.5">-{formatMoney(totalPayable)}</span>
          </div>
        </div>

        {topPeople.length > 0 && (
          <div className="space-y-1.5">
            {topPeople.map(p => (
              <div key={p.id} onClick={() => onSelectPerson(p)} className="flex justify-between items-center p-2.5 rounded-xl hover:bg-[#F4F3F8] cursor-pointer transition-colors border border-transparent">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-[#7B2B8C]/15 flex items-center justify-center text-xs font-black text-[#7B2B8C]">
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1E104B]">{p.name}</p>
                    <p className="text-[9px] font-bold text-[#8A8596] uppercase tracking-wide mt-0.5">
                      {p.bal > 0 ? 'You will receive' : 'You need to pay'}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-black ${p.bal > 0 ? 'text-[#078A87]' : 'text-[#D6455D]'}`}>
                  {p.bal > 0 ? '+' : '-'}{formatMoney(Math.abs(p.bal))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(() => {
        const activeLoansList = (loans || []).filter(l => {
          const paidCount = (l.schedule || []).filter(s => s.paid).length;
          return l.status !== 'CLOSED' && paidCount < (l.schedule || []).length;
        });

        let homeLoanToPay = 0;
        let homeLoanPaid = 0;
        (loans || []).forEach(l => {
          homeLoanToPay += Number(l.loanAmount) || 0;
          (l.schedule || []).forEach(s => {
            if (s.paid) homeLoanPaid += Number(s.emiAmount) || 0;
          });
        });
        const homeLoanRem = Math.max(0, homeLoanToPay - homeLoanPaid);

        return (
          <div className="bg-white rounded-2xl p-4 border border-[#E4E1EA] shadow-xs space-y-3.5">
            <div className="flex justify-between items-center">
              <h2 className="text-[10px] font-bold text-[#625E70] uppercase tracking-widest">{translate("Active Loans Overview")}</h2>
              <button
                onClick={() => onNavigateTab && onNavigateTab('loans')}
                className="text-[10px] font-black text-[#078A87] uppercase hover:underline"
              >
                View All ({activeLoansList.length})
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#1E104B]/5 p-2.5 rounded-xl flex flex-col justify-between border border-[#1E104B]/15">
                <span className="text-[9px] font-bold text-[#625E70] uppercase tracking-wider truncate">{translate("Total to Pay")}</span>
                <span className="text-xs sm:text-sm font-extrabold text-[#1E104B] mt-1 truncate">{formatMoney(homeLoanToPay)}</span>
              </div>
              <div className="bg-[#078A87]/10 p-2.5 rounded-xl flex flex-col justify-between border border-[#078A87]/25">
                <span className="text-[9px] font-bold text-[#078A87] uppercase tracking-wider truncate">{translate("Paid So Far")}</span>
                <span className="text-xs sm:text-sm font-extrabold text-[#078A87] mt-1 truncate">{formatMoney(homeLoanPaid)}</span>
              </div>
              <div className="bg-[#D6455D]/10 p-2.5 rounded-xl flex flex-col justify-between border border-[#D6455D]/25">
                <span className="text-[9px] font-bold text-[#D6455D] uppercase tracking-wider truncate">{translate("Remaining")}</span>
                <span className="text-xs sm:text-sm font-extrabold text-[#D6455D] mt-1 truncate">{formatMoney(homeLoanRem)}</span>
              </div>
            </div>

            {activeLoansList.length === 0 ? (
              <p className="text-xs text-[#625E70] font-semibold text-center py-2">{translate("No active loans.")}</p>
            ) : (
              <div className="overflow-x-auto hide-scrollbar">
                <table className="w-full table-fixed text-[10px]">
                  <thead className="bg-[#E8E6F0] text-[#1E104B] uppercase font-black border-b border-[#D6D2E0]">
                    <tr>
                      <th className="w-[34%] px-2.5 py-1.5 text-left tracking-tight">{translate("Loan / Person")}</th>
                      <th className="w-[22%] px-2 py-1.5 text-right tracking-tight">{translate("Loan Rs.")}</th>
                      <th className="w-[22%] px-2 py-1.5 text-right tracking-tight">{translate("EMI Rs.")}</th>
                      <th className="w-[22%] px-2 py-1.5 text-right tracking-tight">{translate("EMI Paid")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E1EA]/60 font-semibold text-[#1E104B]">
                    {activeLoansList.slice(0, 4).map(l => {
                      const pCount = (l.schedule || []).filter(s => s.paid).length;
                      const tCount = (l.schedule || []).length;
                      const lIsClosed = l.status === 'CLOSED' || (tCount > 0 && pCount === tCount);
                      return (
                        <tr
                          key={l.id}
                          onClick={() => {
                            if (window.__TRIGGER_LOAN__) {
                              window.__TRIGGER_LOAN__(l.person, l.id);
                            } else {
                              onNavigateTab && onNavigateTab('loans');
                            }
                          }}
                          className="hover:bg-[#F4F3F8] cursor-pointer transition-colors active:bg-gray-100"
                        >
                          <td className="px-2.5 py-3 truncate">
                            <span className="font-extrabold block truncate text-xs text-[#1E104B]">{l.loanName}</span>
                            <span className="block truncate text-[9px] font-bold text-[#625E70]">{l.person}</span>
                          </td>
                          <td className="px-2 py-3 text-right font-black text-[#1E104B]">{formatMoney(l.loanAmount)}</td>
                          <td className="px-2 py-3 text-right font-black text-[#1E104B]">{formatMoney(l.monthlyEmi)}</td>
                          <td className="px-2 py-3 text-right font-black">
                            <span className={lIsClosed ? 'text-gray-400' : 'text-emerald-600'}>{pCount}/{tCount}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
      <AppBottomBranding />
    </div>
  );
};

const PersonsView = ({ onSelectPerson }) => {
  const { persons, transactions, showFeedback, admin, directoryFilter, setDirectoryFilter } = useContext(AppContext);
  const [isSharingPersons, setIsSharingPersons] = useState(false);
  const summarySlipRef = useRef(null);

  const pData = useMemo(() => {
    const raw = persons.map(p => {
      let dr = 0, cr = 0;
      transactions.filter(t => t.person === p.name).forEach(t => {
        if (t.type === 'LENT') dr += t.amount;
        if (t.type === 'BORROW') cr += t.amount;
      });
      return { ...p, totalDr: dr, totalCr: cr, remaining: dr - cr };
    }).sort((a, b) => Math.abs(b.remaining) - Math.abs(a.remaining));

    if (directoryFilter === 'RECEIVABLE') return raw.filter(p => p.remaining > 0);
    if (directoryFilter === 'PAYABLE') return raw.filter(p => p.remaining < 0);
    return raw;
  }, [persons, transactions, directoryFilter]);

  const totalReceivable = pData.filter(p => p.remaining > 0).reduce((sum, p) => sum + p.remaining, 0);
  const totalPayable = pData.filter(p => p.remaining < 0).reduce((sum, p) => sum + Math.abs(p.remaining), 0);
  const netBalance = totalReceivable - totalPayable;

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e) => { touchStartX.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e) => { touchEndX.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current || pData.length === 0) return;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) {
      onSelectPerson(pData[0]);
    }
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  const handleSharePersonsSummary = async () => {
    showFeedback('Generating All Persons Ledger Image...');
    setIsSharingPersons(true);
    try {
      await waitForPaint();

      await shareReceiptToWhatsApp(
        summarySlipRef, 
        `All_Persons_Ledger_${Date.now()}`, 
        `Budget Bharat — All Persons Ledger (${pData.length} parties)`
      );
      showFeedback('Ledger Ready');
    } catch(err) {
      console.error('Directory slip export error:', err);
      showFeedback('Error: ' + (err && err.message ? err.message : 'generating image failed'));
    } finally {
      setIsSharingPersons(false);
    }
  };

  return (
    <div className="px-4 mt-2 space-y-3 pb-32" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div className="flex justify-between items-center">
        <button
          onClick={handleSharePersonsSummary}
          disabled={isSharingPersons}
          title={translate("Share Directory Summary Image")}
          className={`w-9 h-9 rounded-full bg-[#078A87]/15 text-[#078A87] hover:bg-[#078A87] hover:text-white active:bg-[#078A87] active:text-white flex items-center justify-center transition-all border border-[#078A87]/25 shadow-xs ${isSharingPersons ? 'opacity-50 cursor-wait' : ''}`}
        >
          <i className={`fa-solid ${isSharingPersons ? 'fa-spinner animate-spin' : 'fa-share-nodes'} text-xs`}></i>
        </button>

        <div className="flex bg-slate-200/90 p-1 rounded-xl shadow-inner gap-1">
          <button
            type="button"
            onClick={() => setDirectoryFilter('ALL')}
            className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${
              directoryFilter === 'ALL' ? 'bg-white text-[#1E104B] shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {translate("All")}
          </button>
          <button
            type="button"
            onClick={() => setDirectoryFilter('RECEIVABLE')}
            className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${
              directoryFilter === 'RECEIVABLE' ? 'bg-[#078A87] text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {translate("Credit")}
          </button>
          <button
            type="button"
            onClick={() => setDirectoryFilter('PAYABLE')}
            className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all ${
              directoryFilter === 'PAYABLE' ? 'bg-[#D6455D] text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {translate("Debit")}
          </button>
        </div>
      </div>

      <div className="grad-kpi rounded-2xl p-3.5 shadow-md grid grid-cols-3 divide-x divide-white/10 text-center">
        <div className="px-1">
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{translate("RECEIVABLE")}</p>
          <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(totalReceivable)}</p>
        </div>
        <div className="px-1">
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{translate("PAYABLE")}</p>
          <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(totalPayable)}</p>
        </div>
        <div className="px-1">
          <p className="text-[10px] font-bold text-white/70 uppercase tracking-wider">{translate("BALANCE")}</p>
          <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(Math.abs(netBalance))}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#E4E1EA] shadow-xs overflow-hidden">
        <div className="w-full">
          <table className="w-full table-fixed text-[10px]">
            <thead className="bg-[#E8E6F0] text-[#1E104B] uppercase font-black border-b border-[#D6D2E0]">
              <tr>
                <th className="w-[34%] px-2.5 py-2 text-left tracking-tight">{translate("Person Name")}</th>
                <th className="w-[22%] px-1.5 py-2 text-right tracking-tight">{translate("Given")}</th>
                <th className="w-[22%] px-1.5 py-1.5 text-right tracking-tight">{translate("Recv")}</th>
                <th className="w-[22%] px-2 py-2 text-right tracking-tight">{translate("Balance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E1EA]/60 font-semibold text-[#1E104B]">
              {pData.map((p) => {
                const isRec = p.remaining > 0;
                const isPay = p.remaining < 0;
                const balColor = isRec ? '#078A87' : isPay ? '#D6455D' : '#625E70';
                return (
                  <tr key={p.id} onClick={() => onSelectPerson(p)} className="hover:bg-[#F4F3F8] cursor-pointer transition-colors active:bg-gray-100">
                    <td className="px-2.5 py-3.5 truncate">
                      <span className="font-extrabold block truncate text-xs text-[#1E104B]">{p.name}</span>
                      {p.phone && <span className="block text-[8px] font-bold text-[#8A8596] truncate mt-0.5">{p.phone}</span>}
                    </td>
                    <td className="px-1.5 py-3.5 text-right font-bold text-[#7B2B8C] text-[11px] truncate">{formatMoney(p.totalDr)}</td>
                    <td className="px-1.5 py-3.5 text-right font-bold text-[#078A87] text-[11px] truncate">{formatMoney(p.totalCr)}</td>
                    <td className="px-2 py-3.5 text-right font-black text-[11px] truncate" style={{ color: balColor }}>
                      {isRec ? '+' : isPay ? '-' : ''}{formatMoney(Math.abs(p.remaining))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <SafePortal>
        <div className="canvas-hide">
          <div ref={summarySlipRef} id="persons-summary-slip" className="bg-white px-5 py-4 font-sans box-border inline-block text-slate-900 relative overflow-hidden" style={{ width: '640px', fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
            <div 
              className="absolute inset-0 pointer-events-none overflow-hidden flex flex-col justify-around items-center" 
              style={{ zIndex: 0 }}
            >
              {Array.from({ length: Math.max(1, Math.ceil(((pData && pData.length) || 1) / 16)) }).map((_, wIdx) => (
                <div key={wIdx} className="w-full flex items-center justify-center" style={{ minHeight: '820px' }}>
                  <img
                    src={Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED}
                    alt=""
                    className="w-72 h-72 object-contain select-none"
                    style={{ opacity: 0.05 }}
                  />
                </div>
              ))}
            </div>

            <div className="border-b-2 border-[#1E104B] pb-2 mb-2.5 flex justify-between items-end relative z-10">
              <div className="text-left">
                <h1 className="text-[10px] font-black text-[#7B2B8C] uppercase tracking-widest mb-0.5">
                  {admin && admin.headerNote ? admin.headerNote : 'Budget Bharat'}
                </h1>
                <h2 className="text-xl font-black text-[#1E104B] tracking-tight leading-tight">
                  All Persons Ledger
                </h2>
              </div>
              <div className="text-right text-[10px] font-bold text-gray-500 leading-tight">
                <p>Total Accounts: {pData.length}</p>
                <p className="mt-0.5">Date: {formatDisplayDate(`${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`)}</p>
              </div>
            </div>

            <div className="flex justify-between bg-[#F4F3F8] rounded-xl py-2 px-2 text-center mb-2">
              <div className="flex-1 px-1">
                <p className="text-[8px] font-bold text-[#625E70] uppercase tracking-widest mb-0.5">{translate("RECEIVABLE")}</p>
                <p className="text-base font-black text-[#078A87]">+{formatMoney(totalReceivable)}</p>
              </div>
              <div className="flex-1 px-1">
                <p className="text-[8px] font-bold text-[#625E70] uppercase tracking-widest mb-0.5">{translate("PAYABLE")}</p>
                <p className="text-base font-black text-[#D6455D]">-{formatMoney(totalPayable)}</p>
              </div>
              <div className="flex-1 px-1">
                <p className="text-[8px] font-bold text-[#625E70] uppercase tracking-widest mb-0.5">{translate("BALANCE")}</p>
                <p className="text-base font-black text-[#1E104B]">{netBalance >= 0 ? '+' : '-'}{formatMoney(Math.abs(netBalance))}</p>
              </div>
            </div>

            <table className="w-full text-left text-[12px] mb-2 border-collapse table-fixed leading-tight">
              <colgroup>
                <col style={{ width: '31%' }} />
                <col style={{ width: '23%' }} />
                <col style={{ width: '23%' }} />
                <col style={{ width: '23%' }} />
              </colgroup>
              <thead className="bg-[#1E104B] text-white text-[11px]">
                <tr>
                  <th className="py-2 px-2 font-bold uppercase border border-[#E4E1EA]">{translate("Person Name")}</th>
                  <th className="py-2 px-2 font-bold uppercase text-right border border-[#E4E1EA]">{translate("Given")}</th>
                  <th className="py-2 px-2 font-bold uppercase text-right border border-[#E4E1EA]">{translate("Recv")}</th>
                  <th className="py-2 px-2 font-bold uppercase text-right border border-[#E4E1EA]">{translate("Balance")}</th>
                </tr>
              </thead>
              <tbody className="text-[#1E104B] bg-transparent font-medium">
                {pData.map(p => {
                  const isRec = p.remaining > 0;
                  const isPay = p.remaining < 0;
                  const balColor = isRec ? '#078A87' : isPay ? '#D6455D' : '#625E70';
                  return (
                    <tr key={p.id}>
                      <td className="py-3 px-2 font-bold border border-[#E4E1EA] truncate align-middle text-xs">{p.name}</td>
                      <td className="py-3 px-2 text-right font-bold border border-[#E4E1EA] text-[#7B2B8C] align-middle text-xs">{formatMoney(p.totalDr)}</td>
                      <td className="py-3 px-2 text-right font-bold border border-[#E4E1EA] text-[#078A87] align-middle text-xs">{formatMoney(p.totalCr)}</td>
                      <td className="py-3 px-2 text-right font-black border border-[#E4E1EA] align-middle text-xs" style={{ color: balColor }}>
                        {isRec ? '+' : isPay ? '-' : ''}{formatMoney(Math.abs(p.remaining))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="pt-2 border-t border-gray-300 flex justify-between items-center relative z-10">
              <div className="flex flex-col justify-center text-left leading-tight">
                <span className="text-[9px] font-black text-[#1E104B] uppercase tracking-wider mb-0.5">{translate("STATEMENT BY -")}</span>
                <span className="font-extrabold text-[11px] text-[#1E104B]">{translate("Budget Bharat-Personal finance App")}</span>
                <span className="text-[10px] font-medium text-[#625E70] mt-0.5">{translate("Developed by - Bharat Rasve")}</span>
                <span className="text-[10px] font-medium text-[#625E70]">{translate("Mo.No: 7218838122")}</span>
              </div>

              <div className="flex items-center justify-center">
                <img
                  src={Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED}
                  alt="Logo"
                  className="w-[104px] h-[32px] object-contain select-none flex-none"
                />
              </div>

              <div className="text-right leading-tight">
                {admin && admin.footerNote && (
                  <p className="text-[10px] font-semibold text-gray-700 italic mb-1">
                    "{admin.footerNote}"
                  </p>
                )}
                <span className="text-[11px] font-extrabold text-[#1E104B] block">
                  {admin && admin.name ? admin.name : 'Bharat Rasve'}
                </span>
                {admin && admin.contact && (
                  <span className="text-[10px] font-bold text-gray-600 block mt-1">
                    Mo.No: {admin.contact}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </SafePortal>
      <AppBottomBranding />
    </div>
  );
};

const LedgerView = ({ person, onBack, onSelectPerson, allPersons, onSelectTransaction, onOpenAddRecord }) => {
  const { transactions, loans, showFeedback, admin, deletePerson, uploadBackupToCloud, syncStatus, loadError } = useContext(AppContext);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [isSharingStatement, setIsSharingStatement] = useState(false);
  const [showLedgerShareOptions, setShowLedgerShareOptions] = useState(false);
  const [showDeletePersonConfirm, setShowDeletePersonConfirm] = useState(false);
  const [isDeletingPerson, setIsDeletingPerson] = useState(false);
  const [isLoanDropdownOpen, setIsLoanDropdownOpen] = useState(false);
  const loanDropdownRef = useRef(null);
  const statementSlipRef = useRef(null);

  const personActiveLoans = useMemo(() => {
    if (!person || !person.name) return [];
    const normTarget = String(person.name).trim().toLowerCase();

    return (loans || []).filter(l => {
      if (!l.person) return false;
      if (String(l.person).trim().toLowerCase() !== normTarget) return false;
      if (String(l.status || '').toUpperCase() === 'CLOSED') return false;
      const sched = l.schedule || [];
      if (sched.length === 0) return true;
      const paidCount = sched.filter(s => s.paid === true || String(s.paid).toLowerCase() === 'true').length;
      return paidCount < sched.length;
    });
  }, [loans, person]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (loanDropdownRef.current && !loanDropdownRef.current.contains(e.target)) {
        setIsLoanDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const rawTxs = useMemo(() => transactions.filter(t => t.person === person.name), [transactions, person.name]);
  
  const txs = useMemo(() => {
    if (!ledgerSearch.trim()) return rawTxs;
    const q = ledgerSearch.toLowerCase().trim();
    return rawTxs.filter(t => 
      (t.note && t.note.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q)) ||
      (t.ref && t.ref.toLowerCase().includes(q)) ||
      (t.date && String(t.date).toLowerCase().includes(q)) ||
      (t.amount && String(t.amount).includes(q))
    );
  }, [rawTxs, ledgerSearch]);

  const currentIndex = allPersons.findIndex(p => p.name === person.name);

  const goToPrev = () => {
    if (currentIndex > 0) onSelectPerson(allPersons[currentIndex - 1]);
    else onSelectPerson(allPersons[allPersons.length - 1]);
  };

  const goToNext = () => {
    if (currentIndex < allPersons.length - 1) onSelectPerson(allPersons[currentIndex + 1]);
    else onSelectPerson(allPersons[0]);
  };

  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const handleTouchStart = (e) => { touchStartX.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e) => { touchEndX.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 50) goToNext();
    else if (diff < -50) goToPrev();
    touchStartX.current = 0;
    touchEndX.current = 0;
  };

  const targetDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    const selectedLanguage = getSelectedLanguage();
    const parts = new Intl.DateTimeFormat(LANGUAGE_LOCALES[selectedLanguage] || 'en-IN', { day: 'numeric', month: 'short', year: '2-digit' }).formatToParts(d);
    const part = type => parts.find(item => item.type === type)?.value || '';
    return `${part('day')}-${part('month')}-${part('year')}`;
  }, [getSelectedLanguage()]);

  const handleShareImage = async () => {
    const actionWord = person.remaining > 0 ? 'you will pay' : person.remaining < 0 ? 'you will receive' : 'is settled at';
    const captionText = `${translate('Dear')} ${person.name}, ${translate(actionWord)} ${formatMoney(Math.abs(person.remaining))} ${translate('on or before date')} ${targetDateStr}.`;

    if (txs.length > 10) {
      showFeedback('Loading fonts & generating PDF...');
      setIsSharingStatement(true);
      try {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
        await waitForPaint();

        const element = statementSlipRef.current || document.getElementById('whatsapp-share-slip');
        if (!element) throw new Error('Statement DOM node not found');

        const fileName = `${person.name.replace(/\s+/g, '_')}_${translate('Overall Statement')}.pdf`;
        const opt = {
          margin: [8, 8, 10, 8],
          filename: fileName,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            logging: false,
            foreignObjectRendering: true,
            letterRendering: false,
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        };

        const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            files: [pdfFile],
            title: fileName,
            text: captionText
          });
          showFeedback('PDF shared successfully');
        } else {
          html2pdf().set(opt).from(element).save();
          showFeedback('PDF downloaded successfully');
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error('PDF export error:', err);
        showFeedback('Error: ' + (err && err.message ? err.message : 'Generating PDF failed'));
      } finally {
        setIsSharingStatement(false);
      }
      return;
    }

    showFeedback('Opening share dialog...');
    setIsSharingStatement(true);
    try {
      await shareReceiptToWhatsApp(
        statementSlipRef,
        `${person.name.replace(/\s+/g, '_')}_Overall_Statement`,
        captionText
      );
      showFeedback('Statement shared');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error('Ledger statement render error:', err);
      showFeedback('Error: ' + (err && err.message ? err.message : 'rendering image failed'));
    } finally {
      setIsSharingStatement(false);
    }
  };

  const handleShareLedgerReminder = async () => {
    setShowLedgerShareOptions(false);
    if (!person || !person.remaining) {
      showFeedback('This person has no outstanding balance to remind about.');
      return;
    }
    const balanceDirection = person.remaining > 0 ? 'receivable' : 'payable';
    const actionWord = translate(balanceDirection === 'receivable' ? 'You will pay' : 'You will receive').toLowerCase();
    const captionText = `${translate('Dear')} ${person.name}, ${actionWord} ${formatMoney(Math.abs(person.remaining))} ${translate('on or before')} ${formatDisplayDate(targetDateStr)}.`;
    setIsSharingStatement(true);
    showFeedback('Generating balance reminder...');
    try {
      const file = await createPaymentReminderImage({ personName: person.name, amount: Math.abs(person.remaining), dueDate: targetDateStr, admin, reminderType: 'ledger', balanceDirection });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: translate('Budget Bharat Balance Reminder'), text: captionText });
        showFeedback('Reminder ready to share');
      } else {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a'); link.href = url; link.download = file.name;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        showFeedback('Reminder image saved; share it in WhatsApp');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error('Ledger balance reminder error:', err);
      showFeedback('Reminder failed: ' + (err && err.message ? err.message : 'image generation failed'));
    } finally {
      setIsSharingStatement(false);
    }
  };

  const handleWhatsAppShare = () => {
    const actionWord = person.remaining > 0 ? 'you will pay' : person.remaining < 0 ? 'you will receive' : 'is settled at';
    const textMsg = `${translate('Dear')} ${person.name}, ${translate(actionWord)} ${formatMoney(Math.abs(person.remaining))} ${translate('on or before date')} ${targetDateStr}.`;
    let phone = String(person.phone || '').replace(/\D/g, '');
    if (phone.startsWith('0')) phone = phone.replace(/^0+/, '');
    if (phone.length === 10) phone = '91' + phone;

    const waUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(textMsg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <React.Fragment>
      {showLedgerShareOptions && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowLedgerShareOptions(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-3 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-1"><button type="button" onClick={() => setShowLedgerShareOptions(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-600" aria-label={translate("Close")}>×</button></div>
            <button type="button" onClick={() => { setShowLedgerShareOptions(false); handleShareImage(); }} disabled={isSharingStatement} className="w-full flex items-center gap-3 text-left p-3 rounded-xl border border-slate-200 mb-2 hover:bg-slate-50 disabled:opacity-50"><span className="w-9 h-9 flex-none rounded-lg bg-[#078A87]/10 text-[#078A87] flex items-center justify-center"><i className="fa-solid fa-file-lines"></i></span><span className="font-bold text-sm text-[#1E104B]">{translate("Share transaction statement")}</span></button>
            <button type="button" onClick={handleShareLedgerReminder} disabled={isSharingStatement || !person.remaining} className="w-full flex items-center gap-3 text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50"><span className="w-9 h-9 flex-none rounded-lg bg-[#7B2B8C]/10 text-[#7B2B8C] flex items-center justify-center"><i className="fa-solid fa-bell"></i></span><span className="font-bold text-sm text-[#1E104B]">{translate("Share balance reminder")}</span></button>
          </div>
        </div>
      )}
      <div className="flex-none grad-dark px-3.5 py-3 text-white flex items-center justify-between shadow-md z-30">
        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
          <button onClick={onBack} title={translate("Exit to Directory")} className="w-8 h-8 flex-none flex items-center justify-center hover:bg-white/10 rounded-full transition-colors active:scale-95">
            <i className="fa-solid fa-arrow-left text-base"></i>
          </button>
          <div className="flex flex-col min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold truncate leading-tight">{person.name}</h1>
            <div ref={loanDropdownRef} className="relative self-start mt-1.5 z-40">
              <div
                onClick={() => {
                  if (personActiveLoans.length > 0) {
                    setIsLoanDropdownOpen(prev => !prev);
                  }
                }}
                className={`flex items-center rounded-lg border text-[10px] font-black transition-all ${
                  personActiveLoans.length > 0
                    ? 'bg-white/20 border-white/30 text-white hover:bg-white/30 cursor-pointer active:scale-95 shadow-xs'
                    : 'bg-white/5 border-white/10 text-white/50 cursor-default'
                }`}
                style={{ height: '22px' }}
              >
                <span className="px-2.5 py-0.5 leading-none tracking-wide whitespace-nowrap">
                  {personActiveLoans.length > 0 ? `${formatTableNum(personActiveLoans.length)} ${translate('Loans')}` : translate('No Loans')}
                </span>
                {personActiveLoans.length > 0 && (
                  <span className="flex items-center justify-center border-l border-white/25 px-2 h-full bg-white/10 rounded-r-lg">
                    <i className={`fa-solid ${isLoanDropdownOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-[8px]`}></i>
                  </span>
                )}
              </div>

              {isLoanDropdownOpen && personActiveLoans.length > 0 && (
                <div className="absolute top-full left-0 mt-1.5 w-52 bg-[#241457] border border-[#7B2B8C]/40 rounded-xl shadow-2xl py-1 z-50 animate-slide-up">
                  <div className="px-3 py-1.5 text-[9px] font-bold text-white/60 uppercase tracking-wider border-b border-white/10">
                    {translate('Active Loans')} ({formatTableNum(personActiveLoans.length)})
                  </div>
                  <div className="max-h-48 overflow-y-auto hide-scrollbar divide-y divide-white/5">
                    {personActiveLoans.map((l) => {
                      const pCount = (l.schedule || []).filter(s => s.paid).length;
                      const tCount = (l.schedule || []).length;
                      return (
                        <div
                          key={l.id}
                          onClick={() => {
                            setIsLoanDropdownOpen(false);
                            onBack();
                            if (window.__TRIGGER_LOAN__) {
                              window.__TRIGGER_LOAN__(person.name, l.id);
                            }
                          }}
                          className="px-3 py-2 hover:bg-[#7B2B8C] cursor-pointer transition-colors text-left"
                        >
                          <p className="text-xs font-bold text-white truncate">{l.loanName}</p>
                          <div className="flex justify-between items-center text-[10px] text-white/70 mt-0.5 font-semibold">
                            <span>{formatMoney(l.loanAmount)}</span>
                            <span className="text-emerald-400 font-bold">{pCount}/{tCount} Paid</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-none">
          {allPersons.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-full border border-white/10 text-[11px] font-black">
              <button onClick={goToPrev} title={translate("Previous Person")} className="w-5 h-5 flex items-center justify-center bg-white/15 hover:bg-white/25 active:bg-[#1E104B]/60 rounded-full active:scale-90 transition-all shadow-xs">
                <i className="fa-solid fa-chevron-left text-[9px]"></i>
              </button>
              <span className="opacity-75 select-none">({currentIndex + 1}/{allPersons.length})</span>
              <button onClick={goToNext} title={translate("Next Person")} className="w-5 h-5 flex items-center justify-center bg-white/15 hover:bg-white/25 active:bg-[#1E104B]/60 rounded-full active:scale-90 transition-all shadow-xs">
                <i className="fa-solid fa-chevron-right text-[9px]"></i>
              </button>
            </div>
          )}

          <button
            onClick={uploadBackupToCloud}
            disabled={syncStatus === 'syncing'}
            className={`sync-header-btn flex-none ${syncStatus === 'syncing' ? 'is-syncing' : ''} ${loadError !== '' ? 'is-error' : ''}`}
            title={syncStatus === 'syncing' ? 'Uploading backup...' : syncStatus === 'restoring' ? 'Restoring backup...' : syncStatus === 'success' ? 'Backup synced' : loadError !== '' ? 'Error. Tap to retry.' : 'Upload backup to Google Drive'}
          >
            <i className={`fa-solid ${syncStatus === 'syncing' ? 'fa-cloud-arrow-up animate-pulse' : syncStatus === 'restoring' ? 'fa-cloud-arrow-down animate-pulse' : syncStatus === 'success' ? 'fa-cloud-check' : 'fa-cloud-arrow-up'} text-sm`}></i>
          </button>
        </div>
      </div>

      <div
        className="app-content bg-theme-gray pb-32 select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2.5 py-1 px-1">
            <div className="flex items-center gap-2 flex-none">
              <button
                type="button"
                onClick={() => {
                  window.location.href = `tel:0${String(person.phone || '').replace(/\D/g, '').slice(-10)}`;
                }}
                title="Call"
                className="w-9 h-9 rounded-full bg-[#078A87]/15 text-[#078A87] hover:bg-[#078A87] hover:text-white active:bg-[#078A87] active:text-white flex items-center justify-center transition-all border border-[#078A87]/25 shadow-xs"
              >
                <i className="fa-solid fa-phone text-xs"></i>
              </button>
              <button
                onClick={() => setShowLedgerShareOptions(true)}
                title={translate("Share Statement or Reminder")}
                className="w-9 h-9 rounded-full bg-[#078A87]/15 text-[#078A87] hover:bg-[#078A87] hover:text-white active:bg-[#078A87] active:text-white flex items-center justify-center transition-all border border-[#078A87]/25 shadow-xs"
              >
                <i className="fa-solid fa-share-nodes text-xs"></i>
              </button>
              <button
                onClick={handleWhatsAppShare}
                title={translate("Open WhatsApp chat")}
                className="w-9 h-9 rounded-full bg-[#25D366] flex items-center justify-center text-white hover:brightness-105 active:scale-95 transition-all shadow-xs"
              >
                <i className="fa-brands fa-whatsapp text-base"></i>
              </button>
              {(() => {
                const personLoan = (loans || []).find(l => l.person === person.name);
                return (
                  <button
                    onClick={() => {
                      onBack();
                      if (window.__TRIGGER_LOAN__) {
                        window.__TRIGGER_LOAN__(person.name, personLoan ? personLoan.id : null);
                      }
                    }}
                    title={personLoan ? `View ${personLoan.loanName}` : "Create New Loan for this Person"}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all border shadow-xs active:scale-95 ${
                      personLoan
                        ? 'bg-[#1E104B]/10 text-[#1E104B] border-[#1E104B]/20 hover:bg-[#1E104B] hover:text-white'
                        : 'bg-[#078A87]/15 text-[#078A87] border-[#078A87]/30 hover:bg-[#078A87] hover:text-white'
                    }`}
                  >
                    {personLoan ? (
                      <i className="fa-solid fa-hand-holding-dollar text-xs"></i>
                    ) : (
                      <i className="fa-solid fa-hand-holding-medical text-xs"></i>
                    )}
                  </button>
                );
              })()}
              <button
                onClick={() => setShowDeletePersonConfirm(true)}
                title={translate("Delete Person & All Records")}
                className="w-9 h-9 rounded-full bg-[#D6455D]/15 text-[#D6455D] hover:bg-[#D6455D] hover:text-white active:bg-[#D6455D] active:text-white flex items-center justify-center transition-all border border-[#D6455D]/25 shadow-xs"
              >
                <i className="fa-solid fa-trash-can text-xs"></i>
              </button>
            </div>

            <div className="flex-1 relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>
              <input
                type="text"
                value={ledgerSearch}
                onChange={e => setLedgerSearch(e.target.value)}
                placeholder={translate("Search entry...")}
                className="w-full bg-white border border-[#E4E1EA] rounded-full py-1.5 pl-8 pr-7 text-xs text-[#1E104B] placeholder-slate-400 focus:outline-none focus:border-[#078A87] transition-all font-semibold shadow-xs"
              />
              {ledgerSearch && (
                <button
                  type="button"
                  onClick={() => setLedgerSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </div>
          </div>

          <div className="grad-kpi py-3.5 px-3 rounded-2xl shadow-md grid grid-cols-3 divide-x divide-white/10 text-center">
            <div className="px-1">
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-wide">{translate("GIVEN (DR)")}</p>
              <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(person.totalDr)}</p>
            </div>
            <div className="px-1">
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-wide">{translate("RECEIVED (CR)")}</p>
              <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(person.totalCr)}</p>
            </div>
            <div className="px-1">
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-wide">{translate("BALANCE")}</p>
              <p className="text-sm font-black text-white mt-1 truncate">
                {person.remaining > 0 ? '+' : person.remaining < 0 ? '-' : ''}{formatMoney(Math.abs(person.remaining))}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xs border border-[#E4E1EA] overflow-hidden">
            <div className="overflow-x-auto hide-scrollbar">
              <table className="w-full text-left text-[10px] whitespace-nowrap">
                <thead className="bg-[#E2DEEA] text-[#1E104B] font-black uppercase border-b border-[#CDC8DA] tracking-wider">
                  <tr>
                    <th className="px-3.5 py-1.5">{translate("Date")}</th>
                    <th className="px-3.5 py-1.5">{translate("Description")}</th>
                    <th className="px-3.5 py-1.5 text-right">{translate("Amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E1EA]/60 font-medium text-[#1E104B]">
                  {txs.map(t => (
                    <tr
                      key={t.id || t.entryId}
                      data-entry-id={t.id || t.entryId}
                      onClick={() => onSelectTransaction && onSelectTransaction(t)}
                      className="hover:bg-[#F4F3F8] transition-colors cursor-pointer active:bg-gray-100"
                    >
                      <td className="px-3.5 py-3 font-semibold text-[#625E70]">{formatDisplayDate(t.date)}</td>
                      <td className="px-3.5 py-3 font-bold max-w-[140px] truncate text-[#1E104B]">
                        {t.note || t.category}
                        {(t.ref || t.promiseDate) && (
                          <span className="block text-[8px] font-semibold text-[#8A8596] mt-0.5">
                            {t.ref} {t.ref && t.promiseDate ? '•' : ''} {t.promiseDate && `Promise: ${formatDisplayDate(t.promiseDate)}`}
                          </span>
                        )}
                      </td>
                      <td className={`px-3.5 py-3 text-right font-black text-xs ${t.type === 'LENT' ? 'text-[#7B2B8C]' : 'text-[#078A87]'}`}>
                        {t.type === 'LENT' ? '-' : '+'}{formatTableNum(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {showDeletePersonConfirm && (
            <div className="fixed inset-0 z-50 bg-theme-dark/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!isDeletingPerson) setShowDeletePersonConfirm(false); }}>
              <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-3 ${isDeletingPerson ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-500'}`}>
                  <i className={isDeletingPerson ? "fa-solid fa-spinner animate-spin" : "fa-solid fa-triangle-exclamation"}></i>
                </div>
                <h3 className="text-sm font-black text-theme-dark uppercase tracking-wide">
                  {isDeletingPerson ? translate('Deleting Person...') : translate('Delete Person?')}
                </h3>
                <p className="text-xs text-gray-500 mt-1 mb-5">
                  {isDeletingPerson ? `${translate('Removing')} ${person.name} ${translate('and all associated entries from sheet.')}` : <>{translate("Delete")} <strong>{person.name}</strong> {translate("and all associated transactions? This cannot be undone.")}</>}
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    disabled={isDeletingPerson}
                    onClick={() => setShowDeletePersonConfirm(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 rounded-xl text-xs uppercase transition-all disabled:opacity-50"
                  >
                    {translate("Cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingPerson}
                    onClick={async () => {
                      setIsDeletingPerson(true);
                      try {
                        await deletePerson(person.name);
                        setShowDeletePersonConfirm(false);
                        onBack();
                      } catch (err) {
                        console.error("Person deletion failed:", err);
                      } finally {
                        setIsDeletingPerson(false);
                      }
                    }}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs uppercase shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-70 cursor-wait"
                  >
                    {isDeletingPerson && <i className="fa-solid fa-spinner animate-spin text-xs"></i>}
                    <span>{isDeletingPerson ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <SafePortal>
            <div className="canvas-hide">
              <style>{`
                #whatsapp-share-slip tr { page-break-inside: avoid !important; break-inside: avoid !important; }
                #whatsapp-share-slip thead { display: table-header-group !important; }
              `}</style>
              <div 
                ref={statementSlipRef} 
                id="whatsapp-share-slip" 
                className="bg-white px-4 pt-2 pb-3 box-border inline-block text-slate-900 relative overflow-hidden" 
                style={{ width: '720px', fontFamily: "'Noto Sans Devanagari', sans-serif", letterSpacing: 'normal' }}
              >
                <div 
                  className="absolute inset-0 pointer-events-none overflow-hidden flex flex-col justify-around items-center" 
                  style={{ zIndex: 0 }}
                >
                  {Array.from({ length: Math.max(1, Math.ceil(((txs && txs.length) || 1) / 10)) }).map((_, wIdx) => (
                    <div key={wIdx} className="w-full flex items-center justify-center" style={{ minHeight: '820px' }}>
                      <img
                        src={Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED}
                        alt=""
                        className="w-80 h-80 object-contain select-none"
                        style={{ opacity: 0.05 }}
                      />
                    </div>
                  ))}
                </div>

                <div className="border-b-2 border-[#1E104B] pb-2 mb-2 relative z-10">
                  <div className="flex justify-between items-start">
                    <div className="text-left text-theme-dark leading-tight pr-2">
                      <h1 className="text-[10px] font-black text-[#7B2B8C] uppercase tracking-widest mb-0.5">
                        {admin && admin.headerNote ? admin.headerNote : 'Budget Bharat'}
                      </h1>
                      <h2 className="text-xl font-black text-[#1E104B] tracking-tight leading-tight">
                        A/C STATEMENT
                      </h2>
                      <p className="text-[9px] text-gray-500 font-bold mt-1">
                        Date: {formatDisplayDate(`${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`)}
                      </p>
                    </div>
                    <div className="text-right flex flex-col justify-start leading-tight">
                      <h2 className="text-2xl font-black text-[#1E104B] tracking-tight leading-none mb-1">{person.name}</h2>
                      <p className="text-xs font-bold text-gray-700">Mo.No: {person.phone ? person.phone : 'N/A'}</p>
                      <p className="text-[10px] font-semibold text-gray-500 capitalize mt-0.5">{person.address ? person.address : 'Maharashtra'}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between py-1.5 px-2 text-center mb-2 divide-x divide-slate-200">
                  <div className="flex-1 px-1">
                    <p className="text-[9px] font-bold text-[#625E70] uppercase tracking-wider mb-0.5">{translate("GIVEN (DR)")}</p>
                    <p className="text-xl font-black text-[#7B2B8C] leading-none">{formatMoney(person.totalDr)}</p>
                  </div>
                  <div className="flex-1 px-1">
                    <p className="text-[9px] font-bold text-[#625E70] uppercase tracking-wider mb-0.5">{translate("RECEIVED (CR)")}</p>
                    <p className="text-xl font-black text-[#078A87] leading-none">{formatMoney(person.totalCr)}</p>
                  </div>
                  <div className="flex-1 px-1">
                    <p className="text-[9px] font-bold text-[#625E70] uppercase tracking-wider mb-0.5">
                      {person.remaining > 0 ? 'BAL (RECEIVABLE)' : person.remaining < 0 ? 'BAL (PAYABLE)' : 'BALANCE'}
                    </p>
                    <p className={`text-xl font-black leading-none ${person.remaining > 0 ? 'text-[#078A87]' : person.remaining < 0 ? 'text-[#D6455D]' : 'text-[#1E104B]'}`}>
                      {person.remaining >= 0 ? '+' : '-'}{formatMoney(Math.abs(person.remaining))}
                    </p>
                  </div>
                </div>

                <table className="w-full text-left text-[11px] mb-3 border-collapse table-fixed">
                  <colgroup>
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '29%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '13%' }} />
                  </colgroup>
                  <thead className="bg-[#1E104B] text-white">
                    <tr>
                      <th className="py-1.5 px-2 font-bold uppercase border border-[#E4E1EA]">{translate("Date")}</th>
                      <th className="py-1.5 px-2 font-bold uppercase border border-[#E4E1EA]">{translate("Description")}</th>
                      <th className="py-1.5 px-2 font-bold uppercase border border-[#E4E1EA]">{translate("Ref A/C")}</th>
                      <th className="py-1.5 px-1.5 font-bold uppercase text-right border border-[#E4E1EA]">{translate("Amount")}</th>
                      <th className="py-1.5 px-1 font-bold uppercase text-center border border-[#E4E1EA]">{translate("Promise")}</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#1E104B] bg-transparent">
                    {txs.map(t => (
                      <tr key={t.id || t.entryId}>
                        <td className="py-1.5 px-2 font-semibold text-[#625E70] whitespace-nowrap border border-[#E4E1EA] align-middle text-[11px]">{formatDisplayDate(t.date)}</td>
                        <td className="py-1.5 px-2 font-normal whitespace-normal break-words border border-[#E4E1EA] align-middle leading-snug text-[13px] text-[#1E104B]">{t.note || t.category}</td>
                        <td className="py-1.5 px-2 font-semibold text-[#625E70] whitespace-normal break-words border border-[#E4E1EA] align-middle text-[11px]">{t.ref || '-'}</td>
                        <td className={`py-1.5 px-1.5 text-right font-black whitespace-nowrap border border-[#E4E1EA] align-middle text-[15px] ${t.type === 'LENT' ? 'text-[#7B2B8C]' : 'text-[#078A87]'}`}>
                          {t.type === 'LENT' ? '-' : '+'}{formatMoney(t.amount)}
                        </td>
                        <td className="py-1.5 px-1 text-[#B7791F] font-bold whitespace-nowrap text-center border border-[#E4E1EA] align-middle text-[10px]">{t.promiseDate ? formatDisplayDate(t.promiseDate) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="pt-2 border-t border-gray-300 flex justify-between items-center relative z-10">
                  <div className="flex flex-col justify-center text-left leading-tight">
                    <span className="text-[9px] font-black text-[#1E104B] uppercase tracking-wider mb-0.5">{translate("STATEMENT BY -")}</span>
                    <span className="font-extrabold text-[11px] text-[#1E104B]">{translate("Budget Bharat-Personal finance App")}</span>
                    <span className="text-[10px] font-medium text-[#625E70] mt-0.5">{translate("Developed by - Bharat Rasve")}</span>
                    <span className="text-[10px] font-medium text-[#625E70]">{translate("Mo.No: 7218838122")}</span>
                  </div>

                  <div className="flex items-center justify-center">
                    <img
                      src={Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED}
                      alt="Logo"
                      className="w-[104px] h-[104px] object-contain select-none"
                    />
                  </div>

                  <div className="text-right leading-tight">
                    {admin && admin.footerNote && (
                      <p className="text-[10px] font-semibold text-gray-700 italic mb-1">
                        "{admin.footerNote}"
                      </p>
                    )}
                    <span className="text-[11px] font-extrabold text-[#1E104B] block">
                      {admin && admin.name ? admin.name : 'Bharat Rasve'}
                    </span>
                    {admin && admin.contact && (
                      <span className="text-[10px] font-bold text-gray-600 block mt-1">
                        Mo.No: {admin.contact}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </SafePortal>
          <AppBottomBranding />
        </div>
      </div>
    </React.Fragment>
  );
};// --- START OF src/main.jsx (PART 4) ---

const LoanManagerView = ({ onSelectPerson, initialPersonFilter = null, initialLoanId = null, onClearLoanFocus, viewModeState, isCreatingLoanState }) => {
  const { loans, persons, admin, saveLoanAction, deleteLoanAction, addTransaction, showFeedback, uploadBackupToCloud, syncStatus, loadError } = useContext(AppContext);

  const [viewMode, setViewMode] = viewModeState || useState(initialLoanId ? 'detail' : 'master');
  const [selectedLoanId, setSelectedLoanId] = useState(initialLoanId || (loans && loans.length > 0 ? loans[0].id : null));
  const [isCreatingLoan, setIsCreatingLoan] = isCreatingLoanState || useState(!initialLoanId && initialPersonFilter ? true : false);

  useEffect(() => {
    if (loans && loans.length > 0 && !loans.some(l => l.id === selectedLoanId)) {
      setSelectedLoanId(loans[0].id);
    }
  }, [loans, selectedLoanId]);

  const [newPerson, setNewPerson] = useState(initialPersonFilter || '');
  const [newLoanName, setNewLoanName] = useState('');
  const [newLoanTaken, setNewLoanTaken] = useState('');
  const [newLoanToPay, setNewLoanToPay] = useState('');
  const [newMonthlyEmi, setNewMonthlyEmi] = useState('');
  const [newTenure, setNewTenure] = useState('12');
  const [newFirstDate, setNewFirstDate] = useState(toInputDate_(new Date()));

  const [createStatus, setCreateStatus] = useState('idle');
  const [payStatus, setPayStatus] = useState('idle');
  const [actionError, setActionError] = useState('');

  const [paymentModal, setPaymentModal] = useState({ open: false, row: null, who: 'ME', paymentId: '' });
  const loanSlipRef = useRef(null);
  const [isExportingSlip, setIsExportingSlip] = useState(false);
  const [showEmiShareOptions, setShowEmiShareOptions] = useState(false);
  const [isLoanDropdownOpen, setIsLoanDropdownOpen] = useState(false);
  const loanDropdownRef = useRef(null);

  const currentLoan = useMemo(() => {
    return (loans || []).find(l => l.id === selectedLoanId) || ((loans && loans.length > 0) ? loans[0] : null);
  }, [loans, selectedLoanId]);

  const activeBorrowerName = useMemo(() => {
    if (currentLoan && currentLoan.person) return String(currentLoan.person).trim();
    if (initialPersonFilter) return String(initialPersonFilter).trim();
    return '';
  }, [currentLoan, initialPersonFilter]);

  const borrowerActiveLoans = useMemo(() => {
    if (!activeBorrowerName) return [];
    const normTarget = activeBorrowerName.replace(/\s+/g, ' ').toLowerCase();

    return (loans || []).filter(l => {
      if (!l.person) return false;
      const normPerson = String(l.person).trim().replace(/\s+/g, ' ').toLowerCase();
      if (normPerson !== normTarget) return false;
      if (String(l.status || '').toUpperCase() === 'CLOSED') return false;
      const sched = l.schedule || [];
      if (sched.length === 0) return true;
      const paidCount = sched.filter(s => s.paid === true || String(s.paid).toLowerCase() === 'true').length;
      return paidCount < sched.length;
    });
  }, [loans, activeBorrowerName]);

  const borrowerPersonObj = useMemo(() => {
    if (!activeBorrowerName) return null;
    const norm = activeBorrowerName.replace(/\s+/g, ' ').toLowerCase();
    return (persons || []).find(p => String(p.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === norm) || null;
  }, [persons, activeBorrowerName]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (loanDropdownRef.current && !loanDropdownRef.current.contains(e.target)) {
        setIsLoanDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (initialLoanId) {
      setSelectedLoanId(initialLoanId);
      setViewMode('detail');
      setIsCreatingLoan(false);
    } else if (initialPersonFilter) {
      setNewPerson(initialPersonFilter);
      setIsCreatingLoan(true);
      setViewMode('detail');
    }
  }, [initialLoanId, initialPersonFilter]);

  const [foreclosureModalOpen, setForeclosureModalOpen] = useState(false);
  const [selectedClosureEmiNo, setSelectedClosureEmiNo] = useState(1);
  const [closureAmountVal, setClosureAmountVal] = useState('');
  const [foreclosingStatus, setForeclosingStatus] = useState('idle');

  const [showDeleteLoanConfirm, setShowDeleteLoanConfirm] = useState(false);
  const [isDeletingLoan, setIsDeletingLoan] = useState(false);

  const currentLoanIndex = useMemo(() => {
    return loans.findIndex(l => l.id === selectedLoanId);
  }, [loans, selectedLoanId]);

  const goToPrevLoan = () => {
    if (loans.length <= 1) return;
    const prevIdx = currentLoanIndex > 0 ? currentLoanIndex - 1 : loans.length - 1;
    setSelectedLoanId(loans[prevIdx].id);
  };

  const goToNextLoan = () => {
    if (loans.length <= 1) return;
    const nextIdx = currentLoanIndex < loans.length - 1 ? currentLoanIndex + 1 : 0;
    setSelectedLoanId(loans[nextIdx].id);
  };

  const computeNextDate = (baseStr, monthsToAdd) => {
    const d = parseDate(baseStr);
    if (isNaN(d.getTime())) return '-';
    const target = new Date(d.getFullYear(), d.getMonth() + monthsToAdd, d.getDate());
    return formatDisplayDate(target);
  };

  const masterSummary = useMemo(() => {
    let totalLoanToPay = 0;
    let totalPaidSoFar = 0;

    loans.forEach(loan => {
      totalLoanToPay += Number(loan.loanAmount) || 0;
      (loan.schedule || []).forEach(s => {
        if (s.paid) totalPaidSoFar += Number(s.emiAmount) || 0;
      });
    });

    const totalRemaining = Math.max(0, totalLoanToPay - totalPaidSoFar);
    return { totalLoanToPay, totalPaidSoFar, totalRemaining };
  }, [loans]);

  const handleCreateLoan = async (e) => {
    e.preventDefault();
    const loanTaken = parseFloat(newLoanTaken) || 0;
    const loanToPay = parseFloat(newLoanToPay) || 0;
    const emi = parseFloat(newMonthlyEmi) || 0;
    const tenure = parseInt(newTenure, 10) || 1;

    if (!loanToPay || !emi || !newPerson) {
      alert('Please enter Loan to Pay, Monthly EMI, and Borrower.');
      return;
    }

    setCreateStatus('loading');
    setActionError('');

    try {
      const standardTotal = emi * tenure;
      const extraChargesDiff = loanToPay > standardTotal ? Math.round((loanToPay - standardTotal) * 100) / 100 : 0;

      let runningBal = loanToPay;
      const schedule = [];
      const baseDate = newFirstDate.split('-').reverse().join('/');

      for (let i = 1; i <= tenure; i++) {
        let thisEmiAmt = emi;
        if (i === tenure && extraChargesDiff > 0) {
          thisEmiAmt = Math.round((emi + extraChargesDiff) * 100) / 100;
        }
        runningBal = Math.max(0, runningBal - thisEmiAmt);
        schedule.push({
          emiNo: i,
          date: computeNextDate(baseDate, i - 1),
          emiAmount: thisEmiAmt,
          outstandingBal: Math.round(runningBal * 100) / 100,
          paid: false,
          whoPaid: '',
          paymentId: ''
        });
      }

      const cleanLoan = (newLoanName || 'Loan')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1, 6).toLowerCase())
        .join('_');

      const cleanPerson = (newPerson || 'User')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1, 3).toLowerCase())
        .join('_');

      const random4 = Math.floor(1000 + Math.random() * 9000);
      const customLoanId = `LN_${cleanLoan}_${cleanPerson}_${random4}`;

      const payload = {
        id: customLoanId,
        person: newPerson,
        loanName: newLoanName || 'Loan / EMI',
        principalAmount: loanTaken || loanToPay,
        loanAmount: loanToPay,
        monthlyEmi: emi,
        tenureMonths: tenure,
        principalPayment: 0,
        firstEmiDate: baseDate,
        status: 'ACTIVE',
        schedule: schedule
      };

      await saveLoanAction(payload);
      setCreateStatus('success');
      setNewLoanName('');
      setNewLoanTaken('');
      setNewLoanToPay('');
      setNewMonthlyEmi('');
      setNewTenure('12');
      setNewFirstDate(toInputDate_(new Date()));
      setTimeout(() => {
        setIsCreatingLoan(false);
        setCreateStatus('idle');
        setSelectedLoanId(payload.id);
        setViewMode('detail');
      }, 600);
    } catch (err) {
      setCreateStatus('error');
      setActionError(err && err.message ? err.message : 'Failed to create loan');
    }
  };

  const handleConfirmPayment = async () => {
    if (!paymentModal.row || !currentLoan || payStatus === 'loading') return;
    setPayStatus('loading');
    setActionError('');

    const targetNo = paymentModal.row.emiNo;
    const emiAmt = paymentModal.row.emiAmount;

    try {
      const updatedSchedule = currentLoan.schedule.map(item => {
        if (item.emiNo === targetNo) {
          return {
            ...item,
            paid: true,
            whoPaid: paymentModal.who,
            paymentId: paymentModal.paymentId || (paymentModal.who === 'ME' ? 'Paid by Me' : 'Paid by Borrower'),
            paidDate: formatDisplayDate(new Date())
          };
        }
        return item;
      });

      if (paymentModal.who === 'ME') {
        const now = new Date();
        const pad = (n) => ('0' + n).slice(-2);
        const strictDdMmYyyy = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

        const emiRowDate = parseDate(paymentModal.row.date);
        const monthName = !isNaN(emiRowDate.getTime()) && emiRowDate.getTime() !== 0
          ? MONTHS_SHORT[emiRowDate.getMonth()]
          : MONTHS_SHORT[now.getMonth()];

        await addTransaction({
          type: 'LENT',
          amount: emiAmt,
          person: currentLoan.person,
          category: 'EMI',
          date: strictDdMmYyyy,
          note: `${currentLoan.loanName} for (${monthName}) EMI #${targetNo} Paid`,
          ref: paymentModal.paymentId || 'Auto-Debit'
        });
      }

      const updatedLoan = {
        ...currentLoan,
        schedule: updatedSchedule,
        status: updatedSchedule.every(s => s.paid) ? 'CLOSED' : currentLoan.status
      };

      await saveLoanAction(updatedLoan);
      setPayStatus('success');
      setTimeout(() => {
        setPaymentModal({ open: false, row: null, who: 'ME', paymentId: '' });
        setPayStatus('idle');
      }, 600);
    } catch (err) {
      setPayStatus('error');
      setActionError(err && err.message ? err.message : 'Failed to save payment');
    }
  };

  const handleToggleCheckbox = (row) => {
    if (row.paid) {
      const updatedSchedule = currentLoan.schedule.map(item => {
        if (item.emiNo === row.emiNo) {
          return { ...item, paid: false, whoPaid: '', paymentId: '', paidDate: '' };
        }
        return item;
      });
      saveLoanAction({ ...currentLoan, schedule: updatedSchedule });
    } else {
      setActionError('');
      setPayStatus('idle');
      setPaymentModal({
        open: true,
        row: row,
        who: 'ME',
        paymentId: ''
      });
    }
  };

  const handleSendWhatsAppReminder = () => {
    if (!currentLoan) return;
    const nextPending = (currentLoan.schedule || []).find(s => !s.paid && String(s.paid).toLowerCase() !== 'true');
    if (!nextPending) { showFeedback('All EMIs for this loan are cleared!'); return; }
    const borrower = borrowerPersonObj || (persons || []).find(p => String(p.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === String(currentLoan.person || '').trim().replace(/\s+/g, ' ').toLowerCase());
    let phone = String(borrower && borrower.phone || '').replace(/\D/g, '');
    if (phone.startsWith('0')) phone = phone.replace(/^0+/, '');
    if (phone.length === 10) phone = '91' + phone;
    if (!phone || !/^91[6-9]\d{9}$/.test(phone)) {
      showFeedback(borrower && borrower.phone ? 'Please check this person’s saved phone number (use a valid Indian mobile number).' : 'No phone number saved for this person. Add a phone number in Person Ledger first.');
      return;
    }
    const textMsg = `${translate('Hello')} ${currentLoan.person}, ${translate('your')} ${currentLoan.loanName} ${translate('EMI')} #${nextPending.emiNo} ${translate('with amount')} ${formatMoney(nextPending.emiAmount)} ${translate('is due on')} ${formatDisplayDate(nextPending.date)}. ${translate('Please pay')}.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(textMsg)}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareEmiReminder = async () => {
    setShowEmiShareOptions(false);
    if (!currentLoan) return;
    const nextPending = (currentLoan.schedule || []).find(s => !s.paid && String(s.paid).toLowerCase() !== 'true');
    if (!nextPending) { showFeedback('All EMIs for this loan are cleared!'); return; }
    const textMsg = `${translate('Hello')} ${currentLoan.person}, ${translate('your')} ${currentLoan.loanName} ${translate('EMI')} #${nextPending.emiNo} ${translate('with amount')} ${formatMoney(nextPending.emiAmount)} ${translate('is due on')} ${formatDisplayDate(nextPending.date)}. ${translate('Please pay')}.`;
    try {
      const file = await createPaymentReminderImage({ personName: currentLoan.person, amount: nextPending.emiAmount, dueDate: nextPending.date, loanName: currentLoan.loanName, emiNo: nextPending.emiNo, admin });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: translate('Budget Bharat Payment Reminder'), text: textMsg });
        showFeedback('Reminder ready to share');
      } else {
        const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = file.name;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        showFeedback('Reminder image saved; share it in WhatsApp');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') { showFeedback('Reminder share canceled'); return; }
      console.error('Payment reminder image error:', err);
      showFeedback('Reminder failed: ' + (err && err.message ? err.message : 'image generation failed'));
    }
  };

  const handleShareLoanSchedule = async () => {
    if (!currentLoan) return;
    setIsExportingSlip(true);
    showFeedback('Generating EMI Table...');
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await waitForPaint();

      const element = loanSlipRef.current;
      if (!element) throw new Error('Slip DOM node not found');

      const safePerson = String(currentLoan.person || 'User').replace(/\s+/g, '_');
      const safeLoan = String(currentLoan.loanName || 'Loan').replace(/\s+/g, '_');
      const fileName = `${safePerson}_${safeLoan}_${translate('EMI Table')}.pdf`;

      if (currentLoan.schedule.length > 12) {
        const opt = {
          margin: [8, 8, 10, 8],
          filename: fileName,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({ files: [pdfFile], title: `${currentLoan.person} — ${currentLoan.loanName} EMI Table` });
        } else {
          html2pdf().set(opt).from(element).save();
        }
      } else {
        await shareReceiptToWhatsApp(
          loanSlipRef,
          `${safePerson}_${safeLoan}_EMI_Table`,
          `Budget Bharat — ${currentLoan.loanName} EMI Table for ${currentLoan.person}`
        );
      }
      showFeedback('EMI Table shared');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      showFeedback('Export failed: ' + err.message);
    } finally {
      setIsExportingSlip(false);
    }
  };

  const loanTakenVal = currentLoan ? Number(currentLoan.principalAmount || currentLoan.loanAmount) || 0 : 0;
  const loanToPayVal = currentLoan ? Number(currentLoan.loanAmount) || 0 : 0;
  const loanInterestVal = Math.max(0, loanToPayVal - loanTakenVal);
  const paidEmisList = currentLoan ? (currentLoan.schedule || []).filter(s => s.paid) : [];
  const paymentMadeVal = paidEmisList.reduce((acc, curr) => acc + (Number(curr.emiAmount) || 0), 0);
  const remainingBalanceVal = Math.max(0, loanToPayVal - paymentMadeVal);

  const [isSharingMasterLoans, setIsSharingMasterLoans] = useState(false);
  const masterLoansSlipRef = useRef(null);

  const handleShareMasterLoans = async () => {
    if (!loans || loans.length === 0) {
      showFeedback('No loans to export');
      return;
    }
    showFeedback('Generating Active Loans Statement...');
    setIsSharingMasterLoans(true);
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await waitForPaint();

      const element = masterLoansSlipRef.current || document.getElementById('loans-master-summary-slip');
      if (!element) throw new Error('Loans Summary DOM node not found');

      if (loans.length > 12) {
        const opt = {
          margin: [8, 8, 10, 8],
          filename: `Active_Loans_Statement_${Date.now()}.pdf`,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
        const pdfFile = new File([pdfBlob], `Active_Loans_Statement_${Date.now()}.pdf`, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({ files: [pdfFile], title: 'Active Loans Statement' });
        } else {
          html2pdf().set(opt).from(element).save();
        }
      } else {
        await shareReceiptToWhatsApp(
          masterLoansSlipRef,
          `Active_Loans_Statement_${Date.now()}`,
          `Budget Bharat — Active Loans Statement (${loans.length} loans)`
        );
      }
      showFeedback('Statement shared');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error('Loans statement export error:', err);
      showFeedback('Error: ' + (err && err.message ? err.message : 'generating export failed'));
    } finally {
      setIsSharingMasterLoans(false);
    }
  };

  if (viewMode === 'master' && !isCreatingLoan) {
    return (
      <div className="px-4 mt-2 pb-32 space-y-3.5 animate-slide-up">
        <div className="flex justify-between items-center px-1">
          <button
            onClick={handleShareMasterLoans}
            disabled={isSharingMasterLoans}
            title={translate("Share Loans Summary Image")}
            className={`w-9 h-9 rounded-full bg-[#078A87]/15 text-[#078A87] hover:bg-[#078A87] hover:text-white active:bg-[#078A87] active:text-white flex items-center justify-center transition-all border border-[#078A87]/25 shadow-xs ${isSharingMasterLoans ? 'opacity-50 cursor-wait' : ''}`}
          >
            <i className={`fa-solid ${isSharingMasterLoans ? 'fa-spinner animate-spin' : 'fa-share-nodes'} text-xs`}></i>
          </button>

          <button
            onClick={() => {
              setNewPerson('');
              setNewLoanName('');
              setNewLoanTaken('');
              setNewLoanToPay('');
              setNewMonthlyEmi('');
              setNewTenure('12');
              setIsCreatingLoan(true);
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[#078A87] text-white text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
          >
            <i className="fa-solid fa-plus text-xs"></i>
            <span>{translate("New Loan")}</span>
          </button>
        </div>

        <div className="grad-kpi rounded-2xl p-4 shadow-md grid grid-cols-3 divide-x divide-white/10 text-center text-white">
          <div className="px-1">
            <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">{translate("Total to Pay")}</p>
            <p className="text-sm font-black text-white mt-1 truncate">{formatMoney(masterSummary.totalLoanToPay)}</p>
          </div>
          <div className="px-1">
            <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">{translate("Paid So Far")}</p>
            <p className="text-sm font-black text-emerald-400 mt-1 truncate">{formatMoney(masterSummary.totalPaidSoFar)}</p>
          </div>
          <div className="px-1">
            <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider">{translate("Remaining")}</p>
            <p className="text-sm font-black text-[#07C0BE] mt-1 truncate">{formatMoney(masterSummary.totalRemaining)}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E4E1EA] shadow-xs overflow-hidden">
          {loans.length === 0 ? (
            <div className="text-center py-12 px-4">
              <i className="fa-solid fa-hand-holding-dollar text-3xl text-gray-300 mb-2"></i>
              <p className="text-xs font-bold text-gray-500">{translate("No active loans found. Create your first loan above.")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto hide-scrollbar">
              <table className="w-full table-fixed text-[10px]">
                <thead className="bg-[#E8E6F0] text-[#1E104B] uppercase font-black border-b border-[#D6D2E0]">
                  <tr>
                    <th className="w-[34%] px-3 py-2 text-left tracking-tight">{translate("Loan / Person")}</th>
                    <th className="w-[22%] px-2 py-2 text-right tracking-tight">{translate("Loan Rs.")}</th>
                    <th className="w-[22%] px-2 py-2 text-right tracking-tight">{translate("EMI Rs.")}</th>
                    <th className="w-[22%] px-2 py-2 text-right tracking-tight">{translate("EMI Paid")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E1EA]/60 font-semibold text-[#1E104B]">
                  {loans.map(loan => {
                    const paidCount = (loan.schedule || []).filter(s => s.paid).length;
                    const totalCount = (loan.schedule || []).length;
                    const isClosed = loan.status === 'CLOSED' || (totalCount > 0 && paidCount === totalCount);

                    return (
                      <tr
                        key={loan.id}
                        onClick={() => {
                          setSelectedLoanId(loan.id);
                          setViewMode('detail');
                          setIsCreatingLoan(false);
                        }}
                        className="hover:bg-[#F4F3F8] cursor-pointer transition-colors active:bg-gray-100"
                      >
                        <td className="px-3 py-3.5 truncate">
                          <span className="font-extrabold block truncate text-xs text-[#1E104B]">{loan.loanName}</span>
                          <span className="block truncate text-[10px] font-bold text-[#625E70]">{loan.person}</span>
                        </td>
                        <td className="px-2 py-3.5 text-right font-black text-[#1E104B] text-xs">
                          {formatMoney(loan.loanAmount)}
                        </td>
                        <td className="px-2 py-3.5 text-right font-black text-[#1E104B] text-xs">
                          {formatMoney(loan.monthlyEmi)}
                        </td>
                        <td className="px-2 py-3.5 text-right font-black text-[11px]">
                          <span className={isClosed ? 'text-gray-400' : 'text-emerald-600'}>
                            {paidCount}/{totalCount}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <SafePortal>
          <div className="canvas-hide">
            <div
              ref={masterLoansSlipRef}
              id="loans-master-summary-slip"
              className="bg-white px-5 py-4 font-sans box-border inline-block text-slate-900 relative overflow-hidden"
              style={{ width: '640px', fontFamily: "'Noto Sans Devanagari', sans-serif" }}
            >
              <div 
                className="absolute inset-0 pointer-events-none overflow-hidden flex flex-col justify-around items-center" 
                style={{ zIndex: 0 }}
              >
                {Array.from({ length: Math.max(1, Math.ceil(((loans && loans.length) || 1) / 14)) }).map((_, wIdx) => (
                  <div key={wIdx} className="w-full flex items-center justify-center" style={{ minHeight: '820px' }}>
                    <img
                      src={Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED}
                      alt=""
                      className="w-72 h-72 object-contain select-none"
                      style={{ opacity: 0.05 }}
                    />
                  </div>
                ))}
              </div>

              <div className="border-b-2 border-[#1E104B] pb-2 mb-2 flex justify-between items-end relative z-10">
                <div className="text-left">
                  <h1 className="text-[10px] font-black text-[#7B2B8C] uppercase tracking-widest mb-0.5">
                    {admin && admin.headerNote ? admin.headerNote : 'Budget Bharat'}
                  </h1>
                  <h2 className="text-xl font-black text-[#1E104B] tracking-tight leading-tight">{translate("Active Loans Statement")}</h2>
                </div>
                <div className="text-right text-[10px] font-bold text-gray-500 leading-tight">
                  <p>Total Loans: {loans.length}</p>
                  <p className="mt-0.5">Date: {formatDisplayDate(`${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`)}</p>
                </div>
              </div>

              <div className="flex justify-between bg-[#F4F3F8] rounded-xl py-2 px-2 text-center mb-2.5">
                <div className="flex-1 px-1">
                  <p className="text-[8px] font-bold text-[#625E70] uppercase tracking-widest mb-0.5">{translate("TOTAL TO PAY")}</p>
                  <p className="text-base font-black text-[#1E104B]">{formatMoney(masterSummary.totalLoanToPay)}</p>
                </div>
                <div className="flex-1 px-1 border-x border-[#E4E1EA]">
                  <p className="text-[8px] font-bold text-[#625E70] uppercase tracking-widest mb-0.5">{translate("PAID SO FAR")}</p>
                  <p className="text-base font-black text-[#078A87]">{formatMoney(masterSummary.totalPaidSoFar)}</p>
                </div>
                <div className="flex-1 px-1">
                  <p className="text-[8px] font-bold text-[#625E70] uppercase tracking-widest mb-0.5">{translate("REMAINING")}</p>
                  <p className="text-base font-black text-[#D6455D]">{formatMoney(masterSummary.totalRemaining)}</p>
                </div>
              </div>

              <table className="w-full text-left text-[11px] mb-2 border-collapse table-fixed leading-tight">
                <colgroup>
                  <col style={{ width: '34%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '22%' }} />
                </colgroup>
                <thead className="bg-[#1E104B] text-white text-[10px]">
                  <tr>
                    <th className="py-2 px-2 font-bold uppercase border border-[#E4E1EA]">{translate("Loan / Person")}</th>
                    <th className="py-2 px-2 font-bold uppercase text-right border border-[#E4E1EA]">{translate("Loan Rs.")}</th>
                    <th className="py-2 px-2 font-bold uppercase text-right border border-[#E4E1EA]">{translate("EMI Rs.")}</th>
                    <th className="py-2 px-2 font-bold uppercase text-right border border-[#E4E1EA]">{translate("EMI Paid")}</th>
                  </tr>
                </thead>
                <tbody className="text-[#1E104B] bg-transparent font-medium">
                {loans.map((loan) => {
                  const paidCount = (loan.schedule || []).filter(s => s.paid).length;
                  const totalCount = (loan.schedule || []).length;
                  const isClosed = loan.status === 'CLOSED' || (totalCount > 0 && paidCount === totalCount);
                  return (
                    <tr key={loan.id}>
                      <td className="py-2 px-2 border border-[#E4E1EA] truncate align-middle">
                        <span className="font-bold block truncate text-xs text-[#1E104B]">{loan.loanName}</span>
                        <span className="text-[9px] text-gray-500 font-bold block truncate">{loan.person}</span>
                      </td>
                      <td className="py-2 px-2 text-right font-black border border-[#E4E1EA] align-middle text-xs">{formatMoney(loan.loanAmount)}</td>
                      <td className="py-2 px-2 text-right font-bold border border-[#E4E1EA] align-middle text-xs">{formatMoney(loan.monthlyEmi)}</td>
                      <td className="py-2 px-2 text-right font-black border border-[#E4E1EA] align-middle text-xs">
                        <span className={isClosed ? 'text-gray-400' : 'text-emerald-600'}>
                          {paidCount}/{totalCount}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="pt-2 border-t border-gray-300 flex justify-between items-center relative z-10">
              <div className="flex flex-col justify-center text-left leading-tight">
                <span className="text-[9px] font-black text-[#1E104B] uppercase tracking-wider mb-0.5">{translate("STATEMENT BY -")}</span>
                <span className="font-extrabold text-[11px] text-[#1E104B]">{translate("Budget Bharat-Personal finance App")}</span>
                <span className="text-[10px] font-medium text-[#625E70] mt-0.5">{translate("Developed by - Bharat Rasve")}</span>
                <span className="text-[10px] font-medium text-[#625E70]">{translate("Mo.No: 7218838122")}</span>
              </div>

              <div className="flex items-center justify-center">
                <img
                  src={Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED}
                  alt="Logo"
                  className="w-[104px] h-[32px] object-contain select-none flex-none"
                />
              </div>

              <div className="text-right leading-tight">
                {admin && admin.footerNote && (
                  <p className="text-[10px] font-semibold text-gray-700 italic mb-1">
                    "{admin.footerNote}"
                  </p>
                )}
                <span className="text-[11px] font-extrabold text-[#1E104B] block">
                  {admin && admin.name ? admin.name : 'Bharat Rasve'}
                </span>
                {admin && admin.contact && (
                  <span className="text-[10px] font-bold text-gray-600 block mt-1">
                    Mo.No: {admin.contact}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </SafePortal>
      <AppBottomBranding />
    </div>
  );
}

return (
  <div className="flex flex-col h-full select-none">
    <div className="flex-none grad-dark px-3.5 py-3 text-white flex items-center justify-between shadow-md z-30">
      <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
        <button
          onClick={() => {
            if (onClearLoanFocus) onClearLoanFocus();
            setViewMode('master');
            setIsCreatingLoan(false);
          }}
          title={translate("Exit to Loans Directory")}
          className="w-8 h-8 flex-none flex items-center justify-center hover:bg-white/10 rounded-full transition-colors active:scale-95"
        >
          <i className="fa-solid fa-arrow-left text-base"></i>
        </button>

        <div className="text-left min-w-0 flex-1">
          <h1 className="text-sm sm:text-base font-extrabold truncate leading-tight">
            {currentLoan ? currentLoan.loanName : 'Loan Details'}
          </h1>
          {currentLoan && !isCreatingLoan && (
            <div className="flex items-center gap-2.5 mt-0.5 min-w-0">
              <button
                onClick={() => {
                  if (borrowerPersonObj) {
                    onSelectPerson(borrowerPersonObj);
                  } else {
                    const fallbackObj = (persons || []).find(p => String(p.name).trim().toLowerCase() === String(currentLoan.person).trim().toLowerCase());
                    if (fallbackObj) onSelectPerson(fallbackObj);
                  }
                }}
                className="text-xs text-white font-extrabold hover:underline truncate leading-none cursor-pointer active:scale-95 transition-transform"
                title={`Open ${currentLoan.person}'s Ledger`}
              >
                {currentLoan.person}
              </button>

              <div ref={loanDropdownRef} className="relative flex-none z-40">
                <div
                  onClick={() => {
                    if (borrowerActiveLoans.length > 0) {
                      setIsLoanDropdownOpen(prev => !prev);
                    }
                  }}
                  className={`flex items-center rounded-lg border text-[10px] font-black transition-all ${
                    borrowerActiveLoans.length > 0
                      ? 'bg-white/20 border-white/30 text-white hover:bg-white/30 cursor-pointer active:scale-95 shadow-xs'
                      : 'bg-white/5 border-white/10 text-white/50 cursor-default'
                  }`}
                  style={{ height: '22px' }}
                >
                  <span className="px-2.5 py-0.5 leading-none tracking-wide whitespace-nowrap">
                    {borrowerActiveLoans.length > 0 ? `${formatTableNum(borrowerActiveLoans.length)} ${translate('Loans')}` : translate('No Loans')}
                  </span>
                  {borrowerActiveLoans.length > 0 && (
                    <span className="flex items-center justify-center border-l border-white/25 px-2 h-full bg-white/10 rounded-r-lg">
                      <i className={`fa-solid ${isLoanDropdownOpen ? 'fa-chevron-up' : 'fa-chevron-down'} text-[8px]`}></i>
                    </span>
                  )}
                </div>

                {isLoanDropdownOpen && borrowerActiveLoans.length > 0 && (
                  <div className="absolute top-full left-0 mt-1.5 w-56 bg-[#241457] border border-[#7B2B8C]/40 rounded-xl shadow-2xl py-1 z-50 animate-slide-up">
                    <div className="px-3 py-1.5 text-[9px] font-bold text-white/60 uppercase tracking-wider border-b border-white/10">
                      {translate('Active Loans')} ({formatTableNum(borrowerActiveLoans.length)})
                    </div>
                    <div className="max-h-48 overflow-y-auto hide-scrollbar divide-y divide-white/5">
                      {borrowerActiveLoans.map((l) => {
                        const sched = l.schedule || [];
                        const pCount = sched.filter(s => s.paid === true || String(s.paid).toLowerCase() === 'true').length;
                        const tCount = sched.length;
                        const isCurrent = l.id === currentLoan.id;
                        return (
                          <div
                            key={l.id}
                            onClick={() => {
                              setSelectedLoanId(l.id);
                              setIsLoanDropdownOpen(false);
                            }}
                            className={`px-3 py-2 cursor-pointer transition-colors text-left ${
                              isCurrent ? 'bg-[#7B2B8C]/70' : 'hover:bg-[#7B2B8C]'
                            }`}
                          >
                            <p className="text-xs font-bold text-white truncate flex items-center justify-between">
                              <span>{l.loanName}</span>
                              {isCurrent && <i className="fa-solid fa-check text-[9px] text-emerald-400"></i>}
                            </p>
                            <div className="flex justify-between items-center text-[10px] text-white/70 mt-0.5 font-semibold">
                              <span>{formatMoney(l.loanAmount)}</span>
                              <span className="text-emerald-400 font-bold">{pCount}/{tCount} Paid</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-none">
        {!isCreatingLoan && loans.length > 0 && (
          <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-full border border-white/10 text-[11px] font-black">
            <button
              onClick={goToPrevLoan}
              title={translate("Previous Loan")}
              className="w-5 h-5 flex items-center justify-center bg-white/15 hover:bg-white/25 active:bg-[#1E104B]/60 rounded-full active:scale-90 transition-all shadow-xs"
            >
              <i className="fa-solid fa-chevron-left text-[9px]"></i>
            </button>
            <span className="opacity-75 select-none">({currentLoanIndex + 1}/{loans.length})</span>
            <button
              onClick={goToNextLoan}
              title={translate("Next Loan")}
              className="w-5 h-5 flex items-center justify-center bg-white/15 hover:bg-white/25 active:bg-[#1E104B]/60 rounded-full active:scale-90 transition-all shadow-xs"
            >
              <i className="fa-solid fa-chevron-right text-[9px]"></i>
            </button>
          </div>
        )}

        <button
          onClick={uploadBackupToCloud}
          disabled={syncStatus === 'syncing'}
          className={`sync-header-btn flex-none ${syncStatus === 'syncing' ? 'is-syncing' : ''} ${loadError !== '' ? 'is-error' : ''}`}
          title={syncStatus === 'syncing' ? 'Uploading backup...' : syncStatus === 'restoring' ? 'Restoring backup...' : syncStatus === 'success' ? 'Backup synced' : loadError !== '' ? 'Error. Tap to retry.' : 'Upload backup to Google Drive'}
        >
          <i className={`fa-solid ${syncStatus === 'syncing' ? 'fa-cloud-arrow-up animate-pulse' : syncStatus === 'restoring' ? 'fa-cloud-arrow-down animate-pulse' : syncStatus === 'success' ? 'fa-cloud-check' : 'fa-cloud-arrow-up'} text-sm`}></i>
        </button>
      </div>
    </div>

    <div className="app-content px-4 mt-2 pb-32 space-y-3">
      {showEmiShareOptions && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowEmiShareOptions(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-3 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-1"><button type="button" onClick={() => setShowEmiShareOptions(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-600" aria-label={translate("Close")}>×</button></div>
            <button type="button" onClick={() => { setShowEmiShareOptions(false); handleShareLoanSchedule(); }} disabled={isExportingSlip} className="w-full flex items-center gap-3 text-left p-3 rounded-xl border border-slate-200 mb-2 hover:bg-slate-50 disabled:opacity-50"><span className="w-9 h-9 flex-none rounded-lg bg-[#078A87]/10 text-[#078A87] flex items-center justify-center"><i className="fa-solid fa-file-lines"></i></span><span className="font-bold text-sm text-[#1E104B]">{translate("Share EMI table")}</span></button>
            <button type="button" onClick={handleShareEmiReminder} disabled={isExportingSlip} className="w-full flex items-center gap-3 text-left p-3 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50"><span className="w-9 h-9 flex-none rounded-lg bg-[#7B2B8C]/10 text-[#7B2B8C] flex items-center justify-center"><i className="fa-solid fa-bell"></i></span><span className="font-bold text-sm text-[#1E104B]">{translate("Share EMI reminder")}</span></button>
          </div>
        </div>
      )}
      {!isCreatingLoan && currentLoan && (
        <div className="flex items-center justify-between gap-2 py-1 px-1">
          <div className="flex items-center gap-2 flex-none">
            <button
              onClick={() => setShowEmiShareOptions(true)}
              disabled={isExportingSlip}
              title={translate("Share EMI Table or Reminder")}
              className="w-9 h-9 rounded-full bg-[#078A87]/15 text-[#078A87] hover:bg-[#078A87] hover:text-white active:bg-[#078A87] active:text-white flex items-center justify-center transition-all border border-[#078A87]/25 shadow-xs"
            >
              <i className={`fa-solid ${isExportingSlip ? 'fa-spinner animate-spin' : 'fa-share-nodes'} text-xs`}></i>
            </button>

            <button
              onClick={handleSendWhatsAppReminder}
              title={translate("Send WhatsApp EMI Reminder")}
              className="w-9 h-9 rounded-full bg-[#25D366] text-white hover:brightness-105 active:scale-95 flex items-center justify-center text-sm transition-all shadow-xs"
            >
              <i className="fa-brands fa-whatsapp"></i>
            </button>

            <button
              onClick={() => setShowDeleteLoanConfirm(true)}
              title={translate("Delete Loan")}
              className="w-9 h-9 rounded-full bg-[#D6455D]/15 text-[#D6455D] hover:bg-[#D6455D] hover:text-white active:bg-[#D6455D] active:text-white flex items-center justify-center transition-all border border-[#D6455D]/25 shadow-xs"
            >
              <i className="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (currentLoan && currentLoan.schedule && currentLoan.schedule.length > 0) {
                  const firstPending = currentLoan.schedule.find(s => !s.paid) || currentLoan.schedule[0];
                  setSelectedClosureEmiNo(firstPending.emiNo);
                }
                setClosureAmountVal('');
                setForeclosingStatus('idle');
                setForeclosureModalOpen(true);
              }}
              title={translate("Foreclose Loan")}
              className="px-3 py-1.5 rounded-xl bg-[#D6455D] text-white text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
            >
              <i className="fa-solid fa-xmark text-xs font-black"></i>
              <span>{translate("Foreclose")}</span>
            </button>

            <button
              onClick={() => {
                setNewLoanName('');
                setNewLoanTaken('');
                setNewLoanToPay('');
                setNewMonthlyEmi('');
                setNewTenure('12');
                setNewFirstDate(toInputDate_(new Date()));
                setNewPerson(currentLoan ? currentLoan.person : '');
                setIsCreatingLoan(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[#078A87] text-white text-xs font-black uppercase tracking-wider shadow-sm active:scale-95 transition-all flex items-center gap-1.5"
            >
              <i className="fa-solid fa-plus text-xs"></i>
              <span>{translate("New Loan")}</span>
            </button>
          </div>
        </div>
      )}

      {isCreatingLoan && (
        <div
          className="fixed inset-0 z-50 bg-[#1E104B]/60 backdrop-blur-md flex items-center justify-center p-4 select-none"
          onClick={() => setIsCreatingLoan(false)}
        >
          <div
            className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl animate-slide-up space-y-3.5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <div>
                <h3 className="text-sm font-black text-[#1E104B] uppercase tracking-wide">{translate("New Loan Details")}</h3>
                <p className="text-[10px] text-gray-400 font-bold">{translate("Amortization Setup")}</p>
              </div>
              <button
                onClick={() => setIsCreatingLoan(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>

            {actionError && (
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>{actionError}</span>
              </div>
            )}

            <form onSubmit={handleCreateLoan} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Borrower *")}</label>
                  <SearchableDropdown
                    value={newPerson}
                    onChange={setNewPerson}
                    options={persons.map(p => p.name)}
                    placeholder={translate("Select person...")}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Loan Name *")}</label>
                  <input
                    type="text"
                    required
                    placeholder={translate("e.g. Phone EMI / Gold Loan")}
                    value={newLoanName}
                    onChange={e => setNewLoanName(e.target.value)}
                    className="w-full border border-[#E4E1EA] rounded-xl px-3 py-2.5 font-bold text-xs bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Loan Taken (Disbursed) *")}</label>
                  <input
                    type="number"
                    placeholder={translate("Bank Disbursed Amount")}
                    value={newLoanTaken}
                    onChange={e => setNewLoanTaken(e.target.value)}
                    className="w-full border border-[#E4E1EA] rounded-xl px-3 py-2.5 font-bold text-xs bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Loan to Pay (Total) *")}</label>
                  <input
                    type="number"
                    required
                    placeholder={translate("Total Repayable")}
                    value={newLoanToPay}
                    onChange={e => setNewLoanToPay(e.target.value)}
                    className="w-full border border-[#E4E1EA] rounded-xl px-3 py-2.5 font-bold text-xs bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Monthly EMI (₹) *")}</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 2285"
                    value={newMonthlyEmi}
                    onChange={e => setNewMonthlyEmi(e.target.value)}
                    className="w-full border border-[#E4E1EA] rounded-xl px-3 py-2.5 font-bold text-xs bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Tenure (Mo)")}</label>
                  <input
                    type="number"
                    value={newTenure}
                    onChange={e => setNewTenure(e.target.value)}
                    className="w-full border border-[#E4E1EA] rounded-xl px-3 py-2.5 font-bold text-xs bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("First Date")}</label>
                  <AppDatePicker
                    value={newFirstDate}
                    onChange={setNewFirstDate}
                    className="w-full border border-[#E4E1EA] rounded-xl px-2 py-2.5 font-bold text-[11px] bg-[#F4F3F8] focus:bg-white text-[#1E104B] outline-none cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingLoan(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl text-xs uppercase"
                >
                  {translate("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createStatus === 'loading'}
                  className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md ${
                    createStatus === 'loading'
                      ? 'bg-slate-400 text-white cursor-not-allowed'
                      : createStatus === 'success'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#1E104B] hover:bg-[#2A186B] active:scale-95 text-white'
                  }`}
                >
                  {createStatus === 'loading' && <i className="fa-solid fa-spinner animate-spin"></i>}
                  {createStatus === 'success' && <i className="fa-solid fa-check"></i>}
                  <span>
                    {createStatus === 'loading' ? translate('Creating...') : createStatus === 'success' ? translate('Created') : translate('Create Loan')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!isCreatingLoan && currentLoan && (
        <>
          <div className="grad-kpi rounded-2xl p-3.5 shadow-md text-white space-y-2.5">
            <div className="grid grid-cols-3 divide-x divide-white/10 text-center pb-2 border-b border-white/10">
              <div className="px-1">
                <p className="text-[8px] font-bold uppercase tracking-wider text-white/60">{translate("Total Loan Taken")}</p>
                <p className="text-xs sm:text-sm font-black mt-0.5 truncate">{formatMoney(loanTakenVal)}</p>
              </div>
              <div className="px-1">
                <p className="text-[8px] font-bold uppercase tracking-wider text-white/60">{translate("Total Loan to Pay")}</p>
                <p className="text-xs sm:text-sm font-black text-[#07C0BE] mt-0.5 truncate">{formatMoney(loanToPayVal)}</p>
              </div>
              <div className="px-1">
                <p className="text-[8px] font-bold uppercase tracking-wider text-white/60">{translate("Interest")}</p>
                <p className="text-xs sm:text-sm font-black text-amber-300 mt-0.5 truncate">{formatMoney(loanInterestVal)}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-white/10 text-center">
              <div className="px-1">
                <p className="text-[8px] font-bold uppercase tracking-wider text-white/60">{translate("EMI Paid")}</p>
                <p className="text-xs sm:text-sm font-black text-emerald-400 mt-0.5 truncate">
                  {paidEmisList.length} / {currentLoan.schedule.length}
                </p>
              </div>
              <div className="px-1">
                <p className="text-[8px] font-bold uppercase tracking-wider text-white/60">{translate("Payment Made")}</p>
                <p className="text-xs sm:text-sm font-black text-emerald-400 mt-0.5 truncate">{formatMoney(paymentMadeVal)}</p>
              </div>
              <div className="px-1">
                <p className="text-[8px] font-bold uppercase tracking-wider text-white/60">{translate("Remaining")}</p>
                <p className="text-xs sm:text-sm font-black text-rose-300 mt-0.5 truncate">{formatMoney(remainingBalanceVal)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#E4E1EA] overflow-hidden shadow-xs">
            <div className="overflow-x-auto hide-scrollbar">
              <table className="w-full text-left text-[11px] whitespace-nowrap">
                <thead className="bg-[#1DA1D2] text-white uppercase font-black tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2.5">{translate("DATE")}</th>
                    <th className="px-3 py-2.5 text-right">{translate("AMOUNT")}</th>
                    <th className="px-3 py-2.5 text-right">{translate("BALANCE")}</th>
                    <th className="px-2.5 py-2.5 text-center">{translate("Paid/ Not")}</th>
                    <th className="px-3 py-2.5">{translate("Txn. Id")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E1EA] font-semibold text-[#1E104B]">
                  {currentLoan.schedule.map((row) => (
                    <tr
                      key={row.emiNo}
                      className={`transition-colors ${row.paid ? 'bg-amber-50/70' : 'hover:bg-slate-50'}`}
                    >
                      <td className={`px-3 py-2.5 whitespace-nowrap ${row.paid ? 'line-through text-gray-500 font-bold' : 'text-[#1E104B]'}`}>
                        {formatDisplayDate(row.date)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-black">{formatMoney(row.emiAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-gray-700">{formatMoney(row.outstandingBal)}</td>
                      <td className="px-2.5 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.paid}
                          onChange={() => handleToggleCheckbox(row)}
                          className="w-4 h-4 rounded cursor-pointer accent-[#1E104B]"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-[10px] text-gray-600 font-mono truncate max-w-[170px]">
                        {row.paymentId || '-'}
                        {row.whoPaid && (
                          <span className="block text-[8px] font-bold text-[#078A87] uppercase">
                            {row.whoPaid === 'ME' 
                              ? `Paid by ${toProperCase(typeof admin !== 'undefined' && admin && admin.name ? admin.name.trim().split(/\s+/)[0] : 'Me')}` 
                              : `Paid by ${currentLoan.person ? currentLoan.person.trim().split(/\s+/)[0] : 'Borrower'}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {foreclosureModalOpen && (
            <div 
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => { if (foreclosingStatus !== 'loading') setForeclosureModalOpen(false); }}
            >
              <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start border-b border-gray-100 pb-2">
                  <div>
                    <h3 className="text-sm font-black text-[#1E104B] uppercase tracking-wide">{translate("Loan Foreclosure")}</h3>
                    <p className="text-[10px] font-bold text-[#625E70] mt-0.5">
                      {currentLoan.loanName} • <span className="text-[#078A87]">{currentLoan.person}</span>
                    </p>
                  </div>
                  <button
                    disabled={foreclosingStatus === 'loading'}
                    onClick={() => setForeclosureModalOpen(false)}
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                  >
                    <i className="fa-solid fa-xmark text-xs"></i>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Closure EMI / Date *")}</label>
                    <select
                      value={selectedClosureEmiNo}
                      disabled={foreclosingStatus === 'loading'}
                      onChange={e => setSelectedClosureEmiNo(Number(e.target.value))}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold bg-[#F4F3F8] text-[#1E104B] outline-none cursor-pointer"
                    >
                      {(currentLoan.schedule || []).map((s) => (
                        <option key={s.emiNo} value={s.emiNo}>
                          {formatDisplayDate(s.date)} (EMI #{s.emiNo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#625E70] uppercase mb-1">{translate("Closure Settlement Amount (₹) *")}</label>
                    <input
                      type="number"
                      disabled={foreclosingStatus === 'loading'}
                      placeholder={translate("Enter final settlement amount")}
                      value={closureAmountVal}
                      onChange={e => setClosureAmountVal(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1E104B] outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={foreclosingStatus === 'loading'}
                    onClick={() => setForeclosureModalOpen(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-xs uppercase disabled:opacity-50"
                  >
                    {translate("Cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={foreclosingStatus === 'loading'}
                    onClick={async () => {
                      const closeAmt = parseFloat(closureAmountVal);
                      if (isNaN(closeAmt) || closeAmt < 0) {
                        alert('Please provide a valid settlement amount.');
                        return;
                      }

                      setForeclosingStatus('loading');

                      const now = new Date();
                      const pad = (n) => ('0' + n).slice(-2);
                      const todayStrictStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

                      const targetEmiNo = Number(selectedClosureEmiNo);

                      const updatedSchedule = currentLoan.schedule.map((s) => {
                        if (s.emiNo === targetEmiNo) {
                          return {
                            ...s,
                            emiAmount: closeAmt,
                            outstandingBal: 0,
                            paid: true,
                            whoPaid: 'PERSON',
                            paymentId: 'Foreclosure Settlement',
                            paidDate: todayStrictStr
                          };
                        } else if (s.emiNo > targetEmiNo) {
                          return {
                            ...s,
                            emiAmount: 0,
                            outstandingBal: 0,
                            paid: true,
                            whoPaid: 'PERSON',
                            paymentId: 'Closed via Foreclosure',
                            paidDate: todayStrictStr
                          };
                        }
                        return s;
                      });

                      const finalLoanPayload = {
                        ...currentLoan,
                        status: 'CLOSED',
                        schedule: updatedSchedule
                      };

                      try {
                        await saveLoanAction(finalLoanPayload);
                        setForeclosingStatus('success');
                        setTimeout(() => {
                          setForeclosureModalOpen(false);
                          setForeclosingStatus('idle');
                          showFeedback('Loan successfully foreclosed & closed');
                        }, 500);
                      } catch (err) {
                        setForeclosingStatus('error');
                        alert('Foreclosure failed: ' + (err && err.message ? err.message : String(err)));
                      }
                    }}
                    className={`flex-1 font-black py-2.5 rounded-xl text-xs uppercase shadow-md transition-all flex items-center justify-center gap-1.5 ${
                      foreclosingStatus === 'loading'
                        ? 'bg-amber-400 text-white cursor-wait'
                        : foreclosingStatus === 'success'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                  >
                    {foreclosingStatus === 'loading' && <i className="fa-solid fa-spinner animate-spin text-xs"></i>}
                    {foreclosingStatus === 'success' && <i className="fa-solid fa-check text-xs"></i>}
                    <span>
                      {foreclosingStatus === 'loading'
                        ? translate('Closing...')
                        : foreclosingStatus === 'success'
                        ? translate('Closed')
                        : translate('Confirm Closure')}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showDeleteLoanConfirm && currentLoan && (
        <div className="fixed inset-0 z-[60] bg-theme-dark/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!isDeletingLoan) setShowDeleteLoanConfirm(false); }}>
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-3 ${isDeletingLoan ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-500'}`}>
              <i className={isDeletingLoan ? "fa-solid fa-spinner animate-spin" : "fa-solid fa-triangle-exclamation"}></i>
            </div>
            <h3 className="text-sm font-black text-theme-dark uppercase tracking-wide">
              {isDeletingLoan ? translate('Deleting Loan...') : translate('Delete Loan?')}
            </h3>
            <p className="text-xs text-gray-500 mt-1 mb-5">
              {isDeletingLoan ? `Deleting "${currentLoan.loanName}" and all associated schedule records...` : <>{translate("Are you sure you want to delete")} <strong>"{currentLoan.loanName}"</strong>{translate("? This action cannot be undone.")}</>}
            </p>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                disabled={isDeletingLoan}
                onClick={() => setShowDeleteLoanConfirm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 rounded-xl text-xs uppercase transition-all disabled:opacity-50"
              >
                {translate("Cancel")}
              </button>
              <button
                type="button"
                disabled={isDeletingLoan}
                onClick={async () => {
                  setIsDeletingLoan(true);
                  try {
                    await deleteLoanAction(currentLoan.id);
                    setShowDeleteLoanConfirm(false);
                    setViewMode('master');
                  } catch (err) {
                    console.error("Delete loan error:", err);
                  } finally {
                    setIsDeletingLoan(false);
                  }
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs uppercase shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-70 cursor-wait"
              >
                {isDeletingLoan && <i className="fa-solid fa-spinner animate-spin text-xs"></i>}
                <span>{isDeletingLoan ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentModal.open && paymentModal.row && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-slide-up space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <div>
                <h3 className="text-sm font-black text-[#1E104B] uppercase">{translate("Record EMI Payment")}</h3>
                <p className="text-[10px] text-gray-500 font-bold">
                  {currentLoan.loanName} • {formatMoney(paymentModal.row.emiAmount)}
                </p>
              </div>
              <button
                disabled={payStatus === 'loading'}
                onClick={() => setPaymentModal({ open: false, row: null, who: 'ME', paymentId: '' })}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 disabled:opacity-50"
              >
                <i className="fa-solid fa-xmark text-xs"></i>
              </button>
            </div>

            {actionError && (
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#625E70] uppercase">{translate("Who Paid this EMI? *")}</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl text-xs font-black">
                <button
                  type="button"
                  onClick={() => setPaymentModal(prev => ({ ...prev, who: 'ME' }))}
                  className={`py-2 rounded-lg transition-all ${
                    paymentModal.who === 'ME' ? 'bg-[#1E104B] text-white shadow-xs' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  {translate("I Paid (Me)")}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentModal(prev => ({ ...prev, who: 'PERSON' }))}
                  className={`py-2 rounded-lg transition-all ${
                    paymentModal.who === 'PERSON' ? 'bg-[#078A87] text-white shadow-xs' : 'text-gray-500 hover:text-black'
                  }`}
                >
                  {translate("Borrower Paid")}
                </button>
              </div>
              {paymentModal.who === 'ME' ? (
                <p className="text-[9px] text-[#078A87] font-semibold mt-1">
                  <i className="fa-solid fa-circle-info mr-1"></i>
                  {translate("Auto-logs a")} <strong>{translate("GIVEN (LENT)")}</strong> entry of {formatMoney(paymentModal.row.emiAmount)} in {currentLoan.person}'s ledger.
                </p>
              ) : (
                <p className="text-[9px] text-gray-500 font-semibold mt-1">
                  <i className="fa-solid fa-circle-info mr-1"></i>
                  {translate("Marks installment cleared by borrower. Ledger balance remains unchanged.")}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-[#625E70] uppercase">{translate("UTR / Payment ID / Note")}</label>
              <input
                type="text"
                placeholder={translate("e.g. T2403050925367... or paid advance")}
                value={paymentModal.paymentId}
                onChange={e => setPaymentModal({ ...paymentModal, paymentId: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-[#1E104B] outline-none focus:border-[#1E104B]"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                disabled={payStatus === 'loading'}
                onClick={() => setPaymentModal({ open: false, row: null, who: 'ME', paymentId: '' })}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-xs uppercase disabled:opacity-50"
              >
                {translate("Cancel")}
              </button>
              <button
                type="button"
                disabled={payStatus === 'loading'}
                onClick={handleConfirmPayment}
                className={`flex-1 font-black py-2.5 rounded-xl text-xs uppercase shadow-md transition-all flex items-center justify-center gap-1.5 ${
                  payStatus === 'loading'
                    ? 'bg-slate-400 text-white cursor-not-allowed'
                    : payStatus === 'success'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#1E104B] hover:bg-[#2A186B] active:scale-95 text-white'
                }`}
              >
                {payStatus === 'loading' && <i className="fa-solid fa-spinner animate-spin"></i>}
                {payStatus === 'success' && <i className="fa-solid fa-check"></i>}
                <span>
                  {payStatus === 'loading' ? translate('Saving...') : payStatus === 'success' ? translate('Saved') : translate('Confirm & Save')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {currentLoan && SafePortal && ReactDOM.createPortal(
        <div className="canvas-hide">
          {(() => {
            const safeAdmin = typeof admin !== 'undefined' ? admin : {};
            const rawAdminFirst = safeAdmin.name ? safeAdmin.name.trim().split(/\s+/)[0] : 'Me';
            const adminFirstName = toProperCase(rawAdminFirst);
            const borrowerFirstName = currentLoan.person ? currentLoan.person.trim().split(/\s+/)[0] : 'Borrower';
            const emiStartDate = currentLoan.schedule && currentLoan.schedule.length > 0 ? formatDisplayDate(currentLoan.schedule[0].date) : '-';

            return (
              <div
                ref={loanSlipRef}
                className="bg-white px-5 py-3 font-sans box-border text-slate-900 relative overflow-hidden"
                style={{ width: '720px', fontFamily: "'Noto Sans Devanagari', sans-serif" }}
              >
                <div 
                  className="absolute inset-0 pointer-events-none overflow-hidden flex flex-col justify-around items-center" 
                  style={{ zIndex: 0 }}
                >
                  {Array.from({ length: Math.max(1, Math.ceil(((currentLoan.schedule && currentLoan.schedule.length) || 1) / 14)) }).map((_, wIdx) => (
                    <div key={wIdx} className="w-full flex items-center justify-center" style={{ minHeight: '820px' }}>
                      <img
                        src={Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED}
                        alt=""
                        className="w-80 h-auto max-h-48 object-contain select-none"
                        style={{ opacity: 0.05 }}
                      />
                    </div>
                  ))}
                </div>

                <div className="border-b-2 border-[#1E104B] pb-2 mb-2 flex justify-between items-start relative z-10">
                  <div className="text-left">
                    <h1 className="text-[10px] font-black text-[#7B2B8C] uppercase tracking-widest mb-0.5">
                      {admin && admin.headerNote ? admin.headerNote : 'Budget Bharat'}
                    </h1>
                    <h2 className="text-xl font-black text-[#1E104B] tracking-tight leading-tight">{currentLoan.loanName}</h2>
                    <p className="text-[10px] font-black text-[#078A87] uppercase tracking-wider mt-0.5">{translate("EMI TABLE")}</p>
                    <p className="text-[9px] text-gray-500 font-bold mt-0.5">
                      Date: {formatDisplayDate(`${new Date().getDate()}/${new Date().getMonth() + 1}/${new Date().getFullYear()}`)}
                    </p>
                  </div>
                  <div className="text-right leading-tight">
                    <h2 className="text-2xl font-black text-[#1E104B] tracking-tight leading-none mb-1">{currentLoan.person}</h2>
                    <p className="text-xs font-bold text-gray-700">
                      Mo.No: {
                        (borrowerPersonObj && borrowerPersonObj.phone) ||
                        ((persons || []).find(p => String(p.name || '').trim().toLowerCase() === String(currentLoan.person || '').trim().toLowerCase()) || {}).phone ||
                        'N/A'
                      }
                    </p>
                    <p className="text-[10px] font-semibold text-gray-500 capitalize mt-0.5">
                      {
                        (borrowerPersonObj && borrowerPersonObj.address) ||
                        ((persons || []).find(p => String(p.name || '').trim().toLowerCase() === String(currentLoan.person || '').trim().toLowerCase()) || {}).address ||
                        'Maharashtra'
                      }
                    </p>
                    <p className="text-[9px] font-bold text-gray-500">EMI Start: {emiStartDate}</p>
                  </div>
                </div>

                <div className="bg-[#1E104B] text-white rounded-xl py-3.5 px-3 mb-3 mx-2 grid grid-cols-3 gap-2.5 text-center">
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/80">{translate("TOTAL LOAN TAKEN")}</p>
                    <p className="text-base font-black mt-0.5">{formatMoney(loanTakenVal)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/80">{translate("TOTAL LOAN TO PAY")}</p>
                    <p className="text-base font-black text-[#07C0BE] mt-0.5">{formatMoney(loanToPayVal)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/80">{translate("INTEREST")}</p>
                    <p className="text-base font-black text-amber-300 mt-0.5">{formatMoney(loanInterestVal)}</p>
                  </div>
                  <div className="pt-2.5 border-t border-white/15">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/80">{translate("EMI PAID")}</p>
                    <p className="text-base font-black text-emerald-400 mt-0.5">{paidEmisList.length} / {currentLoan.schedule.length}</p>
                  </div>
                  <div className="pt-2.5 border-t border-white/15">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/80">{translate("PAYMENT MADE")}</p>
                    <p className="text-base font-black text-emerald-400 mt-0.5">{formatMoney(paymentMadeVal)}</p>
                  </div>
                  <div className="pt-2.5 border-t border-white/15">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-white/80">{translate("REMAINING")}</p>
                    <p className="text-base font-black text-rose-300 mt-0.5">{formatMoney(remainingBalanceVal)}</p>
                  </div>
                </div>

                <table className="w-full text-left text-xs mb-3 border-collapse table-fixed">
                  <colgroup>
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '29%' }} />
                  </colgroup>
                  <thead className="bg-[#1DA1D2] text-white uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-2 border">{translate("DATE")}</th>
                      <th className="py-2 px-2 text-right border">{translate("AMOUNT")}</th>
                      <th className="py-2 px-2 text-right border">{translate("BALANCE")}</th>
                      <th className="py-2 px-2 text-center border">{translate("STATUS")}</th>
                      <th className="py-2 px-2 text-center border">{translate("WHO PAID")}</th>
                      <th className="py-2 px-2 border">{translate("TXN ID")}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-transparent">
                    {currentLoan.schedule.map((row) => (
                      <tr key={row.emiNo} className={row.paid ? 'bg-amber-50/50' : ''}>
                        <td className="py-2 px-2 border align-middle leading-normal whitespace-nowrap">{formatDisplayDate(row.date)}</td>
                        <td className="py-2 px-2 border text-right font-bold">{formatMoney(row.emiAmount)}</td>
                        <td className="py-2 px-2 border text-right font-bold">{formatMoney(row.outstandingBal)}</td>
                        <td className="py-2 px-2 border text-center font-bold">
                          {row.paid ? 'Paid' : '-'}
                        </td>
                        <td className="py-2 px-2 border text-center font-bold">
                          {row.paid ? (row.whoPaid === 'ME' ? adminFirstName : borrowerFirstName) : '-'}
                        </td>
                        <td className="py-2 px-2 border font-mono text-[10px] truncate">{row.paymentId || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="pt-2 border-t border-gray-300 flex justify-between items-center relative z-10">
                  <div className="flex flex-col justify-center text-left leading-tight">
                    <span className="text-[9px] font-black text-[#1E104B] uppercase tracking-wider mb-0.5">{translate("STATEMENT BY -")}</span>
                    <span className="font-extrabold text-[11px] text-[#1E104B]">{translate("Budget Bharat-Personal finance App")}</span>
                    <span className="text-[10px] font-medium text-[#625E70] mt-0.5">{translate("Developed by - Bharat Rasve")}</span>
                    <span className="text-[10px] font-medium text-[#625E70]">{translate("Mo.No: 7218838122")}</span>
                  </div>

                  <div className="flex items-center justify-center">
                    <img
                      src={Array.isArray(APP_LOGO_COLORED) ? APP_LOGO_COLORED.join('') : APP_LOGO_COLORED}
                      alt="Logo"
                      className="w-[104px] h-[32px] object-contain select-none flex-none"
                    />
                  </div>

                  <div className="text-right leading-tight">
                    {admin && admin.footerNote && (
                      <p className="text-[10px] font-semibold text-gray-700 italic mb-1">
                        "{admin.footerNote}"
                      </p>
                    )}
                    <span className="text-[11px] font-extrabold text-[#1E104B] block">
                      {admin && admin.name ? admin.name : 'Bharat Rasve'}
                    </span>
                    {admin && admin.contact && (
                      <span className="text-[10px] font-bold text-gray-600 block mt-1">
                        Mo.No: {admin.contact}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>,
        document.body
      )}
      <AppBottomBranding />
    </div>
  </div>
);
};

const RecordsView = ({ onSelectTransaction }) => {
  const { filteredTransactions } = useContext(AppContext);

  const expenses = useMemo(() => filteredTransactions.filter(t => t.type === 'EXPENSE'), [filteredTransactions]);
  const incomes = useMemo(() => filteredTransactions.filter(t => t.type === 'INCOME'), [filteredTransactions]);
  const lents = useMemo(() => filteredTransactions.filter(t => t.type === 'LENT'), [filteredTransactions]);
  const borrows = useMemo(() => filteredTransactions.filter(t => t.type === 'BORROW'), [filteredTransactions]);

  const Section = ({ title, txs, showType = false }) => {
    const [visibleCount, setVisibleCount] = useState(6);
    const totalAmount = useMemo(() => txs.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0), [txs]);
    const sortedTxs = sortTransactionsByDateDesc(txs);
    const displayTxs = sortedTxs.slice(0, visibleCount);

    return (
      <div className="mb-3.5 bg-white rounded-2xl border border-[#E4E1EA] overflow-hidden shadow-xs">
        <div className="bg-[#1E104B] px-3.5 py-2.5 flex justify-between items-center text-white">
          <span className="text-[10px] font-black uppercase tracking-wider">{title} ({txs.length})</span>
          <span className="text-[10px] font-semibold tracking-wide text-white/80">
            Total: <span className="font-black text-white">{formatMoney(totalAmount)}</span>
          </span>
        </div>

        {txs.length === 0 ? (
          <p className="text-xs text-[#625E70] font-semibold px-3 py-3">{translate("No records found.")}</p>
        ) : (
          <>
            <div className="overflow-x-auto hide-scrollbar">
              <table className="w-full text-left text-[10px] whitespace-nowrap">
                <thead className="bg-[#E2DEEA] text-[#1E104B] uppercase font-black border-b border-[#CDC8DA] tracking-wider">
                  <tr>
                    <th className="px-3 py-1.5">{translate("Date")}</th>
                    <th className="px-3 py-1.5">{translate("Description")}</th>
                    {showType && <th className="px-3 py-1.5">{translate("Type")}</th>}
                    <th className="px-3 py-1.5 text-right">{translate("Amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E1EA]/60 font-medium text-[#1E104B]">
                  {displayTxs.map(t => {
                    const txColor = t.type === 'INCOME' ? '#078A87' : t.type === 'EXPENSE' ? '#D6455D' : t.type === 'LENT' ? '#7B2B8C' : '#B7791F';
                    const isPos = ['INCOME', 'BORROW'].includes(t.type);
                    return (
                      <tr
                        key={t.id || t.entryId}
                        data-entry-id={t.id || t.entryId}
                        onClick={() => onSelectTransaction && onSelectTransaction(t)}
                        className="hover:bg-[#E0E7FF]/30 transition-colors cursor-pointer active:bg-gray-100"
                      >
                        <td className="px-3 py-2.5 font-semibold text-[#625E70]">{formatDisplayDate(t.date)}</td>
                        <td className="px-3 py-2.5 font-bold max-w-[150px] truncate text-[#1E104B]">
                          {t.note || t.category}
                          {(t.person || t.ref) && (
                            <span className="block text-[8px] font-semibold text-[#8A8596] mt-0.5">
                              {t.person} {t.person && t.ref ? '•' : ''} {t.ref}
                            </span>
                          )}
                        </td>
                        {showType && (
                          <td className="px-3 py-2.5 font-extrabold text-[#8A8596] uppercase text-[9px] tracking-wider">
                            {translate(t.type === 'LENT' ? 'Given' : t.type === 'BORROW' ? 'Received' : t.type === 'EXPENSE' ? 'Expense' : 'Income')}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right font-black text-xs" style={{ color: txColor }}>
                          {isPos ? '+' : '-'}{formatTableNum(t.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {txs.length > 6 && (
              <div className="border-t border-theme-dark/5 bg-theme-gray/60 py-1.5 px-3 flex justify-between items-center text-[9px]">
                <span className="font-bold opacity-60">Showing {Math.min(visibleCount, txs.length)} of {txs.length}</span>
                <div className="space-x-2">
                  {visibleCount < txs.length ? (
                    <button
                      type="button"
                      onClick={() => setVisibleCount(v => v + 6)}
                      className="font-black text-theme-dark hover:opacity-75 uppercase tracking-wider py-1 px-2.5 bg-white border border-theme-dark/10 rounded shadow-xs"
                    >
                      Load More (+6)
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setVisibleCount(6)}
                      className="font-black text-theme-dark hover:opacity-75 uppercase tracking-wider py-1 px-2.5 bg-white border border-theme-dark/10 rounded shadow-xs"
                    >
                      Show Less
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="px-4 mt-2 pb-32">
      <div className="flex justify-end mb-2.5">
        <PeriodSelector />
      </div>
      <Section title={translate("Expense")} txs={expenses} showType={false} />
      <Section title={translate("Income")} txs={incomes} showType={false} />
      <Section title={translate("Given (Dr)")} txs={lents} showType={false} />
      <Section title={translate("Received (Cr)")} txs={borrows} showType={false} />
      <Section title={translate("Overall Records")} txs={filteredTransactions} showType={true} />
      <AppBottomBranding />
    </div>
  );
};

const TransactionDetailModal = ({ tx, onClose }) => {
  const { updateTransaction, deleteTransaction, persons, categories } = useContext(AppContext);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [type, setType] = useState(tx.type);
  const [amt, setAmt] = useState(String(tx.amount || ''));
  
  const isoDate = useMemo(() => toInputDate_(tx.date), [tx.date]);
  const isoPromiseDate = useMemo(() => toInputDate_(tx.promiseDate), [tx.promiseDate]);

  const [date, setDate] = useState(isoDate);
  const [promiseDate, setPromiseDate] = useState(isoPromiseDate);
  const [personName, setPersonName] = useState(tx.person || '');
  const [category, setCategory] = useState(tx.category || '');
  const [note, setNote] = useState(tx.note || '');
  const [refAc, setRefAc] = useState(tx.ref || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!amt || isNaN(amt)) return alert('Please enter a valid amount');
    setIsSubmitting(true);
    const formattedDate = date.split('-').reverse().join('/');
    const formattedPromise = promiseDate ? promiseDate.split('-').reverse().join('/') : '';
    try {
      await updateTransaction({
        entryId: tx.entryId || tx.id,
        id: tx.entryId || tx.id,
        type,
        amount: parseFloat(amt),
        category: (type === 'EXPENSE' || type === 'INCOME') ? category : '',
        person: personName || '',
        date: formattedDate,
        promiseDate: formattedPromise,
        note,
        ref: refAc
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeDelete = async () => {
    setIsSubmitting(true);
    try {
      const targetId = String(tx.entryId || tx.id || '').trim();
      await deleteTransaction(targetId);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err) {
      console.error("Delete failed:", err);
      setShowDeleteConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const personOptions = useMemo(() => persons.map(p => p.name), [persons]);
  const categoryOptions = useMemo(() => (type === 'INCOME' ? categories.income : categories.expense), [categories, type]);

  return (
    <div
      className="fixed inset-0 z-50 bg-theme-dark/60 backdrop-blur-sm flex items-end justify-center p-0"
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
    >
      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 max-h-[90%] overflow-y-auto relative shadow-2xl animate-slide-up hide-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-sm font-extrabold text-[#1E104B] uppercase tracking-wider">{translate("Edit Transaction")}</h2>
            <p className="text-[9px] font-mono text-[#8A8596]">ID: {String(tx.entryId || tx.id).slice(0, 8)}...</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSubmitting}
              title={translate("Delete Transaction")}
              className="w-8 h-8 rounded-full bg-[#D6455D]/10 text-[#D6455D] hover:bg-[#D6455D] hover:text-white transition-all flex items-center justify-center text-xs"
            >
              <i className="fa-solid fa-trash-can"></i>
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-8 h-8 bg-[#F4F3F8] rounded-full text-[#625E70] hover:bg-[#1E104B] hover:text-white transition-all flex items-center justify-center text-xs"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 bg-[#F4F3F8] rounded-xl mb-4 text-[10px] font-bold uppercase border border-[#E4E1EA]">
          {[
            { key: 'EXPENSE', label: 'EXPENSE' },
            { key: 'INCOME', label: 'INCOME' },
            { key: 'LENT', label: 'GIVEN' },
            { key: 'BORROW', label: 'RECEIVED' }
          ].map(item => {
            const getActiveTabClass = () => {
              if (type !== item.key) return 'text-[#625E70] hover:bg-white';
              if (item.key === 'EXPENSE') return 'bg-[#D6455D] text-white shadow-xs';
              if (item.key === 'INCOME') return 'bg-[#078A87] text-white shadow-xs';
              if (item.key === 'LENT') return 'bg-[#7B2B8C] text-white shadow-xs';
              return 'bg-[#B7791F] text-white shadow-xs';
            };
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setType(item.key)}
                className={`py-2 rounded-lg transition-all ${getActiveTabClass()}`}
              >
                {translate(item.label === 'GIVEN' ? 'Given' : item.label === 'RECEIVED' ? 'Received' : item.label === 'EXPENSE' ? 'Expense' : 'Income')}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleUpdate} className="space-y-3.5">
          <div className="space-y-1">
            <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("AMOUNT (₹) *")}</label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-theme-dark/40 font-extrabold text-xl pointer-events-none select-none">₹</span>
              <input
                type="number"
                step="any"
                required
                value={amt}
                onChange={e => setAmt(e.target.value)}
                className="w-full text-2xl font-black border border-theme-dark/20 rounded-xl pl-11 pr-12 py-2.5 outline-none focus:border-theme-dark focus:ring-2 focus:ring-theme-dark/15 transition-all bg-theme-gray focus:bg-white text-theme-dark [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => setShowCalculator(true)}
                title={translate("Open Calculator")}
                className="absolute right-3.5 text-[#66419C] hover:text-[#523380] active:scale-90 transition-transform p-1 flex items-center justify-center"
              >
                <i className="fa-solid fa-calculator text-xl"></i>
              </button>
            </div>
          </div>

          {showCalculator && (
            <CalculatorModal
              initialValue={amt}
              onApply={(calculatedValue) => setAmt(calculatedValue)}
              onClose={() => setShowCalculator(false)}
            />
          )}

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-5 space-y-1">
              <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("DATE *")}</label>
              <AppDatePicker
                required={true}
                value={date}
                onChange={setDate}
                className="w-full font-bold text-xs border border-theme-dark/20 rounded-xl px-3 py-2.5 outline-none focus:border-theme-dark focus:ring-2 focus:ring-theme-dark/15 transition-all bg-theme-gray focus:bg-white text-theme-dark cursor-pointer"
              />
            </div>

            {(type === 'LENT' || type === 'BORROW') ? (
              <div className="col-span-7 space-y-1">
                <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("PROMISE DATE")}</label>
                <AppDatePicker
                  value={promiseDate}
                  onChange={setPromiseDate}
                  className="w-full font-bold text-xs border border-theme-dark/20 rounded-xl px-3 py-2.5 outline-none focus:border-theme-dark focus:ring-2 focus:ring-theme-dark/15 transition-all bg-theme-gray focus:bg-white text-theme-dark cursor-pointer"
                />
              </div>
            ) : (
              <div className="col-span-7 space-y-1">
                <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("CATEGORY")}</label>
                <SearchableDropdown
                  value={category}
                  onChange={setCategory}
                  options={categoryOptions}
                  placeholder={translate("Category...")}
                />
              </div>
            )}
          </div>

          {(type === 'LENT' || type === 'BORROW') && (
            <div className="space-y-1">
              <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("PERSON NAME *")}</label>
              <SearchableDropdown
                value={personName}
                onChange={setPersonName}
                options={personOptions}
                placeholder={translate("Search person...")}
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("DESCRIPTION")}</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full font-bold text-xs border border-theme-dark/20 rounded-xl px-3.5 py-2.5 outline-none focus:border-theme-dark focus:ring-2 focus:ring-theme-dark/15 transition-all bg-theme-gray focus:bg-white text-theme-dark"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("REFERENCE / A/C MODE")}</label>
            <input
              type="text"
              value={refAc}
              onChange={e => setRefAc(e.target.value)}
              className="w-full font-bold text-xs border border-theme-dark/20 rounded-xl px-3.5 py-2.5 outline-none focus:border-theme-dark focus:ring-2 focus:ring-theme-dark/15 transition-all bg-theme-gray focus:bg-white text-theme-dark"
            />
          </div>

          <div className="flex justify-center mt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-3/4 bg-theme-dark hover:brightness-110 text-white font-bold py-3.5 rounded-xl shadow-lg active:scale-95 uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100"
            >
              {isSubmitting && <i className="fa-solid fa-spinner animate-spin"></i>}
              <span>{isSubmitting ? translate('Saving Changes...') : translate('Update Transaction')}</span>
            </button>
          </div>
        </form>

        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] bg-theme-dark/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => { if (!isSubmitting) setShowDeleteConfirm(false); }}>
            <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-3 ${isSubmitting ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-500'}`}>
                <i className={isSubmitting ? "fa-solid fa-spinner animate-spin" : "fa-solid fa-triangle-exclamation"}></i>
              </div>
              <h3 className="text-sm font-black text-theme-dark uppercase tracking-wide">
                {isSubmitting ? translate('Delete Entry...') : translate('Delete Transaction?')}
              </h3>
              <p className="text-xs text-gray-500 mt-1 mb-5">
                {isSubmitting ? translate('Please wait while we update your sheet.') : translate('This action cannot be undone.')}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold py-2.5 rounded-xl text-xs uppercase transition-all disabled:opacity-50"
                >
                  {translate("No")}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={executeDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs uppercase shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-70 cursor-wait"
                >
                  {isSubmitting ? <i className="fa-solid fa-spinner animate-spin text-xs"></i> : null}
                  <span>{isSubmitting ? translate('Deleting...') : translate('Yes, Delete')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CalculatorModal = ({ initialValue, onApply, onClose }) => {
  const [display, setDisplay] = useState(initialValue && !isNaN(initialValue) && Number(initialValue) > 0 ? String(initialValue) : '0');
  const [prevValue, setPrevValue] = useState(null);
  const [operation, setOperation] = useState(null);
  const [clearOnNext, setClearOnNext] = useState(false);

  const handleDigit = (digit) => {
    if (display === '0' || clearOnNext) {
      setDisplay(digit);
      setClearOnNext(false);
    } else {
      setDisplay(display + digit);
    }
  };

  const handleDecimal = () => {
    if (clearOnNext) {
      setDisplay('0.');
      setClearOnNext(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperation(null);
    setClearOnNext(false);
  };

  const handleBackspace = () => {
    if (clearOnNext) return;
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
    } else {
      setDisplay('0');
    }
  };

  const calculate = (a, b, op) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (isNaN(numA) || isNaN(numB)) return numB || 0;
    switch (op) {
      case '+': return numA + numB;
      case '-': return numA - numB;
      case '×': return numA * numB;
      case '÷': return numB !== 0 ? numA / numB : 0;
      default: return numB;
    }
  };

  const handleOp = (nextOp) => {
    const currentNum = parseFloat(display);
    if (prevValue === null) {
      setPrevValue(currentNum);
    } else if (operation && !clearOnNext) {
      const result = calculate(prevValue, currentNum, operation);
      const cleanRes = String(Math.round(result * 10000) / 10000);
      setPrevValue(result);
      setDisplay(cleanRes);
    }
    setOperation(nextOp);
    setClearOnNext(true);
  };

  const handleEquals = () => {
    if (operation && prevValue !== null) {
      const result = calculate(prevValue, display, operation);
      const cleanRes = String(Math.round(result * 10000) / 10000);
      setDisplay(cleanRes);
      setPrevValue(null);
      setOperation(null);
      setClearOnNext(true);
    }
  };

  const handleEnterResult = () => {
    let finalVal = display;
    if (operation && prevValue !== null && !clearOnNext) {
      const res = calculate(prevValue, display, operation);
      finalVal = String(Math.round(res * 10000) / 10000);
    }
    onApply(finalVal);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl p-5 w-full max-w-[320px] shadow-2xl flex flex-col gap-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#EEF1F4] rounded-2xl p-4 flex flex-col items-end justify-center min-h-[88px]">
          <span className="text-[11px] font-bold text-gray-400 h-4">
            {prevValue !== null && operation ? `${prevValue} ${operation}` : ''}
          </span>
          <span className="text-3xl font-black text-[#1E1E2D] truncate w-full text-right tracking-tight">
            {display}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2 text-sm font-black">
          <button type="button" onClick={() => handleDigit('7')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">7</button>
          <button type="button" onClick={() => handleDigit('8')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">8</button>
          <button type="button" onClick={() => handleDigit('9')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">9</button>
          <button type="button" onClick={handleClear} className="h-11 rounded-xl bg-[#7B2B8C]/10 hover:bg-[#7B2B8C]/20 active:scale-95 text-[#7B2B8C] transition-all flex items-center justify-center font-bold">{translate("AC")}</button>
          <button type="button" onClick={() => handleOp('÷')} className={`h-11 rounded-xl active:scale-95 transition-all flex items-center justify-center text-base ${operation === '÷' ? 'bg-[#1E104B] text-white' : 'bg-[#7B2B8C]/10 hover:bg-[#7B2B8C]/20 text-[#7B2B8C]'}`}>÷</button>

          <button type="button" onClick={() => handleDigit('4')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">4</button>
          <button type="button" onClick={() => handleDigit('5')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">5</button>
          <button type="button" onClick={() => handleDigit('6')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">6</button>
          <button type="button" onClick={() => handleOp('+')} className={`h-24 col-span-1 row-span-2 rounded-xl active:scale-95 transition-all flex items-center justify-center text-lg ${operation === '+' ? 'bg-[#1E104B] text-white' : 'bg-[#7B2B8C]/10 hover:bg-[#7B2B8C]/20 text-[#7B2B8C]'}`}>+</button>
          <button type="button" onClick={() => handleOp('×')} className={`h-11 rounded-xl active:scale-95 transition-all flex items-center justify-center text-base ${operation === '×' ? 'bg-[#1E104B] text-white' : 'bg-[#7B2B8C]/10 hover:bg-[#7B2B8C]/20 text-[#7B2B8C]'}`}>×</button>

          <button type="button" onClick={() => handleDigit('1')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">1</button>
          <button type="button" onClick={() => handleDigit('2')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">2</button>
          <button type="button" onClick={() => handleDigit('3')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">3</button>
          <button type="button" onClick={() => handleOp('-')} className={`h-11 rounded-xl active:scale-95 transition-all flex items-center justify-center text-base ${operation === '-' ? 'bg-[#1E104B] text-white' : 'bg-[#7B2B8C]/10 hover:bg-[#7B2B8C]/20 text-[#7B2B8C]'}`}>-</button>

          <button type="button" onClick={handleBackspace} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#625E70] transition-all flex items-center justify-center"><i className="fa-solid fa-delete-left text-xs"></i></button>
          <button type="button" onClick={() => handleDigit('0')} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">0</button>
          <button type="button" onClick={handleDecimal} className="h-11 rounded-xl bg-[#F4F3F8] hover:bg-[#ECEAF1] active:scale-95 text-[#1E104B] transition-all flex items-center justify-center">.</button>
          <button type="button" onClick={handleEquals} className="h-11 col-span-2 rounded-xl bg-[#1E104B] hover:bg-[#2A186B] active:scale-95 text-white shadow-xs transition-all flex items-center justify-center text-base font-black">=</button>
        </div>
      </div>

      <div className="w-full max-w-[320px] flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleEnterResult}
          className="flex-1 bg-[#682496] hover:bg-[#571B80] text-white font-black py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2"
        >
          <span>{translate("Enter Result")}</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          title={translate("Close Calculator")}
          className="w-12 h-12 flex-none rounded-full bg-white text-gray-700 hover:text-black hover:bg-gray-100 active:scale-90 flex items-center justify-center shadow-xl border border-black/5 transition-all"
        >
          <i className="fa-solid fa-xmark text-lg"></i>
        </button>
      </div>
    </div>
  );
};

const InputModal = ({ onClose }) => {
  const { addTransaction, persons, categories, setMenuView, setIsMenuOpen } = useContext(AppContext);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [type, setType] = useState('EXPENSE');
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [personName, setPersonName] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [note, setNote] = useState('');
  const [refAc, setRefAc] = useState('');
  const [category, setCategory] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [touched, setTouched] = useState(false);

  const isPersonRequired = type === 'LENT' || type === 'BORROW';
  const isAmtValid = amt !== '' && !isNaN(amt) && parseFloat(amt) > 0;
  const isDateValid = !!date;
  const isPersonValid = !isPersonRequired || (isPersonRequired && !!personName.trim());
  const isFormValid = isAmtValid && isDateValid && isPersonValid;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!isFormValid) return;

    setIsSubmitting(true);
    const formattedDate = date.split('-').reverse().join('/');
    const formattedPromise = promiseDate ? promiseDate.split('-').reverse().join('/') : '';

    try {
      await addTransaction({
        type,
        amount: parseFloat(amt),
        category: (type === 'EXPENSE' || type === 'INCOME') ? category : '',
        person: personName || '',
        date: formattedDate,
        promiseDate: formattedPromise,
        note,
        ref: refAc
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAddMenu = (targetView, categoryType = null) => {
    onClose();
    if (targetView === 'addCategory' && categoryType) {
      window.__BUDGET_BHARAT_NEW_CATEGORY_TYPE__ = categoryType;
    }
    setMenuView(targetView);
    setIsMenuOpen(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-theme-dark/60 backdrop-blur-sm flex items-end justify-center p-0"
      onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) onClose(); }}
    >
      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 max-h-[85%] overflow-y-auto relative shadow-2xl animate-slide-up hide-scrollbar" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-sm font-extrabold text-theme-dark uppercase tracking-wider">{translate("New Record")}</h2>
          <button onClick={onClose} className="w-8 h-8 bg-theme-gray rounded-full text-theme-dark/50 hover:bg-theme-dark hover:text-white active:scale-90 transition-all flex items-center justify-center"><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 bg-[#F4F3F8] rounded-xl mb-5 text-[10px] font-bold uppercase border border-[#E4E1EA]">
          {[
            { key: 'EXPENSE', label: 'EXPENSE' },
            { key: 'INCOME', label: 'INCOME' },
            { key: 'LENT', label: 'GIVEN' },
            { key: 'BORROW', label: 'RECEIVED' }
          ].map(item => {
            const getActiveTabClass = () => {
              if (type !== item.key) return 'text-[#625E70] hover:bg-white';
              if (item.key === 'EXPENSE') return 'bg-[#D6455D] text-white shadow-xs';
              if (item.key === 'INCOME') return 'bg-[#078A87] text-white shadow-xs';
              if (item.key === 'LENT') return 'bg-[#7B2B8C] text-white shadow-xs';
              return 'bg-[#B7791F] text-white shadow-xs';
            };
            return (
              <button key={item.key} type="button" onClick={() => setType(item.key)} className={`py-2.5 rounded-lg transition-all ${getActiveTabClass()}`}>{translate(item.label === 'GIVEN' ? 'Given' : item.label === 'RECEIVED' ? 'Received' : item.label === 'EXPENSE' ? 'Expense' : 'Income')}</button>
            );
          })}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[10px] font-extrabold text-[#625E70] uppercase tracking-wider">{translate("AMOUNT (₹) *")}</label>
            <div className="relative flex items-center">
              <span className="absolute left-4 text-[#8A8596] font-extrabold text-xl pointer-events-none select-none">₹</span>
              <input
                style={SELECT_STYLE}
                type="number"
                step="any"
                required
                value={amt}
                onChange={e => setAmt(e.target.value)}
                className={`w-full text-2xl font-black rounded-xl pl-11 pr-12 py-3 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                  touched && !isAmtValid
                    ? 'border-2 border-[#D6455D] bg-red-50/40 text-[#1E104B]'
                    : 'border border-[#E4E1EA] bg-[#F4F3F8] focus:bg-white focus:border-[#7B2B8C] focus:ring-2 focus:ring-[#7B2B8C]/15 text-[#1E104B]'
                }`}
                placeholder={translate("0.00")}
              />
              <button
                type="button"
                onClick={() => setShowCalculator(true)}
                title={translate("Open Calculator")}
                className="absolute right-3.5 text-[#7B2B8C] hover:text-[#5B1E68] active:scale-90 transition-transform p-1 flex items-center justify-center"
              >
                <i className="fa-solid fa-calculator text-xl"></i>
              </button>
            </div>
          </div>

          {showCalculator && (
            <CalculatorModal
              initialValue={amt}
              onApply={(calculatedValue) => setAmt(calculatedValue)}
              onClose={() => setShowCalculator(false)}
            />
          )}

          <div className="grid grid-cols-12 gap-2.5">
            <div className="col-span-5 space-y-1.5">
              <label className="block text-[10px] font-extrabold text-[#625E70] uppercase tracking-wider">{translate("DATE *")}</label>
              <AppDatePicker
                required={true}
                value={date}
                onChange={setDate}
                className={`w-full font-bold text-xs rounded-xl px-3 py-3 outline-none transition-all ${
                  touched && !isDateValid
                    ? 'border-2 border-[#D6455D] bg-red-50/40 text-[#1E104B]'
                    : 'border border-[#E4E1EA] bg-[#F4F3F8] focus:bg-white focus:border-[#7B2B8C] focus:ring-2 focus:ring-[#7B2B8C]/15 text-[#1E104B]'
                }`}
              />
            </div>

            {(type === 'LENT' || type === 'BORROW') ? (
              <div className="col-span-7 space-y-1.5">
                <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("PROMISE DATE")}</label>
                <AppDatePicker
                  value={promiseDate}
                  onChange={setPromiseDate}
                  className="w-full font-bold text-xs border border-theme-dark/20 rounded-xl px-3 py-3 outline-none focus:border-theme-dark focus:ring-2 focus:ring-theme-dark/15 transition-all bg-theme-gray focus:bg-white text-theme-dark cursor-pointer"
                />
              </div>
            ) : (
              <div className="col-span-7 space-y-1.5">
                <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("CATEGORY")}</label>
                <div className="flex gap-1.5">
                  <SearchableDropdown
                    value={category}
                    onChange={setCategory}
                    options={type === 'INCOME' ? categories.income : categories.expense}
                    placeholder={translate("Category...")}
                  />
                  <button type="button" onClick={() => openAddMenu('addCategory', type === 'INCOME' ? 'income' : 'expense')} className="w-10 h-10 flex-none rounded-xl bg-theme-gray border border-theme-dark/20 flex items-center justify-center text-[#66419C] hover:bg-[#66419C] hover:text-white transition-colors">
                    <i className="fa-solid fa-plus text-sm"></i>
                  </button>
                </div>
              </div>
            )}
          </div>

          {(type === 'LENT' || type === 'BORROW') && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("PERSON NAME *")}</label>
              <div className={`flex gap-2 rounded-xl ${touched && !isPersonValid ? 'ring-2 ring-[#D6455D]' : ''}`}>
                <SearchableDropdown
                  value={personName}
                  onChange={setPersonName}
                  options={persons.map(p => p.name)}
                  placeholder={translate("Type or select person...")}
                />
                <button type="button" onClick={() => openAddMenu('addPerson')} className="w-10 h-10 flex-none rounded-xl bg-[#F4F3F8] border border-[#E4E1EA] flex items-center justify-center text-[#7B2B8C] hover:bg-[#7B2B8C] hover:text-white transition-colors">
                  <i className="fa-solid fa-plus text-sm"></i>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("PURPOSE / DESCRIPTION")}</label>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full font-bold text-xs border border-theme-dark/20 rounded-xl px-3.5 py-3 outline-none focus:border-theme-dark focus:ring-2 focus:ring-theme-dark/15 transition-all bg-theme-gray focus:bg-white placeholder-theme-dark/30 text-theme-dark"
              placeholder={translate("e.g. for shopping, to EMI payment..")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-extrabold text-theme-dark/60 uppercase tracking-wider">{translate("REFERENCE / A/C MODE")}</label>
            <input
              type="text"
              value={refAc}
              onChange={e => setRefAc(e.target.value)}
              className="w-full font-bold text-xs border border-theme-dark/20 rounded-xl px-3.5 py-3 outline-none focus:border-theme-dark focus:ring-2 focus:ring-theme-dark/15 transition-all bg-theme-gray focus:bg-white placeholder-theme-dark/30 text-theme-dark"
              placeholder={translate("e.g. PhonePe, NetBanking, Cash...")}
            />
          </div>

          <div className="flex justify-center mt-5">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-44 py-3 rounded-full font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 border shadow-xs ${
                isSubmitting
                  ? 'bg-[#078A87] text-white border-[#078A87] shadow-[0_0_20px_rgba(7,138,135,0.45)] cursor-wait'
                  : isFormValid
                  ? 'bg-[#078A87] hover:bg-[#056E6C] active:bg-[#078A87] active:text-white text-white border-[#078A87] shadow-[#078A87]/25'
                  : 'bg-[#078A87]/15 text-[#078A87] hover:bg-[#078A87]/25 border-[#078A87]/25'
              }`}
            >
              {isSubmitting && <i className="fa-solid fa-spinner animate-spin text-xs"></i>}
              <span>{isSubmitting ? translate('Saving...') : translate('Save Entry')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const MainApp = () => {
  const { searchQuery, setSearchQuery, persons, transactions, loans, loading, loadError, refresh } = useContext(AppContext);
  const [tab, setTab] = useState('home');
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showInput, setShowInput] = useState(false);

  const [fabShowingAppIcon, setFabShowingAppIcon] = useState(true);

  useEffect(() => {
    const fabCycle = setInterval(() => {
      setFabShowingAppIcon(prev => !prev);
    }, 6000);

    return () => clearInterval(fabCycle);
  }, []);

  const [focusedLoan, setFocusedLoan] = useState({ person: null, loanId: null });

  const [viewMode, setViewMode] = useState('master');
  const [isCreatingLoan, setIsCreatingLoan] = useState(false);

  useEffect(() => {
    window.__TRIGGER_TAB__ = (targetTab) => {
      setSearchQuery('');
      setFocusedLoan({ person: null, loanId: null });
      setTab(targetTab);
    };
    window.__TRIGGER_LOAN__ = (personName, loanId) => {
      setSearchQuery('');
      setFocusedLoan({ person: personName, loanId: loanId });
      setTab('loans');
    };
  }, []);

  const fullPersonList = useMemo(() => {
    return persons.map(p => {
      let dr = 0, cr = 0;
      transactions.filter(t => t.person === p.name).forEach(t => {
        if (t.type === 'LENT') dr += t.amount;
        if (t.type === 'BORROW') cr += t.amount;
      });
      return { ...p, totalDr: dr, totalCr: cr, remaining: dr - cr };
    }).sort((a, b) => Math.abs(b.remaining) - Math.abs(a.remaining));
  }, [persons, transactions]);


  if (loadError) {
    return (
      <div className="app-shell">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-3 p-6">
          <i className="fa-solid fa-triangle-exclamation text-3xl text-red-400"></i>
          <p className="text-sm font-bold text-theme-dark">{translate("Couldn't load your data")}</p>
          <p className="text-xs text-theme-dark/60">{loadError}</p>
          <button onClick={() => refresh(true, true)} className="px-4 py-2 bg-theme-dark text-white rounded-xl text-xs font-bold shadow-md">{translate("Retry")}</button>
        </div>
      </div>
    );
  }

  if (selectedPerson) {
    const refreshedPerson = fullPersonList.find(p => p.name === selectedPerson.name);
    if (!refreshedPerson) {
      setTimeout(() => setSelectedPerson(null), 0);
      return null;
    }
    return (
      <div className="app-shell">
        <ErrorBoundary key={refreshedPerson.name} label={refreshedPerson.name + "'s ledger"} onReset={() => setSelectedPerson(null)}>
          <LedgerView
            person={refreshedPerson}
            onBack={() => setSelectedPerson(null)}
            onSelectPerson={setSelectedPerson}
            allPersons={fullPersonList}
            onSelectTransaction={setSelectedTransaction}
            onOpenAddRecord={() => setShowInput(true)}
          />
        </ErrorBoundary>

        {showInput && (
          <ErrorBoundary key="input-modal" label="New Entry" onReset={() => setShowInput(false)}>
            <InputModal onClose={() => setShowInput(false)} />
          </ErrorBoundary>
        )}
        {selectedTransaction && (
          <ErrorBoundary key="tx-modal" label="Transaction Details" onReset={() => setSelectedTransaction(null)}>
            <TransactionDetailModal
              tx={selectedTransaction}
              onClose={() => setSelectedTransaction(null)}
            />
          </ErrorBoundary>
        )}

        <div className="notched-nav-container select-none">
          <div className="notched-pill">
            <div className="flex items-center gap-7 sm:gap-9 pr-4">
              <button
                onClick={() => { setSelectedPerson(null); setTab('home'); }}
                className={`p-2 transition-all flex flex-col items-center active:scale-90 ${tab === 'home' ? 'text-[#07C0BE]' : 'text-white/50 hover:text-white'}`}
                title={translate("Home")}
              >
                <i className="fa-solid fa-house text-lg"></i>
                {tab === 'home' && (
                  <span
                    className="w-5 h-[1px] rounded-full bg-[#07C0BE] mt-1.5"
                    style={{ boxShadow: '0 -5px 12px 2.5px rgba(7, 192, 190, 0.55), 0 0 4px 1px rgba(7, 192, 190, 0.85)' }}
                  ></span>
                )}
              </button>
              <button
                onClick={() => { setSelectedPerson(null); setTab('people'); }}
                className={`p-2 transition-all flex flex-col items-center active:scale-90 ${tab === 'people' ? 'text-[#07C0BE]' : 'text-white/50 hover:text-white'}`}
                title={translate("Directory")}
              >
                <i className="fa-solid fa-users text-lg"></i>
                {tab === 'people' && (
                  <span
                    className="w-5 h-[1px] rounded-full bg-[#07C0BE] mt-1.5"
                    style={{ boxShadow: '0 -5px 12px 2.5px rgba(7, 192, 190, 0.55), 0 0 4px 1px rgba(7, 192, 190, 0.85)' }}
                  ></span>
                )}
              </button>
              <button
                onClick={() => { setSelectedPerson(null); setTab('loans'); }}
                className={`p-2 transition-all flex flex-col items-center active:scale-90 ${tab === 'loans' ? 'text-[#07C0BE]' : 'text-white/50 hover:text-white'}`}
                title={translate("Loans / EMIs")}
              >
                <i className="fa-solid fa-hand-holding-dollar text-lg"></i>
                {tab === 'loans' && (
                  <span
                    className="w-5 h-[1px] rounded-full bg-[#07C0BE] mt-1.5"
                    style={{ boxShadow: '0 -5px 12px 2.5px rgba(7, 192, 190, 0.55), 0 0 4px 1px rgba(7, 192, 190, 0.85)' }}
                  ></span>
                )}
              </button>
              <button
                onClick={() => { setSelectedPerson(null); setTab('records'); }}
                className={`p-2 transition-all flex flex-col items-center active:scale-90 ${tab === 'records' ? 'text-[#07C0BE]' : 'text-white/50 hover:text-white'}`}
                title={translate("Records")}
              >
                <i className="fa-solid fa-receipt text-lg"></i>
                {tab === 'records' && (
                  <span
                    className="w-5 h-[1px] rounded-full bg-[#07C0BE] mt-1.5"
                    style={{ boxShadow: '0 -5px 12px 2.5px rgba(7, 192, 190, 0.55), 0 0 4px 1px rgba(7, 192, 190, 0.85)' }}
                  ></span>
                )}
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowInput(true)}
            title={translate("Add New Entry")}
            className="notched-fab"
          >
            <span className="relative w-8 h-8 flex items-center justify-center">
              <img
                src={APP_ICON_WHITE}
                alt="Budget Bharat"
                className={`absolute w-8 h-8 object-contain transition-all duration-700 ${
                  fabShowingAppIcon
                    ? 'opacity-100 scale-100 rotate-0'
                    : 'opacity-0 scale-75 rotate-90'
                }`}
              />
              <span
                aria-hidden="true"
                className={`fab-heavy-plus absolute transition-all duration-700 ${
                  fabShowingAppIcon
                    ? 'opacity-0 scale-75 -rotate-90'
                    : 'opacity-100 scale-100 rotate-0'
                }`}
              ></span>
            </span>
          </button>
        </div>
      </div>
    );
  }

  const isIndvLoanDetail = tab === 'loans' && viewMode === 'detail' && !isCreatingLoan;

  return (
    <div className="app-shell">
      {!isIndvLoanDetail && <Header />}
      <SideMenu />

      <div className="app-content">
        {searchQuery.trim().length > 0 && !isIndvLoanDetail ? (
          <ErrorBoundary key="search" label="Search">
            <SearchView onSelectPerson={setSelectedPerson} onSelectTransaction={setSelectedTransaction} />
          </ErrorBoundary>
        ) : (
          <>
            {tab === 'home' && (
              <ErrorBoundary key="home" label="Home" onReset={() => refresh(false, false)}>
                <HomeView
                  onSelectPerson={setSelectedPerson}
                  onSelectTransaction={setSelectedTransaction}
                  onNavigateTab={(t) => {
                    if (window.__TRIGGER_TAB__) window.__TRIGGER_TAB__(t);
                    else setTab(t);
                  }}
                />
              </ErrorBoundary>
            )}
            {tab === 'people' && (
              <ErrorBoundary key="people" label="Persons">
                <PersonsView onSelectPerson={setSelectedPerson} />
              </ErrorBoundary>
            )}
            {tab === 'loans' && (
              <ErrorBoundary key={'loans-' + (focusedLoan.loanId || 'master')} label="Loans / EMIs" onReset={() => setFocusedLoan({ person: null, loanId: null })}>
                <LoanManagerView
                  key={focusedLoan.loanId || 'master'}
                  onSelectPerson={setSelectedPerson}
                  initialPersonFilter={focusedLoan.person}
                  initialLoanId={focusedLoan.loanId}
                  onClearLoanFocus={() => setFocusedLoan({ person: null, loanId: null })}
                  viewModeState={[viewMode, setViewMode]}
                  isCreatingLoanState={[isCreatingLoan, setIsCreatingLoan]}
                />
              </ErrorBoundary>
            )}
            {tab === 'records' && (
              <ErrorBoundary key="records" label="Records">
                <RecordsView onSelectTransaction={setSelectedTransaction} />
              </ErrorBoundary>
            )}
          </>
        )}
      </div>

      {showInput && (
        <ErrorBoundary key="input-modal" label="New Entry" onReset={() => setShowInput(false)}>
          <InputModal onClose={() => setShowInput(false)} />
        </ErrorBoundary>
      )}
      {selectedTransaction && (
        <ErrorBoundary key="tx-modal" label="Transaction Details" onReset={() => setSelectedTransaction(null)}>
          <TransactionDetailModal tx={selectedTransaction} onClose={() => setSelectedTransaction(null)} />
        </ErrorBoundary>
      )}

      <div className="notched-nav-container select-none">
        <div className="notched-pill">
          <div className="flex items-center gap-7 sm:gap-9 pr-4">
            <button
              onClick={() => setTab('home')}
              className={`p-2 transition-all flex flex-col items-center active:scale-90 ${tab === 'home' ? 'text-[#07C0BE]' : 'text-white/50 hover:text-white'}`}
              title={translate("Home")}
            >
              <i className="fa-solid fa-house text-lg"></i>
              {tab === 'home' && (
                <span
                  className="w-5 h-[1px] rounded-full bg-[#07C0BE] mt-1.5"
                  style={{ boxShadow: '0 -5px 12px 2.5px rgba(7, 192, 190, 0.55), 0 0 4px 1px rgba(7, 192, 190, 0.85)' }}
                ></span>
              )}
            </button>
            <button
              onClick={() => setTab('people')}
              className={`p-2 transition-all flex flex-col items-center active:scale-90 ${tab === 'people' ? 'text-[#07C0BE]' : 'text-white/50 hover:text-white'}`}
              title={translate("Directory")}
            >
              <i className="fa-solid fa-users text-lg"></i>
              {tab === 'people' && (
                <span
                  className="w-5 h-[1px] rounded-full bg-[#07C0BE] mt-1.5"
                  style={{ boxShadow: '0 -5px 12px 2.5px rgba(7, 192, 190, 0.55), 0 0 4px 1px rgba(7, 192, 190, 0.85)' }}
                ></span>
              )}
            </button>
            <button
              onClick={() => setTab('loans')}
              className={`p-2 transition-all flex flex-col items-center active:scale-90 ${tab === 'loans' ? 'text-[#07C0BE]' : 'text-white/50 hover:text-white'}`}
              title={translate("Loans / EMIs")}
            >
              <i className="fa-solid fa-hand-holding-dollar text-lg"></i>
              {tab === 'loans' && (
                <span
                  className="w-5 h-[1px] rounded-full bg-[#07C0BE] mt-1.5"
                  style={{ boxShadow: '0 -5px 12px 2.5px rgba(7, 192, 190, 0.55), 0 0 4px 1px rgba(7, 192, 190, 0.85)' }}
                ></span>
              )}
            </button>
            <button
              onClick={() => setTab('records')}
              className={`p-2 transition-all flex flex-col items-center active:scale-90 ${tab === 'records' ? 'text-[#07C0BE]' : 'text-white/50 hover:text-white'}`}
              title={translate("Records")}
            >
              <i className="fa-solid fa-receipt text-lg"></i>
              {tab === 'records' && (
                <span
                  className="w-5 h-[1px] rounded-full bg-[#07C0BE] mt-1.5"
                  style={{ boxShadow: '0 -5px 12px 2.5px rgba(7, 192, 190, 0.55), 0 0 4px 1px rgba(7, 192, 190, 0.85)' }}
                ></span>
              )}
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowInput(true)}
          title={translate("Add New Entry")}
          className="notched-fab"
        >
          <span className="relative w-8 h-8 flex items-center justify-center">
            <img
              src={APP_ICON_WHITE}
              alt="Budget Bharat"
              className={`absolute w-8 h-8 object-contain transition-all duration-700 ${
                fabShowingAppIcon
                  ? 'opacity-100 scale-100 rotate-0'
                  : 'opacity-0 scale-75 rotate-90'
              }`}
            />
            <span
              aria-hidden="true"
              className={`fab-heavy-plus absolute transition-all duration-700 ${
                fabShowingAppIcon
                  ? 'opacity-0 scale-75 -rotate-90'
                  : 'opacity-100 scale-100 rotate-0'
              }`}
            ></span>
          </span>
        </button>
      </div>
    </div>
  );
};

initDB().then(() => {
  createRoot(document.getElementById('root')).render(
    <ErrorBoundary label="Budget Bharat">
      <AppProvider>
        <MainApp />
      </AppProvider>
    </ErrorBoundary>
  );
});
