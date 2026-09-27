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

const DEVICE_CONTACTS_CACHE_KEY = 'budget_bharat_device_contacts_v1';
const normalizeDeviceContact = (contact) => ({
  contactId: contact?.id || contact?.rawId || '',
  _name: String(
    contact?.displayName ||
    [contact?.name?.givenName, contact?.name?.middleName, contact?.name?.familyName]
      .filter(Boolean).join(' ') ||
    ''
  ).trim(),
  _phone: String(
    contact?.phoneNumbers?.find(p => p?.value)?.value || ''
  ).trim(),
  _email: String(
    contact?.emails?.find(e => e?.value)?.value || ''
  ).trim(),
  _address: String(
    contact?.addresses?.find(a => a?.formatted || a?.street)?.formatted ||
    contact?.addresses?.find(a => a?.formatted || a?.street)?.street ||
    ''
  ).trim(),
});

const readCachedDeviceContacts = () => {
  try {
    const raw = localStorage.getItem(DEVICE_CONTACTS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const cacheDeviceContacts = (contacts) => {
  try {
    localStorage.setItem(DEVICE_CONTACTS_CACHE_KEY, JSON.stringify(contacts || []));
  } catch (err) {
    console.warn('Unable to cache device contacts:', err);
  }
};

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
            Try Again
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
    const textMsg = 'Hi Bharat, i need help regarding..';
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
        Developed by - Bharat Rasve © 2026
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

const formatMoney = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(val || 0);
const formatTableNum = (val) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(val || 0));
const toProperCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
};

const parseDate = (dStr) => {
  if (!dStr) return new Date(0);
  if (dStr instanceof Date) return dStr;
  const s = String(dStr).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = m[3].length === 2 ? parseInt('20' + m[3], 10) : parseInt(m[3], 10);
    return new Date(year, month, day);
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

const formatDisplayDate = (dStr) => {
  if (!dStr) return '-';
  let day, monthIdx, yy;
  if (dStr instanceof Date) {
    day = dStr.getDate();
    monthIdx = dStr.getMonth();
    yy = String(dStr.getFullYear()).slice(-2);
  } else {
    const s = String(dStr).trim();
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      day = parseInt(m[1], 10);
      monthIdx = parseInt(m[2], 10) - 1;
      yy = m[3].length === 4 ? m[3].slice(-2) : m[3];
    } else {
      const d = new Date(s);
      if (isNaN(d.getTime())) return dStr;
      day = d.getDate();
      monthIdx = d.getMonth();
      yy = String(d.getFullYear()).slice(-2);
    }
  }
  return `${String(day).padStart(2, '0')} ${MONTHS_SHORT[monthIdx] || ''} '${yy}`;
};

