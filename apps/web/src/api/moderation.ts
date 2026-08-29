import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { ListingDetail, ModerationQueueItem, Page, RejectRequest, RiskLevel } from '@marketplace/shared';
import { apiClient } from './client';

const QUEUE_KEY_PREFIX = ['moderation', 'queue'];

function moderationQueueKey(risk?: RiskLevel) {
  return [...QUEUE_KEY_PREFIX, risk] as const;
}

function fetchModerationQueue(risk: RiskLevel | undefined, cursor: string | undefined): Promise<Page<ModerationQueueItem>> {
  const params = new URLSearchParams();
  if (risk) params.set('risk', risk);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return apiClient.get<Page<ModerationQueueItem>>(`/moderation/queue${qs ? `?${qs}` : ''}`);
}

export function useModerationQueueQuery(risk?: RiskLevel) {
  return useInfiniteQuery({
    queryKey: moderationQueueKey(risk),
    queryFn: ({ pageParam }) => fetchModerationQueue(risk, pageParam ?? undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

type QueueData = InfiniteData<Page<ModerationQueueItem>>;
interface QueueSnapshot {
  key: readonly unknown[];
  previous: QueueData | undefined;
}

// Approve and reject share this: both mean "this item leaves the queue
// right now, before the request even resolves." Snapshots every cached
// queue page (any risk filter) so onError can restore them exactly.
function removeFromQueueOptimistically(queryClient: QueryClient, listingId: string): QueueSnapshot[] {
  const matches = queryClient.getQueriesData<QueueData>({ queryKey: QUEUE_KEY_PREFIX });
  const snapshots = matches.map(([key, previous]) => ({ key, previous }));
  matches.forEach(([key, data]) => {
    if (!data) return;
    queryClient.setQueryData<QueueData>(key, {
      ...data,
      pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== listingId) })),
    });
  });
  return snapshots;
}

function restoreQueue(queryClient: QueryClient, snapshots: QueueSnapshot[]) {
  snapshots.forEach(({ key, previous }) => queryClient.setQueryData(key, previous));
}

function invalidateAfterDecision(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: QUEUE_KEY_PREFIX });
  queryClient.invalidateQueries({ queryKey: ['catalog'] });
}

export function useApproveListingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: string) => apiClient.post<ListingDetail>(`/moderation/${listingId}/approve`),
    onMutate: async (listingId: string) => {
      await queryClient.cancelQueries({ queryKey: QUEUE_KEY_PREFIX });
      return { snapshots: removeFromQueueOptimistically(queryClient, listingId) };
    },
    onError: (_err, _listingId, context) => {
      if (context) restoreQueue(queryClient, context.snapshots);
    },
    onSettled: () => invalidateAfterDecision(queryClient),
  });
}

export function useRejectListingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId, reason }: { listingId: string; reason: string }) =>
      apiClient.post<ListingDetail>(`/moderation/${listingId}/reject`, { reason } satisfies RejectRequest),
    onMutate: async ({ listingId }) => {
      await queryClient.cancelQueries({ queryKey: QUEUE_KEY_PREFIX });
      return { snapshots: removeFromQueueOptimistically(queryClient, listingId) };
    },
    onError: (_err, _vars, context) => {
      if (context) restoreQueue(queryClient, context.snapshots);
    },
    onSettled: () => invalidateAfterDecision(queryClient),
  });
}
