import { useState, type KeyboardEvent } from 'react';
import type { ListingPhoto } from '@marketplace/shared';
import { cx } from '../cx';
import styles from './Gallery.module.css';

export interface GalleryProps {
  photos: ListingPhoto[];
  alt: string;
}

// Single photo: no thumbnail row — nothing to navigate between.
export function Gallery({ photos, alt }: GalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = photos[activeIndex];

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') {
      setActiveIndex((i) => (i + 1) % photos.length);
    } else if (e.key === 'ArrowLeft') {
      setActiveIndex((i) => (i - 1 + photos.length) % photos.length);
    }
  }

  return (
    <div>
      <div className={styles.main}>{active && <img src={active.url} alt={alt} />}</div>
      {photos.length > 1 && (
        <div className={styles.thumbs} role="tablist" aria-label="Photos" onKeyDown={onKeyDown}>
          {photos.map((photo, i) => (
            <button
              key={photo.sortOrder}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              className={cx(styles.thumb, i === activeIndex && styles.thumbActive)}
              onClick={() => setActiveIndex(i)}
            >
              <img src={photo.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
