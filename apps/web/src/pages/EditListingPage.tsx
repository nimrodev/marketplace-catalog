import { useParams } from 'react-router-dom';
import { USER_ROLE_RANK, UserRole } from '@marketplace/shared';
import { useListingDetailQuery } from '../api/listings';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ListingForm } from '../components/form/ListingForm';
import { EmptyState } from '../components/primitives';

export default function EditListingPage() {
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

  // The server enforces this too — this just avoids rendering a form the
  // submit would only 403 on.
  const canEdit = !!user && (user.id === listing.contributorId || USER_ROLE_RANK[user.role] >= USER_ROLE_RANK[UserRole.MODERATOR]);
  if (!canEdit) {
    return <EmptyState title="Not authorised" description="You can only edit your own listings." />;
  }

  return (
    <div>
      <h1>Edit listing</h1>
      <ListingForm mode="edit" listing={listing} />
    </div>
  );
}
