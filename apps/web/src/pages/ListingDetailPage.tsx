import { Link, useParams } from 'react-router-dom';
import { USER_ROLE_RANK, UserRole } from '@marketplace/shared';
import { useListingDetailQuery } from '../api/listings';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Gallery } from '../components/detail/Gallery';
import { optionLabel, riskTone, statusTone } from '../components/detail/labels';
import { conditionLabel, conditionTone } from '../components/catalog/conditionTone';
import { Badge, Button, EmptyState } from '../components/primitives';
import styles from './ListingDetailPage.module.css';

// Approve/reject stay inert placeholders: those moderation endpoints
// don't exist yet. Edit is real — MAR-40 gave it a form and PATCH exists.
export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: listing, isLoading, error } = useListingDetailQuery(id);

  if (isLoading) {
    return <EmptyState title="Loading…" />;
  }

  if (error || !listing) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <EmptyState
        title={notFound ? 'Listing not found' : 'Something went wrong'}
        description={notFound ? "This listing doesn't exist, or isn't visible to you." : 'Please try again.'}
      />
    );
  }

  // risk is only ever on the wire for a moderator (MAR-22) — presence
  // is the interim moderator-view signal until real roles exist (MAR-12).
  const isModeratorView = listing.risk !== null;
  const canEdit = !!user && (user.id === listing.contributorId || USER_ROLE_RANK[user.role] >= USER_ROLE_RANK[UserRole.MODERATOR]);

  return (
    <div className={styles.layout}>
      <Gallery photos={listing.photos} alt={listing.title} />

      <div>
        <div className={styles.badgeRow}>
          {isModeratorView && <Badge tone={statusTone(listing.status)}>{listing.status}</Badge>}
          <Badge tone={conditionTone(listing.condition)}>{conditionLabel(listing.condition)}</Badge>
        </div>

        <h1 className={styles.title}>{listing.title}</h1>
        <div className={styles.catRow}>{listing.category}</div>

        <div className={styles.priceRow}>
          <span className={styles.price}>${listing.price.toLocaleString()}</span>
          {listing.isNegotiable && <span className={styles.negotiable}>Negotiable</span>}
        </div>
        {listing.isNegotiable && listing.minPrice !== null && (
          <div className={styles.minPrice}>Minimum accepted: ${listing.minPrice.toLocaleString()}</div>
        )}

        <p className={styles.description}>{listing.description}</p>

        {listing.options.length > 0 && (
          <>
            <div className={styles.sectionLabel}>Options</div>
            <div className={styles.optionRow}>
              {listing.options.map((option) => (
                <Badge key={option} tone="neutral">
                  {optionLabel(option)}
                </Badge>
              ))}
            </div>
          </>
        )}

        {isModeratorView && listing.risk && (
          <div className={styles.moderatorSection}>
            <div className={styles.sectionLabel}>
              Risk assessment — <Badge tone={riskTone(listing.risk.level)}>{listing.risk.level}</Badge>
            </div>
            {listing.risk.reasons.length > 0 && (
              <ul className={styles.riskList}>
                {listing.risk.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <div className={styles.moderatorActions}>
              <Button variant="primary" disabled>
                Approve
              </Button>
              <Button variant="danger" disabled>
                Reject
              </Button>
            </div>
          </div>
        )}

        {canEdit && (
          <Button as={Link} to={`/listings/${listing.id}/edit`}>
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}
