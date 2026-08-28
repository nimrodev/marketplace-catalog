import { ALLOWED_PHOTO_CONTENT_TYPES, LISTING_LIMITS, type PhotoContentType } from '@marketplace/shared';

export interface ListingFormValues {
  title: string;
  description: string;
  price: string;
  condition: string;
  category: string;
  isNegotiable: boolean;
  minPrice: string;
  options: string[];
}

export type ListingFieldErrors = Partial<Record<keyof ListingFormValues, string>>;

function isAllowedContentType(type: string): type is PhotoContentType {
  return (ALLOWED_PHOTO_CONTENT_TYPES as readonly string[]).includes(type);
}

// Mirrors CreateListingRequestDto field-for-field (Layer 1), so a submit
// almost never round-trips to the server just to learn a field is invalid.
export function validateListingFields(values: ListingFormValues): ListingFieldErrors {
  const errors: ListingFieldErrors = {};

  const title = values.title.trim();
  if (title.length < LISTING_LIMITS.title.min || title.length > LISTING_LIMITS.title.max) {
    errors.title = `Title must be ${LISTING_LIMITS.title.min}–${LISTING_LIMITS.title.max} characters.`;
  }

  if (values.description.length < LISTING_LIMITS.description.min || values.description.length > LISTING_LIMITS.description.max) {
    errors.description = `Description must be ${LISTING_LIMITS.description.min}–${LISTING_LIMITS.description.max} characters.`;
  }

  const price = Number(values.price);
  if (values.price.trim() === '' || !Number.isFinite(price) || price <= 0 || price > LISTING_LIMITS.price.max) {
    errors.price = `Price must be greater than 0 and at most ${LISTING_LIMITS.price.max.toLocaleString()}.`;
  } else if (!/^\d+(\.\d{1,2})?$/.test(values.price.trim())) {
    errors.price = 'Price allows at most 2 decimal places.';
  }

  if (!values.condition) {
    errors.condition = 'Choose a condition.';
  }
  if (!values.category) {
    errors.category = 'Choose a category.';
  }

  if (values.isNegotiable) {
    const minPrice = Number(values.minPrice);
    if (values.minPrice.trim() === '' || !Number.isFinite(minPrice) || minPrice <= 0) {
      errors.minPrice = 'Minimum price is required when negotiable, and must be greater than 0.';
    } else if (!errors.price && minPrice > price) {
      errors.minPrice = 'Minimum price cannot exceed the listed price.';
    }
  } else if (values.minPrice.trim() !== '') {
    errors.minPrice = 'Minimum price only applies when the listing is negotiable.';
  }

  return errors;
}

export function hasFieldErrors(errors: ListingFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

// Runs before a presign request even goes out — an oversized or
// wrong-type file never reaches the network.
export function validatePhotoFile(file: File): string | null {
  if (!isAllowedContentType(file.type)) {
    return 'Only JPEG, PNG, or WebP images are allowed.';
  }
  if (file.size > LISTING_LIMITS.photos.maxBytes) {
    return `Photo must be under ${LISTING_LIMITS.photos.maxBytes / (1024 * 1024)}MB.`;
  }
  return null;
}
