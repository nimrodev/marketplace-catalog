import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { CatalogQuery, CreateListingRequest, ListingDetail, ListingSummary, Page, UpdateListingRequest } from '@marketplace/shared';
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

export function fetchListingDetail(id: string): Promise<ListingDetail> {
  return apiClient.get<ListingDetail>(`/listings/${id}`);
}

export function createListing(input: CreateListingRequest): Promise<ListingDetail> {
  return apiClient.post<ListingDetail>('/listings', input);
}

export function updateListing(id: string, input: UpdateListingRequest): Promise<ListingDetail> {
  return apiClient.patch<ListingDetail>(`/listings/${id}`, input);
}

export function useListingDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => fetchListingDetail(id!),
    enabled: !!id,
    retry: false, // a 404 shouldn't be retried into a spinner that never resolves
  });
}
