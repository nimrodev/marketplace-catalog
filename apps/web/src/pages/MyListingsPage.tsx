import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCatalogQuery } from '../api/listings';
import { FilterBar } from '../components/catalog/FilterBar';
import { ListingCard } from '../components/catalog/ListingCard';
import { useCatalogFilters } from '../components/catalog/useCatalogFilters';
import { Button, EmptyState, Skeleton } from '../components/primitives';
import styles from './CatalogPage.module.css';

const SKELETON_COUNT = 4;

export default function MyListingsPage() {
  const { filters } = useCatalogFilters();
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useCatalogQuery({
    ...filters,
    mine: true,
  });
  const sentinelRef = useRef<HTMLDivElement>(null);

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
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div>
      <h1>My listings</h1>
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
        hasFilters ? (
          <EmptyState title="No listings match your filters" description="Try widening your search or clearing a filter." />
        ) : (
          <EmptyState
            title="You haven't submitted anything yet"
            description="Once you submit a listing, it'll show up here — pending, published, or rejected."
            action={
              <Button as={Link} to="/submit" variant="primary">
                Submit a listing
              </Button>
            }
          />
        )
      ) : (
        <>
          <div className={styles.grid}>
            {items.map((listing) => (
              <ListingCard key={listing.id} listing={listing} showStatus />
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
