import Tesseract from 'tesseract.js';

function preprocessImageForOcr(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        // Upscale small images slightly for sharper OCR text recognition
        const scale = img.width < 1200 ? Math.min(2, 1400 / Math.max(img.width, 1)) : 1;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to high-contrast grayscale
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const contrast = 1.35;
        const intercept = 128 * (1 - contrast);

        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const boosted = Math.max(0, Math.min(255, gray * contrast + intercept));
          data[i] = boosted;
          data[i + 1] = boosted;
          data[i + 2] = boosted;
        }
        ctx.putImageData(imageData, 0, 0);

        URL.revokeObjectURL(url);
        resolve(canvas);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

export async function extractTextFromImage(file, onProgress) {
  const source = await preprocessImageForOcr(file);
  const result = await Tesseract.recognize(source, 'eng', {
    logger: (info) => {
      if (onProgress && info.status) {
        const pct = typeof info.progress === 'number' ? Math.round(info.progress * 100) : null;
        onProgress(info.status, pct);
      }
    },
  });
  return result?.data?.text || '';
}
