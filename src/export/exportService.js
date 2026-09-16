import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { toJpeg } from 'html-to-image';

export const EXPORT_STATUS = Object.freeze({
  SUCCESS_SHARED: 'SUCCESS_SHARED',
  SUCCESS_SAVED: 'SUCCESS_SAVED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED'
});

const isNative = () => Capacitor.isNativePlatform();

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read generated export.'));
  reader.readAsDataURL(blob);
});

const dataUrlToBase64 = (dataUrl) => {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Generated export data is invalid.');
  return dataUrl.slice(comma + 1);
};

const normalizeFilename = (filename, extension = 'jpg') => {
  const raw = String(filename || `budget_bharat_export_${Date.now()}`).trim();
  return /\.[a-z0-9]+$/i.test(raw) ? raw : `${raw}.${extension}`;
};

const isAbortError = (error) => {
  const name = String(error?.name || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return name === 'aborterror' || message.includes('cancel') || message.includes('dismiss');
};

const browserSave = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return EXPORT_STATUS.SUCCESS_SAVED;
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const renderDomToJpeg = async (element, options = {}) => {
  if (!element) throw new Error('Export target not found.');
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch (_) {}
  }

  const rect = element.getBoundingClientRect?.() || {};
  const width = Math.ceil(rect.width || element.offsetWidth || 720);
  const height = Math.ceil(rect.height || element.offsetHeight || element.scrollHeight || 800);
  const scale = options.scale || (height > 2500 ? 1.2 : height > 1500 ? 1.5 : 2);

  return toJpeg(element, {
    quality: options.quality ?? 0.9,
    backgroundColor: options.backgroundColor || '#FFFFFF',
    pixelRatio: scale,
    cacheBust: true,
    width,
    height,
    canvasWidth: Math.round(width * scale),
    canvasHeight: Math.round(height * scale),
    skipFonts: false,
    style: options.style || undefined
  });
};

export const saveBlobNative = async (blob, filename) => {
  const safeName = normalizeFilename(filename);
  if (!isNative()) return browserSave(blob, safeName);

  const dataUrl = await blobToDataUrl(blob);
  await Filesystem.writeFile({
    path: safeName,
    data: dataUrlToBase64(dataUrl),
    directory: Directory.Cache,
    recursive: true
  });
  return EXPORT_STATUS.SUCCESS_SAVED;
};

export const shareBlob = async (blob, filename, title = 'Budget Bharat Export', text = '') => {
  const safeName = normalizeFilename(filename);

  if (!isNative()) {
    const file = new File([blob], safeName, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title, text });
        return EXPORT_STATUS.SUCCESS_SHARED;
      } catch (error) {
        if (isAbortError(error)) return EXPORT_STATUS.CANCELLED;
        throw error;
      }
    }
    return browserSave(blob, safeName);
  }

  const dataUrl = await blobToDataUrl(blob);
  await Filesystem.writeFile({
    path: safeName,
    data: dataUrlToBase64(dataUrl),
    directory: Directory.Cache,
    recursive: true
  });
  const uriResult = await Filesystem.getUri({ path: safeName, directory: Directory.Cache });

  try {
    await Share.share({
      title,
      text,
      files: [uriResult.uri],
      dialogTitle: title
    });
    return EXPORT_STATUS.SUCCESS_SHARED;
  } catch (error) {
    if (isAbortError(error)) return EXPORT_STATUS.CANCELLED;
    throw error;
  }
};

export const exportDomAsJpeg = async (element, {
  filename,
  title = 'Budget Bharat Export',
  text = '',
  quality = 0.9,
  backgroundColor = '#FFFFFF',
  scale
} = {}) => {
  try {
    const dataUrl = await renderDomToJpeg(element, { quality, backgroundColor, scale });
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const result = await shareBlob(blob, filename, title, text);
    return { status: result, filename: normalizeFilename(filename) };
  } catch (error) {
    if (isAbortError(error)) return { status: EXPORT_STATUS.CANCELLED, filename: normalizeFilename(filename) };
    return { status: EXPORT_STATUS.FAILED, filename: normalizeFilename(filename), error };
  }
};
