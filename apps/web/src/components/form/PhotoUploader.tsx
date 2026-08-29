import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { LISTING_LIMITS, type PhotoContentType } from '@marketplace/shared';
import { presignPhotoUpload, uploadPhotoToS3 } from '../../api/uploads';
import { Button } from '../primitives';
import { generateLocalId } from './localId';
import { validatePhotoFile } from './validateListing';
import styles from './PhotoUploader.module.css';

export interface PhotoItem {
  id: string;
  // null while uploading or failed — only a 'done' item has a key,
  // and only 'done' items are ever sent as photoKeys on submit.
  key: string | null;
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

export interface PhotoUploaderProps {
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
  error?: string;
}

function updateItem(photos: PhotoItem[], id: string, patch: Partial<PhotoItem>): PhotoItem[] {
  return photos.map((p) => (p.id === id ? { ...p, ...patch } : p));
}

export function PhotoUploader({ photos, onChange, error }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Object URLs are only ever created here (edit-mode photos start from a
  // real S3 URL) — tracked separately so unmount doesn't revoke those.
  const createdUrls = useRef(new Set<string>());
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const [overflowMessage, setOverflowMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      createdUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  async function uploadOne(id: string, file: File) {
    try {
      // Only reachable for a file already passed through validatePhotoFile,
      // which is what guarantees file.type is one of the allowed values.
      const { url, key } = await presignPhotoUpload(file.type as PhotoContentType, file.size);
      await uploadPhotoToS3(url, file, (progress) => onChange(updateItem(photosRef.current, id, { progress })));
      onChange(updateItem(photosRef.current, id, { status: 'done', key, progress: 100 }));
    } catch {
      onChange(updateItem(photosRef.current, id, { status: 'error', error: 'Upload failed — try again.' }));
    }
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    const room = LISTING_LIMITS.photos.max - photos.length;
    const accepted = files.slice(0, Math.max(room, 0));
    const overflow = files.length - accepted.length;
    setOverflowMessage(
      overflow > 0 ? `Only ${LISTING_LIMITS.photos.max} photos allowed — ${overflow} file${overflow === 1 ? '' : 's'} not added.` : null,
    );

    const newItems: PhotoItem[] = accepted.map((file) => {
      const validationError = validatePhotoFile(file);
      const previewUrl = URL.createObjectURL(file);
      createdUrls.current.add(previewUrl);
      const id = generateLocalId();
      if (validationError) {
        return { id, key: null, previewUrl, status: 'error', progress: 0, error: validationError };
      }
      void uploadOne(id, file);
      return { id, key: null, previewUrl, status: 'uploading', progress: 0 };
    });

    onChange([...photos, ...newItems]);
  }

  function remove(id: string) {
    const target = photos.find((p) => p.id === id);
    if (target && createdUrls.current.has(target.previewUrl)) {
      URL.revokeObjectURL(target.previewUrl);
      createdUrls.current.delete(target.previewUrl);
    }
    onChange(photos.filter((p) => p.id !== id));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function makePrimary(index: number) {
    if (index === 0) return;
    const next = [...photos];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    onChange(next);
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>Photos</span>
      <div className={styles.grid}>
        {photos.map((photo, index) => (
          <div key={photo.id} className={styles.tile}>
            <img src={photo.previewUrl} alt="" className={styles.thumb} />
            {photo.status === 'uploading' && (
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${photo.progress}%` }} />
              </div>
            )}
            {photo.status === 'error' && <div className={styles.itemError}>{photo.error}</div>}
            {index === 0 && photo.status === 'done' && <span className={styles.primaryBadge}>Primary</span>}
            <div className={styles.tileActions}>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move earlier">
                ↑
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === photos.length - 1} aria-label="Move later">
                ↓
              </button>
              {index !== 0 && (
                <button type="button" onClick={() => makePrimary(index)}>
                  Make primary
                </button>
              )}
              <button type="button" onClick={() => remove(photo.id)} aria-label="Remove photo">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={handleFilesSelected}
      />
      <Button type="button" onClick={() => inputRef.current?.click()} disabled={photos.length >= LISTING_LIMITS.photos.max}>
        Add photos
      </Button>
      {overflowMessage && <span className={styles.error}>{overflowMessage}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </div>
  );
}
