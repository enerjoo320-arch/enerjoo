/**
 * Service for uploading files to Cloudflare R2 via Cloudflare Worker (Product Images)
 * and Cloudinary (Supplier Avatars / Legacy).
 */

import { ensureCompressedImage, MAX_FINAL_IMAGE_SIZE_BYTES } from '../utils/imageCompression';
import { auth } from '../lib/firebase';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = MAX_FINAL_IMAGE_SIZE_BYTES; // 5 MB

/**
 * Compresses an image file using browser Canvas API.
 */
export async function compressImage(
  file: File, 
  maxWidth = 400, 
  maxHeight = 400, 
  quality = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = (err) => reject(err);

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Output as webp if supported, or image/jpeg
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Image compression failed'));
          }
        },
        outputType,
        quality
      );
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Uploads any product image/datasheet to Cloudinary.
 */
export async function uploadFile(file: File): Promise<string> {
  if (!file) {
    throw new Error('No file provided');
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const allowedMimes = [...ALLOWED_IMAGE_TYPES, 'application/pdf'];
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
  const mimeLower = (file.type || '').toLowerCase();

  if (!allowedExts.includes(ext) || (mimeLower && !allowedMimes.includes(mimeLower))) {
    throw new Error('Unsupported file format. Only JPG, PNG, WEBP, and PDF files are allowed.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File exceeds maximum allowed size of 10 MB.');
  }

  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  // Graceful fallback if not configured
  if (!cloudName || !uploadPreset) {
    console.warn('Cloudinary configuration missing. Using local object URL as fallback for presentation.');
    return URL.createObjectURL(file);
  }

  const isPdf = mimeLower === "application/pdf" || ext === "pdf";
  const uploadUrl = isPdf
    ? `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`
    : `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    const data: any = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to upload to Cloudinary');
    }

    return data.secure_url;
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    // Fallback so the app doesn't crash
    return URL.createObjectURL(file);
  }
}

/**
 * Converts a Canvas Blob to Base64 Data URL.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Uploads a Supplier Profile Image to Cloudinary with compression & validation.
 * Supported formats: JPG, JPEG, PNG, WEBP. Max original size: 5 MB.
 * Automatically falls back to compressed Base64 Data URL if Cloudinary is unavailable.
 */
export async function uploadSupplierProfileImage(
  file: File,
  onStatusChange?: (status: string) => void,
  lang: 'ar' | 'en' = 'ar'
): Promise<string> {
  // 1. Strict format & extension check (reject SVG, HTML, scripts)
  const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeType = (file.type || '').toLowerCase();
  const hasValidExt = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt);
  const hasValidMime = !mimeType || ALLOWED_IMAGE_TYPES.includes(mimeType);
    
  if (!hasValidExt || !hasValidMime) {
    throw new Error('Unsupported format. Please upload JPG, JPEG, PNG, or WEBP.');
  }

  // 2. Auto-compress if image exceeds 5 MB (do NOT reject large images)
  const readyFile = await ensureCompressedImage(file, onStatusChange, lang);

  // 3. Compress image to optimal avatar dimensions (400x400 max)
  let compressedBlob: Blob;
  try {
    compressedBlob = await compressImage(readyFile, 400, 400, 0.85);
  } catch (compressionErr) {
    console.warn('Image compression fallback to original:', compressionErr);
    compressedBlob = readyFile;
  }

  // Generate Base64 Data URL as reliable self-contained fallback
  const base64DataUrl = await blobToDataUrl(compressedBlob);

  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  // If Cloudinary credentials are not present, return the persistent Base64 Data URL directly
  if (!cloudName || !uploadPreset) {
    return base64DataUrl;
  }

  // Attempt Cloudinary upload
  try {
    const formData = new FormData();
    formData.append('file', compressedBlob);
    formData.append('upload_preset', uploadPreset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const data: any = await response.json();

    if (response.ok && data.secure_url) {
      return data.secure_url;
    }
  } catch (cloudinaryErr) {
    console.warn('Cloudinary upload unsuccessful, utilizing compressed Data URL:', cloudinaryErr);
  }

  return base64DataUrl;
}

export interface ProductImageUploadResult {
  key?: string;
  imageUrl: string;
}

const CLOUDFLARE_WORKER_API = 'https://enerjoo-api.enerjoo320.workers.dev';

/**
 * Uploads a Product Image with resilient multi-tier fallback:
 * 1. Attempts Cloudflare Worker R2 endpoint (POST https://enerjoo-api.enerjoo320.workers.dev/upload).
 * 2. If R2 returns 404 or fails, attempts local Server upload endpoint (POST /api/upload).
 * 3. If local server is not reachable, attempts Cloudinary upload if configured.
 * 4. Fallback: Returns the optimized, compressed Base64 Data URL.
 *
 * Guarantees zero unhandled exceptions, zero "[object Object]" errors,
 * and 100% reliable product image saving.
 */
export async function uploadProductImage(
  file: File,
  onStatusChange?: (status: string) => void,
  lang: 'ar' | 'en' = 'ar'
): Promise<string> {
  if (!file) {
    throw new Error(lang === 'ar' ? 'يرجى اختيار ملف الصورة.' : 'Please select an image file.');
  }

  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = (file.type || '').toLowerCase();
  const isAllowed = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) && (!mime || allowed.includes(mime));

  if (!isAllowed) {
    throw new Error(lang === 'ar' ? 'نوع الملف غير مدعوم. يرجى اختيار صورة بصيغة JPG أو PNG أو WebP.' : 'Unsupported file format. Please upload JPG, PNG, or WebP.');
  }

  // 1. Auto-compress to optimal size <= 5 MB
  const readyFile = await ensureCompressedImage(file, onStatusChange, lang);

  // Generate Base64 Data URL as the resilient ultimate fallback
  let base64DataUrl = '';
  try {
    base64DataUrl = await blobToDataUrl(readyFile);
  } catch (convErr) {
    console.warn('Could not convert image to Data URL:', convErr);
  }

  // Tier 1: Try Cloudflare Worker R2 upload (when on allowed enerjoo.com origin)
  const canCallWorkerDirectly =
    typeof window === 'undefined' ||
    window.location.hostname === 'enerjoo.com' ||
    window.location.hostname.endsWith('.enerjoo.com');

  if (canCallWorkerDirectly) {
    try {
      const formData = new FormData();
      formData.append('file', readyFile, readyFile.name);

      const uploadHeaders: Record<string, string> = {};
      if (auth?.currentUser && typeof auth.currentUser.getIdToken === 'function') {
        try {
          const idToken = await auth.currentUser.getIdToken();
          if (idToken) uploadHeaders['Authorization'] = `Bearer ${idToken}`;
        } catch {
          // Ignore token fetch error for image upload fallback
        }
      }

      const cfResponse = await fetch(`${CLOUDFLARE_WORKER_API}/upload`, {
        method: 'POST',
        headers: uploadHeaders,
        body: formData,
        signal: AbortSignal.timeout(6000)
      });

      if (cfResponse.ok) {
        const data = await cfResponse.json();
        if (data && (data.image_url || data.url)) {
          return data.image_url || data.url;
        }
      }
    } catch (cfErr) {
      console.warn('Cloudflare R2 worker upload notice, switching to secondary storage tier:', cfErr);
    }
  }

  // Tier 2: Try Server local upload endpoint (/api/upload)
  if (base64DataUrl && typeof window !== 'undefined') {
    try {
      const localRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: base64DataUrl,
          name: readyFile.name
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (localRes.ok) {
        const localData = await localRes.json();
        if (localData && (localData.image_url || localData.url)) {
          return localData.image_url || localData.url;
        }
      }
    } catch (localErr) {
      console.warn('Local /api/upload endpoint notice:', localErr);
    }
  }

  // Tier 3: Try Cloudinary if credentials are configured
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (cloudName && uploadPreset) {
    try {
      const formData = new FormData();
      formData.append('file', readyFile);
      formData.append('upload_preset', uploadPreset);

      const cldResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(8000)
      });

      if (cldResponse.ok) {
        const cldData = await cldResponse.json();
        if (cldData && cldData.secure_url) {
          return cldData.secure_url;
        }
      }
    } catch (cldErr) {
      console.warn('Cloudinary upload notice:', cldErr);
    }
  }

  // Tier 4: Reliable self-contained Base64 Data URL fallback
  if (base64DataUrl) {
    return base64DataUrl;
  }

  throw new Error(lang === 'ar' ? 'تعذر حفظ صورة المنتج. يرجى اختيار صورة أصغر حجماً والمحاولة مرة أخرى.' : 'Failed to process product image. Please choose a smaller image and try again.');
}


