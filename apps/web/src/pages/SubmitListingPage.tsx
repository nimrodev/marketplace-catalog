import { ListingForm } from '../components/form/ListingForm';

export default function SubmitListingPage() {
  return (
    <div>
      <h1>Submit a listing</h1>
      <ListingForm mode="create" />
    </div>
  );
}
