import { useEffect, useRef } from 'react';
import { useCatalogQuery } from '../api/listings';
import { FilterBar } from '../components/catalog/FilterBar';
import { ListingCard } from '../components/catalog/ListingCard';
import { useCatalogFilters } from '../components/catalog/useCatalogFilters';
import { Button, EmptyState, Skeleton } from '../components/primitives';
import styles from './CatalogPage.module.css';

const SKELETON_COUNT = 8;

export default function CatalogPage() {
  const { filters } = useCatalogFilters();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useCatalogQuery(filters);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Intersection-observer auto-load is a progressive enhancement over the
  // Load more button below — same fetchNextPage, just triggered by scroll.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      <FilterBar />

      {isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <Skeleton width="100%" height={172} radius="0" />
              <div className={styles.skeletonBody}>
                <Skeleton width="40%" height={12} />
                <Skeleton width="80%" height={16} />
                <Skeleton width="30%" height={20} />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No listings match your filters" description="Try widening your search or clearing a filter." />
      ) : (
        <>
          <p className={styles.resultCount}>
            {items.length} listing{items.length === 1 ? '' : 's'}
            {hasNextPage ? '+' : ''}
          </p>
          <div className={styles.grid}>
            {items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
          {hasNextPage && (
            <div className={styles.loadMoreRow}>
              <Button variant="primary" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
        </>
      )}
    </div>
  );
}
