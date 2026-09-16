import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const isNative = Capacitor.isNativePlatform();

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error || new Error('Unable to read export file.'));
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.readAsDataURL(blob);
});

const safeName = (name) => String(name || `budget-bharat-export-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');

const nativeShareFiles = async (files, title = 'Budget Bharat Export', text = '') => {
  const uris = [];
  for (const file of files) {
    if (!file) continue;
    const name = safeName(file.name);
    const base64 = await blobToBase64(file);
    await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache, recursive: true });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    uris.push(uri);
  }
  if (!uris.length) throw new Error('No export file was created.');
  await Share.share({ title, text, files: uris, dialogTitle: title });
};

if (isNative) {
  try {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) => Boolean(data?.files?.length)
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data = {}) => {
        const files = Array.from(data.files || []);
        if (!files.length) return Share.share({ title: data.title, text: data.text });
        await nativeShareFiles(files, data.title || files[0]?.name || 'Budget Bharat Export', data.text || '');
      }
    });
  } catch (e) {
    console.warn('Native share bridge could not be installed.', e);
  }

  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const anchor = this;
    const href = anchor.getAttribute('href') || '';
    const filename = anchor.getAttribute('download');
    if (filename && href.startsWith('blob:')) {
      fetch(href)
        .then(response => {
          if (!response.ok) throw new Error(`Export download failed (${response.status}).`);
          return response.blob();
        })
        .then(blob => nativeShareFiles([new File([blob], filename, { type: blob.type || 'application/octet-stream' })], filename, 'Budget Bharat Export'))
        .catch(error => console.error('Native export failed:', error));
      return;
    }
    return originalClick.call(anchor);
  };
}
