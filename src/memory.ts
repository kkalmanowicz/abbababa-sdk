import type { AbbabaClient } from './client.js'
import type { ApiResponse, MemoryRenewResult } from './types.js'

export interface MemoryWriteInput {
  key: string
  value: unknown
  namespace?: string
  memoryType?: 'permanent' | 'session' | 'cache'
  tags?: string[]
  ttlSeconds?: number
  source?: string
}

export interface MemoryEntry {
  id: string
  key: string
  namespace: string
  value: unknown
  memoryType: string
  tags: string[]
  sizeBytes: number
  accessCount: number
  source: string | null
  createdAt: string
  updatedAt: string
}

export interface MemorySearchInput {
  query: string
  namespace?: string
  limit?: number
  threshold?: number
}

export interface MemorySearchResult {
  id: string
  key: string
  namespace: string
  value: unknown
  similarity: number
  tags: string[]
}

export interface MemoryHistoryParams {
  namespace?: string
  memoryType?: string
  tags?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export class MemoryClient {
  constructor(private client: AbbabaClient) {}

  async write(input: MemoryWriteInput): Promise<ApiResponse<MemoryEntry>> {
    return this.client.request<MemoryEntry>('POST', '/api/v1/memory', input)
  }

  async read(key: string, namespace?: string): Promise<ApiResponse<MemoryEntry>> {
    const query: Record<string, string> = {}
    if (namespace) query.namespace = namespace
    return this.client.request<MemoryEntry>(
      'GET',
      `/api/v1/memory/${encodeURIComponent(key)}`,
      undefined,
      query,
    )
  }

  async search(input: MemorySearchInput): Promise<ApiResponse<MemorySearchResult[]>> {
    return this.client.request<MemorySearchResult[]>('POST', '/api/v1/memory/search', input)
  }

  async history(params?: MemoryHistoryParams): Promise<ApiResponse<MemoryEntry[]>> {
    const query: Record<string, string> = {}
    if (params?.namespace) query.namespace = params.namespace
    if (params?.memoryType) query.memoryType = params.memoryType
    if (params?.tags) query.tags = params.tags
    if (params?.from) query.from = params.from
    if (params?.to) query.to = params.to
    if (params?.limit !== undefined) query.limit = String(params.limit)
    if (params?.offset !== undefined) query.offset = String(params.offset)
    return this.client.request<MemoryEntry[]>('GET', '/api/v1/memory', undefined, query)
  }

  /**
   * Extend a memory entry's TTL by 90 days without overwriting its value.
   * The `additionalSeconds` parameter is reserved for future API support.
   */
  async renew(
    key: string,
    _additionalSeconds?: number,
    namespace?: string
  ): Promise<ApiResponse<MemoryRenewResult>> {
    const body: { key: string; namespace?: string } = { key }
    if (namespace) body.namespace = namespace
    return this.client.request<MemoryRenewResult>('POST', '/api/v1/memory/renew', body)
  }

  async delete(key: string, namespace?: string): Promise<ApiResponse<{ message: string }>> {
    const query: Record<string, string> = {}
    if (namespace) query.namespace = namespace
    return this.client.request<{ message: string }>(
      'DELETE',
      `/api/v1/memory/${encodeURIComponent(key)}`,
      undefined,
      query,
    )
  }
}
