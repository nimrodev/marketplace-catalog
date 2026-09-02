import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  LISTING_LIMITS,
  ListingCategory,
  ListingCondition,
  ListingOption,
  type ListingDetail,
} from '@marketplace/shared';
import { draftListing } from '../../api/ai';
import { ApiError } from '../../api/client';
import { createListing, updateListing } from '../../api/listings';
import { categoryLabel, optionLabel } from '../detail/labels';
import { conditionLabel } from '../catalog/conditionTone';
import { Badge, Button, Input, Select } from '../primitives';
import { generateLocalId } from './localId';
import { PhotoUploader, type PhotoItem } from './PhotoUploader';
import { hasFieldErrors, validateListingFields, type ListingFieldErrors, type ListingFormValues } from './validateListing';
import styles from './ListingForm.module.css';

// Only these four fields are ever AI-prefilled — price is shown as a
// separate range hint rather than a "suggested" field, since prefilling it
// silently would read as authoritative rather than a suggestion.
type AiSuggestibleField = 'title' | 'description' | 'category' | 'condition';

export type ListingFormProps = { mode: 'create'; listing?: undefined } | { mode: 'edit'; listing: ListingDetail };

function initialValues(listing?: ListingDetail): ListingFormValues {
  if (!listing) {
    return { title: '', description: '', price: '', condition: '', category: '', isNegotiable: false, minPrice: '', options: [] };
  }
  return {
    title: listing.title,
    description: listing.description,
    price: String(listing.price),
    condition: listing.condition,
    category: listing.category,
    isNegotiable: listing.isNegotiable,
    minPrice: listing.minPrice === null ? '' : String(listing.minPrice),
    options: listing.options,
  };
}

function initialPhotos(listing?: ListingDetail): PhotoItem[] {
  if (!listing) return [];
  return listing.photos.map((photo) => ({
    id: generateLocalId(),
    key: photo.key,
    previewUrl: photo.url,
    status: 'done',
    progress: 100,
  }));
}

// class-validator's DTO property names — the keys ApiError.fieldErrors
// actually arrives with, so a server error lands on the right input.
const SERVER_FIELD_TO_FORM_FIELD: Record<string, keyof ListingFormValues | 'photos'> = {
  title: 'title',
  description: 'description',
  price: 'price',
  condition: 'condition',
  category: 'category',
  isNegotiable: 'isNegotiable',
  minPrice: 'minPrice',
  options: 'options',
  photoKeys: 'photos',
};

export function ListingForm({ mode, listing }: ListingFormProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ListingFormValues>(() => initialValues(listing));
  const [photos, setPhotos] = useState<PhotoItem[]>(() => initialPhotos(listing));
  const [clientErrors, setClientErrors] = useState<ListingFieldErrors>({});
  const [photosError, setPhotosError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [aiSuggestedFields, setAiSuggestedFields] = useState<Set<AiSuggestibleField>>(new Set());
  const [priceSuggestion, setPriceSuggestion] = useState<{ min: number; max: number } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const donePhotoKeys = photos.filter((p): p is PhotoItem & { key: string } => p.status === 'done' && p.key !== null).map((p) => p.key);

  async function handleDraftWithAi() {
    setDraftError(null);
    setDrafting(true);
    try {
      const draft = await draftListing(donePhotoKeys);
      setDirty(true);
      setValues((prev) => ({
        ...prev,
        title: draft.title,
        description: draft.description,
        category: draft.category,
        condition: draft.condition,
      }));
      setClientErrors((prev) => ({ ...prev, title: undefined, description: undefined, category: undefined, condition: undefined }));
      setAiSuggestedFields(new Set(['title', 'description', 'category', 'condition']));
      setPriceSuggestion({ min: draft.suggestedPriceMin, max: draft.suggestedPriceMax });
    } catch {
      // The AI draft is an accelerator, never a dependency — any failure
      // (timeout, rate limit, missing key) leaves the form exactly as
      // usable as if the button had never been clicked.
      setDraftError("Couldn't generate a draft — fill in the details below.");
    } finally {
      setDrafting(false);
    }
  }

  // Covers tab close/refresh; in-app link navigation would need a data
  // router's useBlocker, which this app's plain BrowserRouter doesn't use.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function setField<K extends keyof ListingFormValues>(field: K, value: ListingFormValues[K]) {
    setDirty(true);
    setValues((prev) => ({ ...prev, [field]: value }));
    setClientErrors((prev) => ({ ...prev, [field]: undefined }));
    setAiSuggestedFields((prev) => {
      if (!prev.has(field as AiSuggestibleField)) return prev;
      const next = new Set(prev);
      next.delete(field as AiSuggestibleField);
      return next;
    });
  }

  function toggleOption(option: ListingOption) {
    setField('options', values.options.includes(option) ? values.options.filter((o) => o !== option) : [...values.options, option]);
  }

  function handlePhotosChange(next: PhotoItem[]) {
    setDirty(true);
    setPhotos(next);
  }

  function toggleNegotiable(checked: boolean) {
    setDirty(true);
    setValues((prev) => ({ ...prev, isNegotiable: checked, minPrice: checked ? prev.minPrice : '' }));
    setClientErrors((prev) => ({ ...prev, isNegotiable: undefined, minPrice: undefined }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const fieldErrors = validateListingFields(values);
    const doneKeys = photos
      .filter((p): p is PhotoItem & { key: string } => p.status === 'done' && p.key !== null)
      .map((p) => p.key);
    const stillUploading = photos.some((p) => p.status === 'uploading');

    let nextPhotosError: string | undefined;
    if (stillUploading) {
      nextPhotosError = 'Wait for photo uploads to finish before submitting.';
    } else if (doneKeys.length < LISTING_LIMITS.photos.min) {
      nextPhotosError = `Add at least ${LISTING_LIMITS.photos.min} photo.`;
    } else if (doneKeys.length > LISTING_LIMITS.photos.max) {
      nextPhotosError = `At most ${LISTING_LIMITS.photos.max} photos.`;
    }

    setClientErrors(fieldErrors);
    setPhotosError(nextPhotosError);
    if (hasFieldErrors(fieldErrors) || nextPhotosError) {
      return;
    }

    const payload = {
      title: values.title.trim(),
      description: values.description,
      price: Number(values.price),
      condition: values.condition as ListingCondition,
      category: values.category as ListingCategory,
      isNegotiable: values.isNegotiable,
      minPrice: values.isNegotiable ? Number(values.minPrice) : undefined,
      options: values.options as ListingOption[],
      photoKeys: doneKeys,
    };

    setSubmitting(true);
    try {
      const saved = mode === 'create' ? await createListing(payload) : await updateListing(listing.id, payload);
      queryClient.setQueryData(['listing', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      setDirty(false);
      navigate(`/listings/${saved.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const mappedFieldErrors: ListingFieldErrors = {};
        let mappedPhotosError: string | undefined;
        for (const [serverField, messages] of Object.entries(err.fieldErrors)) {
          const formField = SERVER_FIELD_TO_FORM_FIELD[serverField];
          if (formField === 'photos') {
            mappedPhotosError = messages[0];
          } else if (formField) {
            mappedFieldErrors[formField] = messages[0];
          }
        }
        setClientErrors(mappedFieldErrors);
        setPhotosError(mappedPhotosError);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Something went wrong — try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function fieldLabel(text: string, field: AiSuggestibleField) {
    if (!aiSuggestedFields.has(field)) return text;
    return (
      <span className={styles.labelWithBadge}>
        {text}
        <Badge tone="accentSoft">AI-suggested</Badge>
      </span>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <PhotoUploader photos={photos} onChange={handlePhotosChange} error={photosError} />

      <div className={styles.aiDraftRow}>
        <Button type="button" onClick={handleDraftWithAi} disabled={donePhotoKeys.length === 0 || drafting}>
          {drafting ? 'Drafting…' : 'Draft with AI'}
        </Button>
        {draftError && (
          <span role="alert" className={styles.aiDraftError}>
            {draftError}
          </span>
        )}
      </div>

      <Input
        label={fieldLabel('Title', 'title')}
        value={values.title}
        onChange={(e) => setField('title', e.target.value)}
        error={clientErrors.title}
        required
      />

      <div className={styles.field}>
        <label className={styles.label} htmlFor="listing-description">
          {fieldLabel('Description', 'description')}
        </label>
        <textarea
          id="listing-description"
          className={styles.textarea}
          rows={6}
          value={values.description}
          onChange={(e) => setField('description', e.target.value)}
          required
        />
        {clientErrors.description && <span className={styles.error}>{clientErrors.description}</span>}
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <Input
            label="Price ($)"
            type="number"
            min="0"
            step="0.01"
            value={values.price}
            onChange={(e) => setField('price', e.target.value)}
            error={clientErrors.price}
            required
          />
          {priceSuggestion && (
            <span className={styles.priceHint}>
              AI suggests ${priceSuggestion.min}–${priceSuggestion.max}
            </span>
          )}
        </div>
        <Select
          label={fieldLabel('Condition', 'condition')}
          value={values.condition}
          onChange={(e) => setField('condition', e.target.value)}
          error={clientErrors.condition}
          required
        >
          <option value="">Select…</option>
          {Object.values(ListingCondition).map((c) => (
            <option key={c} value={c}>
              {conditionLabel(c)}
            </option>
          ))}
        </Select>
        <Select
          label={fieldLabel('Category', 'category')}
          value={values.category}
          onChange={(e) => setField('category', e.target.value)}
          error={clientErrors.category}
          required
        >
          <option value="">Select…</option>
          {Object.values(ListingCategory).map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </Select>
      </div>

      <label className={styles.checkboxRow}>
        <input type="checkbox" checked={values.isNegotiable} onChange={(e) => toggleNegotiable(e.target.checked)} />
        Negotiable
      </label>

      {values.isNegotiable && (
        <Input
          label="Minimum accepted price ($)"
          type="number"
          min="0"
          step="0.01"
          value={values.minPrice}
          onChange={(e) => setField('minPrice', e.target.value)}
          error={clientErrors.minPrice}
          required
        />
      )}

      <fieldset className={styles.fieldset}>
        <legend className={styles.label}>Options</legend>
        {Object.values(ListingOption).map((option) => (
          <label key={option} className={styles.checkboxRow}>
            <input type="checkbox" checked={values.options.includes(option)} onChange={() => toggleOption(option)} />
            {optionLabel(option)}
          </label>
        ))}
      </fieldset>

      {formError && (
        <p role="alert" className={styles.error}>
          {formError}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? 'Submitting…' : mode === 'create' ? 'Submit listing' : 'Save changes'}
      </Button>
    </form>
  );
}
