import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MODERATION_LIMITS, type ModerationQueueItem } from '@marketplace/shared';
import { useApproveListingMutation, useModerationQueueQuery, useRejectListingMutation } from '../api/moderation';
import { conditionLabel, conditionTone } from '../components/catalog/conditionTone';
import { riskTone } from '../components/detail/labels';
import { Badge, Button, EmptyState, Modal } from '../components/primitives';
import styles from './ModerationQueuePage.module.css';

function RiskInfo({ risk }: { risk: ModerationQueueItem['risk'] }) {
  if (!risk) {
    return (
      <div className={styles.riskInfo}>
        <span title="The automated pre-screen (rule checks + AI) hasn't finished reviewing this listing yet.">
          <Badge tone="outline">Not yet assessed</Badge>
        </span>
        <span className={styles.riskReason}>Automated pre-screening is still in progress — check back shortly, or review manually.</span>
      </div>
    );
  }
  return (
    <div className={styles.riskInfo}>
      <Badge tone={riskTone(risk.level)}>{risk.level}</Badge>
      {risk.reasons[0] && <span className={styles.riskReason}>{risk.reasons[0]}</span>}
      {risk.flags.length > 0 && (
        <div className={styles.flagRow}>
          {risk.flags.map((flag) => (
            <Badge key={flag} tone="neutral">
              {flag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ModerationQueuePage() {
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useModerationQueueQuery();
  const approve = useApproveListingMutation();
  const reject = useRejectListingMutation();
  const [rejectTarget, setRejectTarget] = useState<ModerationQueueItem | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  if (isLoading) {
    return <EmptyState title="Loading…" />;
  }

  if (items.length === 0) {
    return <EmptyState title="Queue is clear" description="No pending listings need review right now." />;
  }

  function openReject(item: ModerationQueueItem) {
    setRejectTarget(item);
    setReason('');
    setReasonError(null);
  }

  function submitReject() {
    if (reason.trim().length < MODERATION_LIMITS.rejectionReason.min) {
      setReasonError(`Reason must be at least ${MODERATION_LIMITS.rejectionReason.min} characters.`);
      return;
    }
    reject.mutate(
      { listingId: rejectTarget!.id, reason: reason.trim() },
      { onSuccess: () => setRejectTarget(null) },
    );
  }

  return (
    <div>
      <h1 className={styles.heading}>Moderation queue</h1>

      <div className={styles.list}>
        {items.map((item) => (
          <div key={item.id} className={styles.row}>
            <Link to={`/listings/${item.id}`} className={styles.photo}>
              {item.primaryPhotoUrl && <img src={item.primaryPhotoUrl} alt={item.title} loading="lazy" />}
            </Link>

            <div className={styles.info}>
              <Link to={`/listings/${item.id}`} className={styles.title}>
                {item.title}
              </Link>
              <div className={styles.meta}>
                <span>{item.contributorEmail}</span>
                <span>${item.price.toLocaleString()}</span>
                <Badge tone={conditionTone(item.condition)}>{conditionLabel(item.condition)}</Badge>
                <span>Submitted {new Date(item.submittedAt).toLocaleString()}</span>
              </div>
              <RiskInfo risk={item.risk} />
            </div>

            <div className={styles.actions}>
              <Button variant="primary" onClick={() => approve.mutate(item.id)} disabled={approve.isPending}>
                Approve
              </Button>
              <Button variant="danger" onClick={() => openReject(item)} disabled={reject.isPending}>
                Reject
              </Button>
            </div>
          </div>
        ))}
      </div>

      {hasNextPage && (
        <div className={styles.loadMoreRow}>
          <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}

      <Modal open={rejectTarget !== null} onClose={() => setRejectTarget(null)} title="Reject listing">
        <p className={styles.modalPrompt}>Rejecting &ldquo;{rejectTarget?.title}&rdquo;. This reason is shown to the contributor.</p>
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
          <Button onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={submitReject} disabled={reject.isPending}>
            {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
