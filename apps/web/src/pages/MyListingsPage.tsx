import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ListingStatus } from '@marketplace/shared';
import { useCatalogQuery } from '../api/listings';
import { FilterBar } from '../components/catalog/FilterBar';
import { ListingCard } from '../components/catalog/ListingCard';
import { StatusTabs, type StatusTab } from '../components/catalog/StatusTabs';
import { useCatalogFilters } from '../components/catalog/useCatalogFilters';
import { Button, EmptyState, Skeleton } from '../components/primitives';
import styles from './CatalogPage.module.css';

const SKELETON_COUNT = 4;

type Tab = ListingStatus | 'ALL';

const TABS: StatusTab<Tab>[] = [
  { value: 'ALL', label: 'All' },
  { value: ListingStatus.PENDING, label: 'Pending' },
  { value: ListingStatus.PUBLISHED, label: 'Published' },
  { value: ListingStatus.REJECTED, label: 'Rejected', tone: 'rejected' },
];

export default function MyListingsPage() {
  const { filters, updateFilters } = useCatalogFilters();
  const activeTab = filters.status ?? 'ALL';
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
  // Status is a tab, not one of the filters this message is about — a
  // narrow status tab alone shouldn't read as "your filters excluded
  // everything," it's just an empty bucket.
  const hasOtherFilters = Object.keys(filters).some((key) => key !== 'status');

  return (
    <div>
      <h1>My listings</h1>
      <StatusTabs
        tabs={TABS}
        active={activeTab}
        onChange={(value) => updateFilters({ status: value === 'ALL' ? undefined : value })}
      />
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
        hasOtherFilters ? (
          <EmptyState title="No listings match your filters" description="Try widening your search or clearing a filter." />
        ) : activeTab !== 'ALL' ? (
          <EmptyState title={`No ${activeTab.toLowerCase()} listings`} description="Nothing in this status right now." />
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
