import { useSearchParams } from 'react-router-dom';
import { ListingCategory, ListingCondition, ListingOption, ListingStatus, type CatalogQuery } from '@marketplace/shared';

export type CatalogFilters = Omit<CatalogQuery, 'cursor' | 'limit'>;
export type FilterKey = keyof CatalogFilters;

function isEnumValue<T extends string>(enumObject: Record<string, T>, value: string): value is T {
  return (Object.values(enumObject) as string[]).includes(value);
}

function parseFilters(params: URLSearchParams): CatalogFilters {
  const filters: CatalogFilters = {};

  const category = params.get('category');
  if (category && isEnumValue(ListingCategory, category)) {
    filters.category = category;
  }

  const condition = params.get('condition');
  if (condition && isEnumValue(ListingCondition, condition)) {
    filters.condition = condition;
  }

  const minPrice = params.get('minPrice');
  if (minPrice !== null && minPrice !== '' && Number.isFinite(Number(minPrice))) {
    filters.minPrice = Number(minPrice);
  }

  const maxPrice = params.get('maxPrice');
  if (maxPrice !== null && maxPrice !== '' && Number.isFinite(Number(maxPrice))) {
    filters.maxPrice = Number(maxPrice);
  }

  const options = params.getAll('options').filter((o): o is ListingOption => isEnumValue(ListingOption, o));
  if (options.length > 0) {
    filters.options = options;
  }

  if (params.get('negotiable') === 'true') {
    filters.negotiable = true;
  }

  const status = params.get('status');
  if (status && isEnumValue(ListingStatus, status)) {
    filters.status = status;
  }

  return filters;
}

// URL query string is the only source of truth (MAR-38) — no component
// state duplicating it, so a copied link, a refresh, and the browser's
// own back/forward all reproduce the exact same filtered view for free.
export function useCatalogFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseFilters(searchParams);

  // replace:true for continuous input (debounced price typing) so every
  // keystroke doesn't spam browser history; replace:false (push, the
  // default) for discrete choices, so back/forward steps through them.
  function updateFilters(patch: Partial<CatalogFilters>, options: { replace?: boolean } = {}) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key);
      if (value === undefined || value === false) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => next.append(key, v));
      } else {
        next.set(key, String(value));
      }
    }
    setSearchParams(next, { replace: options.replace ?? false });
  }

  function toggleOption(option: ListingOption) {
    const current = filters.options ?? [];
    const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
    updateFilters({ options: next });
  }

  function removeFilter(key: FilterKey) {
    if (key === 'options') {
      updateFilters({ options: [] });
    } else {
      updateFilters({ [key]: undefined });
    }
  }

  function clearAll() {
    setSearchParams(new URLSearchParams());
  }

  return { filters, updateFilters, toggleOption, removeFilter, clearAll };
}
