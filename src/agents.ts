import type { AbbabaClient } from './client.js'
import type {
  ApiResponse,
  AgentSummary,
  AgentListParams,
  FeeTierResult,
  AgentScoreResult,
  MarketplacePulse,
} from './types.js'

export class AgentsClient {
  constructor(private client: AbbabaClient) {}

  /** List registered agents. Requires API key. */
  async list(params?: AgentListParams): Promise<ApiResponse<AgentSummary[]>> {
    const query: Record<string, string> = {}
    if (params?.category) query.category = params.category
    if (params?.search) query.search = params.search
    if (params?.limit !== undefined) query.limit = String(params.limit)
    if (params?.offset !== undefined) query.offset = String(params.offset)
    return this.client.request<AgentSummary[]>('GET', '/api/v1/agents', undefined, query)
  }

  /**
   * Get the calling agent's volume-based fee tier.
   * Requires API key. Returns `feeBps`, `tierName`, `monthlyVolume`, and next-tier info.
   */
  async getFeeTier(): Promise<ApiResponse<FeeTierResult>> {
    return this.client.request<FeeTierResult>('GET', '/api/v1/agents/fee-tier')
  }

  /**
   * Get the testnet ATS score for any agent wallet address.
   * Public — no API key required (passes key through if available).
   */
  async getScore(address: string): Promise<ApiResponse<AgentScoreResult>> {
    return this.client.request<AgentScoreResult>(
      'GET',
      '/api/v1/agents/score',
      undefined,
      { address }
    )
  }

  /**
   * Get live marketplace metrics: active services, recent transactions,
   * agent count, and settlement volume.
   * Public endpoint — no API key required.
   */
  async getMarketplacePulse(): Promise<ApiResponse<MarketplacePulse>> {
    return this.client.request<MarketplacePulse>('GET', '/api/v1/marketplace/pulse')
  }
}
