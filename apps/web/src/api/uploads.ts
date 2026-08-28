import type { PhotoContentType, PresignResponse } from '@marketplace/shared';
import { apiClient } from './client';

export function presignPhotoUpload(contentType: PhotoContentType, contentLength: number): Promise<PresignResponse> {
  return apiClient.post<PresignResponse>('/uploads/presign', { contentType, contentLength });
}

// XHR, not fetch: fetch exposes no upload-progress event.
export function uploadPhotoToS3(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Photo upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Photo upload failed'));
    xhr.send(file);
  });
}
