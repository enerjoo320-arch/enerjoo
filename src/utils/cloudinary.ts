/**
 * Cloudinary Upload Utility
 * This handles uploading files to Cloudinary using Unsigned Uploads.
 */

export async function uploadFile(file: File): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  // Graceful fail if not configured
  if (!cloudName || !uploadPreset) {
    console.warn('Cloudinary configuration missing. Using local URL as fallback.');
    return URL.createObjectURL(file);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    const data: any = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to upload to Cloudinary');
    }

    return data.secure_url;
  } catch (error) {
    console.error('Cloudinary Upload Error:', error);
    // Fallback to local URL so the app doesn't crash during demo
    return URL.createObjectURL(file);
  }
}
