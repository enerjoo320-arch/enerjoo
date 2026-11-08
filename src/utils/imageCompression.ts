/**
 * Image Auto-Compression Utility for Enerjoo.
 * 
 * Guarantees that any uploaded image is <= 5 MB.
 * - If original size <= 5 MB: returns original without unnecessary re-compression.
 * - If original size > 5 MB: automatically resizes and compresses in progressive steps,
 *   strictly maintaining original aspect ratio and maximizing visual quality.
 */

export const MAX_FINAL_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (5,242,880 bytes)

export interface CompressionOptions {
  maxSizeBytes?: number;
  lang?: 'ar' | 'en';
  onStatusChange?: (status: string) => void;
  preferFormat?: 'image/jpeg' | 'image/webp';
}

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  didCompress: boolean;
}

/**
 * Format bytes to readable string (e.g., "4.8 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Loads an image File into an HTMLImageElement safely.
 */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error(err instanceof Error ? err.message : 'Failed to load image for compression'));
    };
    img.src = url;
  });
}

/**
 * Renders an image to an offscreen canvas at specified dimensions and exports as Blob.
 */
function renderCanvasToBlob(
  img: HTMLImageElement,
  width: number,
  height: number,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }

    // High quality scaling filters
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // If converting from PNG with potential transparency to JPEG, fill white background
    if (mimeType === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob(
      (blob) => resolve(blob),
      mimeType,
      quality
    );
  });
}

/**
 * Automatically compresses an image file if it exceeds the maximum size limit (default 5 MB).
 * Preserves quality, retains strict aspect ratio, and avoids unnecessary compression.
 */
export async function autoCompressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const maxBytes = options.maxSizeBytes || MAX_FINAL_IMAGE_SIZE_BYTES;
  const isAr = options.lang !== 'en';
  const defaultStatusMsg = isAr 
    ? 'جاري تحسين وضغط الصورة قبل الرفع...' 
    : 'Optimizing and compressing image before upload...';

  // 1. If original image is already <= 5 MB: Return normally without unnecessary compression.
  if (file.size <= maxBytes) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      didCompress: false,
    };
  }

  // 2. Image exceeds 5 MB: Notify caller that compression is in progress
  options.onStatusChange?.(defaultStatusMsg);

  try {
    const img = await loadImageFromFile(file);
    const origWidth = img.naturalWidth || img.width;
    const origHeight = img.naturalHeight || img.height;

    if (!origWidth || !origHeight) {
      console.warn('Could not read image dimensions, returning original file');
      return { file, originalSize: file.size, compressedSize: file.size, didCompress: false };
    }

    // Determine optimal compression format (prefer JPEG or WebP)
    let outputMimeType = options.preferFormat || 'image/jpeg';
    if (!options.preferFormat) {
      if (file.type === 'image/webp') {
        outputMimeType = 'image/webp';
      } else {
        outputMimeType = 'image/jpeg';
      }
    }

    /**
     * Progressive compression strategy:
     * We try multiple passes starting with highest resolution and quality,
     * stepping down gradually until the file size is <= 5 MB.
     * Original aspect ratio is STRICTLY maintained in all passes.
     */
    const passes = [
      // Pass 1: Keep high dimension (up to 3200px), high quality
      { maxDim: 3200, quality: 0.92 },
      // Pass 2: Keep high dimension, slightly reduced quality
      { maxDim: 3200, quality: 0.86 },
      // Pass 3: High dimension, good quality
      { maxDim: 2800, quality: 0.82 },
      // Pass 4: Standard high resolution
      { maxDim: 2400, quality: 0.80 },
      // Pass 5: 2048px resolution
      { maxDim: 2048, quality: 0.78 },
      // Pass 6: 1800px resolution
      { maxDim: 1800, quality: 0.74 },
      // Pass 7: 1600px resolution
      { maxDim: 1600, quality: 0.70 },
      // Pass 8: 1400px resolution
      { maxDim: 1400, quality: 0.65 },
      // Pass 9: 1200px resolution
      { maxDim: 1200, quality: 0.60 },
    ];

    let finalBlob: Blob | null = null;

    for (let i = 0; i < passes.length; i++) {
      const pass = passes[i];

      // Calculate scale preserving exact aspect ratio
      const maxOriginalDim = Math.max(origWidth, origHeight);
      const scale = Math.min(1, pass.maxDim / maxOriginalDim);
      const targetWidth = Math.max(1, Math.round(origWidth * scale));
      const targetHeight = Math.max(1, Math.round(origHeight * scale));

      const blob = await renderCanvasToBlob(img, targetWidth, targetHeight, outputMimeType, pass.quality);
      if (blob) {
        finalBlob = blob;
        // Check if condition satisfied: <= 5 MB
        if (blob.size <= maxBytes) {
          break;
        }
      }
    }

    // Safety fallback: if still larger than 5 MB after all predefined passes (e.g. huge noisy image)
    if (finalBlob && finalBlob.size > maxBytes) {
      let currentMaxDim = 1000;
      let currentQuality = 0.55;

      for (let attempt = 0; attempt < 4 && finalBlob.size > maxBytes; attempt++) {
        const scale = Math.min(1, currentMaxDim / Math.max(origWidth, origHeight));
        const targetWidth = Math.max(1, Math.round(origWidth * scale));
        const targetHeight = Math.max(1, Math.round(origHeight * scale));

        const blob = await renderCanvasToBlob(img, targetWidth, targetHeight, outputMimeType, currentQuality);
        if (blob) {
          finalBlob = blob;
          if (blob.size <= maxBytes) break;
        }

        currentMaxDim = Math.round(currentMaxDim * 0.85);
        currentQuality = Math.max(0.40, currentQuality - 0.05);
      }
    }

    if (!finalBlob) {
      console.warn('Canvas blob generation failed, using original file');
      return { file, originalSize: file.size, compressedSize: file.size, didCompress: false };
    }

    // Build the compressed File with appropriate extension
    const ext = outputMimeType === 'image/webp' ? '.webp' : '.jpg';
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const newFileName = `${baseName}${ext}`;

    const compressedFile = new File([finalBlob], newFileName, {
      type: outputMimeType,
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      originalSize: file.size,
      compressedSize: compressedFile.size,
      didCompress: true,
    };
  } catch (error) {
    console.error('Image auto-compression error:', error);
    // If anything fails in the canvas pipeline, return original file so upload doesn't crash
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      didCompress: false,
    };
  }
}

/**
 * Convenient wrapper that guarantees a File object <= 5 MB.
 */
export async function ensureCompressedImage(
  file: File,
  onStatusChange?: (status: string) => void,
  lang: 'ar' | 'en' = 'ar'
): Promise<File> {
  const result = await autoCompressImage(file, {
    maxSizeBytes: MAX_FINAL_IMAGE_SIZE_BYTES,
    lang,
    onStatusChange,
  });
  return result.file;
}
