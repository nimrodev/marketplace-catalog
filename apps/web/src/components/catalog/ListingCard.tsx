import { Link } from 'react-router-dom';
import type { ListingSummary } from '@marketplace/shared';
import { Badge, Card } from '../primitives';
import { conditionLabel, conditionTone } from './conditionTone';
import styles from './ListingCard.module.css';

export interface ListingCardProps {
  listing: ListingSummary;
}

// aspect-ratio on the photo container reserves its space before the
// image loads, so arrival never shifts layout (the CLS requirement).
export function ListingCard({ listing }: ListingCardProps) {
  return (
    <Card as={Link} to={`/listings/${listing.id}`} interactive className={styles.link}>
      <div className={styles.photo}>
        {listing.primaryPhotoUrl && <img src={listing.primaryPhotoUrl} alt={listing.title} loading="lazy" />}
      </div>
      <div className={styles.body}>
        <div className={styles.catRow}>{listing.category}</div>
        <div className={styles.title}>{listing.title}</div>
        <Badge tone={conditionTone(listing.condition)}>{conditionLabel(listing.condition)}</Badge>
        <div className={styles.priceRow}>
          <span className={styles.price}>₪{listing.price.toLocaleString()}</span>
        </div>
      </div>
    </Card>
  );
}
