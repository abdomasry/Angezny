// =============================================================================
// Shared TanStack Query keys + fetchers
// =============================================================================
// Why this file exists:
//   - Centralizes query keys so cache invalidation calls (e.g. after a mutation)
//     can target the same key the original useQuery used. Stringly-typed keys
//     scattered across files always drift; a key factory gets caught by TS.
//   - Co-locates the fetch function next to its key, so you never have to
//     wonder "what URL does the workers list use?" when reading a component.
//
// Adding a new query:
//   1. Add a key under `queryKeys` (returns a tuple, never a single string).
//   2. Add a fetcher function below.
//   3. In the component:  useQuery({ queryKey: queryKeys.X(args), queryFn: () => fetchX(args) })
// =============================================================================

import { api } from '@/lib/api'
import type { Category, WorkerProfile, PaginationInfo } from '@/lib/types'

// ─── Query keys ────────────────────────────────────────────────────
// Tuples keep the "hierarchy" Query uses for partial invalidations:
//   queryClient.invalidateQueries({ queryKey: ['workers'] })
// nukes ALL workers queries regardless of their filters; while
//   queryClient.invalidateQueries({ queryKey: queryKeys.workers(filters) })
// nukes only that exact filter combo.
export const queryKeys = {
  categories: (withCounts: boolean) =>
    ['categories', { withCounts }] as const,

  workers: (filters: WorkersFilters) =>
    ['workers', filters] as const,

  worker: (id: string) =>
    ['worker', id] as const,

  workerReviews: (id: string, page: number) =>
    ['worker', id, 'reviews', { page }] as const,

  service: (id: string) =>
    ['service', id] as const,

  notifications: () =>
    ['notifications'] as const,
} as const

// ─── Filter type used by the workers list ─────────────────────────
export interface WorkersFilters {
  categories?: string[] // multi-select category ids
  q?: string            // text search
  minPrice?: string
  maxPrice?: string
  minRating?: string
  sort?: string
  page?: number
  limit?: number
}

// ─── Response shapes ──────────────────────────────────────────────
export interface CategoriesResponse {
  categories: Category[]
}

export interface WorkersResponse {
  workers: WorkerProfile[]
  pagination: PaginationInfo
}

// ─── Fetchers ─────────────────────────────────────────────────────
// Each function is a thin wrapper over the api client. Public endpoints
// use api.get; auth-required endpoints would use api.getWithAuth.

export async function fetchCategories(withCounts = false): Promise<CategoriesResponse> {
  const qs = withCounts ? '?withCounts=true' : ''
  return api.get(`/categories${qs}`)
}

// Build the workers query string from the filter object. Kept here so the
// query function is pure (the caller doesn't have to URLSearchParams-encode
// before calling).
export async function fetchWorkers(filters: WorkersFilters): Promise<WorkersResponse> {
  const params = new URLSearchParams()
  if (filters.categories && filters.categories.length > 0) {
    params.append('category', filters.categories.join(','))
  }
  if (filters.q) params.append('q', filters.q)
  if (filters.minPrice) params.append('minPrice', filters.minPrice)
  if (filters.maxPrice) params.append('maxPrice', filters.maxPrice)
  if (filters.minRating) params.append('minRating', filters.minRating)
  if (filters.sort) params.append('sort', filters.sort)
  if (filters.page) params.append('page', String(filters.page))
  params.append('limit', String(filters.limit ?? 10))
  return api.get(`/workers?${params.toString()}`)
}
