import { useInfiniteQuery } from '@tanstack/react-query';
import type { CatalogQuery, ListingSummary, Page } from '@marketplace/shared';
import { apiClient } from './client';

function buildQueryString(query: CatalogQuery): string {
  const params = new URLSearchParams();
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.category) params.set('category', query.category);
  if (query.condition) params.set('condition', query.condition);
  if (query.minPrice !== undefined) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) params.set('maxPrice', String(query.maxPrice));
  if (query.negotiable !== undefined) params.set('negotiable', String(query.negotiable));
  query.options?.forEach((option) => params.append('options', option));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function fetchCatalogPage(query: CatalogQuery): Promise<Page<ListingSummary>> {
  return apiClient.get<Page<ListingSummary>>(`/listings${buildQueryString(query)}`);
}

// filters excludes cursor/limit: those are supplied per-page by react-query
// itself (initialPageParam / getNextPageParam), not part of the filter set.
export function useCatalogQuery(filters: Omit<CatalogQuery, 'cursor' | 'limit'>) {
  return useInfiniteQuery({
    queryKey: ['catalog', filters],
    queryFn: ({ pageParam }) => fetchCatalogPage({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
