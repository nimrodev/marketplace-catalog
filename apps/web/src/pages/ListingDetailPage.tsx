import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MODERATION_LIMITS, ListingStatus, USER_ROLE_RANK, UserRole } from '@marketplace/shared';
import { useApproveListingMutation, useRejectListingMutation } from '../api/moderation';
import { useListingDetailQuery } from '../api/listings';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Gallery } from '../components/detail/Gallery';
import { categoryLabel, optionLabel, riskTone, statusTone } from '../components/detail/labels';
import { conditionLabel, conditionTone } from '../components/catalog/conditionTone';
import { Badge, Button, EmptyState, Modal } from '../components/primitives';
import styles from './ListingDetailPage.module.css';

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: listing, isLoading, error } = useListingDetailQuery(id);
  const approve = useApproveListingMutation();
  const reject = useRejectListingMutation();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const backButton = (
    <Button variant="ghost" onClick={() => navigate(-1)} className={styles.backButton}>
      ← Back
    </Button>
  );

  if (isLoading) {
    return (
      <div>
        {backButton}
        <EmptyState title="Loading…" />
      </div>
    );
  }

  if (error || !listing) {
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <div>
        {backButton}
        <EmptyState
          title={notFound ? 'Listing not found' : 'Something went wrong'}
          description={notFound ? "This listing doesn't exist, or isn't visible to you." : 'Please try again.'}
        />
      </div>
    );
  }

  const isModeratorView = !!user && USER_ROLE_RANK[user.role] >= USER_ROLE_RANK[UserRole.MODERATOR];
  const isOwner = !!user && user.id === listing.contributorId;
  const canEdit = !!user && (isOwner || isModeratorView);
  const canDecide = isModeratorView && listing.status === ListingStatus.PENDING;

  function refetchListing() {
    queryClient.invalidateQueries({ queryKey: ['listing', listing!.id] });
  }

  function handleApprove() {
    approve.mutate(listing!.id, { onSuccess: refetchListing });
  }

  function openReject() {
    setRejecting(true);
    setReason('');
    setReasonError(null);
  }

  function submitReject() {
    if (reason.trim().length < MODERATION_LIMITS.rejectionReason.min) {
      setReasonError(`Reason must be at least ${MODERATION_LIMITS.rejectionReason.min} characters.`);
      return;
    }
    reject.mutate(
      { listingId: listing!.id, reason: reason.trim() },
      {
        onSuccess: () => {
          refetchListing();
          setRejecting(false);
        },
      },
    );
  }

  return (
    <div>
      {backButton}
      <div className={styles.layout}>
        <Gallery photos={listing.photos} alt={listing.title} />

        <div>
          <div className={styles.badgeRow}>
            {(isModeratorView || isOwner) && <Badge tone={statusTone(listing.status)}>{listing.status}</Badge>}
            <Badge tone={conditionTone(listing.condition)}>{conditionLabel(listing.condition)}</Badge>
          </div>

          {isOwner && listing.status === ListingStatus.PENDING && (
            <p className={styles.pendingNotice}>Your listing is pending review. It'll appear in the catalog once a moderator approves it.</p>
          )}

          <h1 className={styles.title}>{listing.title}</h1>
          <div className={styles.catRow}>{categoryLabel(listing.category)}</div>

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
                  {listing.risk.reasons.map((reasonText) => (
                    <li key={reasonText}>{reasonText}</li>
                  ))}
                </ul>
              )}
              {canDecide && (
                <div className={styles.moderatorActions}>
                  <Button variant="primary" onClick={handleApprove} disabled={approve.isPending}>
                    Approve
                  </Button>
                  <Button variant="danger" onClick={openReject} disabled={reject.isPending}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}

          {canEdit && (
            <Button as={Link} to={`/listings/${listing.id}/edit`}>
              Edit
            </Button>
          )}
        </div>
      </div>

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Reject listing">
        <p className={styles.modalPrompt}>Rejecting &ldquo;{listing.title}&rdquo;. This reason is shown to the contributor.</p>
        <textarea
          className={styles.reasonInput}
          rows={4}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError(null);
          }}
          autoFocus
        />
        {reasonError && (
          <p role="alert" className={styles.error}>
            {reasonError}
          </p>
        )}
        <div className={styles.modalActions}>
          <Button onClick={() => setRejecting(false)}>Cancel</Button>
          <Button variant="danger" onClick={submitReject} disabled={reject.isPending}>
            {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
