import { Link } from 'react-router-dom';
import { ListingStatus, type ListingSummary } from '@marketplace/shared';
import { statusTone } from '../detail/labels';
import { Badge, Card } from '../primitives';
import { conditionLabel, conditionTone } from './conditionTone';
import styles from './ListingCard.module.css';

export interface ListingCardProps {
  listing: ListingSummary;
  // My Listings shows every status including PUBLISHED — the badge is the
  // whole point there. Everywhere else it's only shown for a non-published
  // row, since that's the one case a viewer (moderator/admin) needs it.
  showStatus?: boolean;
}

// aspect-ratio on the photo container reserves its space before the
// image loads, so arrival never shifts layout (the CLS requirement).
export function ListingCard({ listing, showStatus = false }: ListingCardProps) {
  return (
    <Card as={Link} to={`/listings/${listing.id}`} interactive className={styles.link}>
      <div className={styles.photo}>
        {listing.primaryPhotoUrl && <img src={listing.primaryPhotoUrl} alt={listing.title} loading="lazy" />}
      </div>
      <div className={styles.body}>
        <div className={styles.catRow}>{listing.category}</div>
        <div className={styles.title}>{listing.title}</div>
        <div className={styles.badgeRow}>
          {(showStatus || listing.status !== ListingStatus.PUBLISHED) && (
            <Badge tone={statusTone(listing.status)}>{listing.status}</Badge>
          )}
          <Badge tone={conditionTone(listing.condition)}>{conditionLabel(listing.condition)}</Badge>
        </div>
        <div className={styles.priceRow}>
          <span className={styles.price}>${listing.price.toLocaleString()}</span>
        </div>
      </div>
    </Card>
  );
}
