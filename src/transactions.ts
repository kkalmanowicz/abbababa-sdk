import type { AbbabaClient } from './client.js'
import type {
  ApiResponse,
  Transaction,
  TransactionListParams,
  TransactionListResult,
  DeliverInput,
  DisputeInput,
  DisputeStatus,
  EvidenceInput,
  FundInput,
  FundResult,
} from './types.js'

export class TransactionsClient {
  constructor(private client: AbbabaClient) {}

  async list(params?: TransactionListParams): Promise<ApiResponse<TransactionListResult>> {
    const query: Record<string, string> = {}

    if (params?.role) query.role = params.role
    if (params?.status) query.status = params.status
    if (params?.limit !== undefined) query.limit = String(params.limit)
    if (params?.offset !== undefined) query.offset = String(params.offset)

    return this.client.request<TransactionListResult>(
      'GET',
      '/api/v1/transactions',
      undefined,
      query
    )
  }

  async get(transactionId: string): Promise<ApiResponse<Transaction>> {
    return this.client.request<Transaction>(
      'GET',
      `/api/v1/transactions/${transactionId}`
    )
  }

  async deliver(
    transactionId: string,
    input: DeliverInput
  ): Promise<ApiResponse<Transaction>> {
    return this.client.request<Transaction>(
      'POST',
      `/api/v1/transactions/${transactionId}/deliver`,
      input
    )
  }

  async confirm(transactionId: string): Promise<ApiResponse<Transaction>> {
    return this.client.request<Transaction>(
      'POST',
      `/api/v1/transactions/${transactionId}/confirm`
    )
  }

  async dispute(
    transactionId: string,
    input: DisputeInput
  ): Promise<ApiResponse<Transaction>> {
    return this.client.request<Transaction>(
      'POST',
      `/api/v1/transactions/${transactionId}/dispute`,
      input
    )
  }

  /** Get the current status of an open or resolved dispute. */
  async getDispute(transactionId: string): Promise<ApiResponse<DisputeStatus>> {
    return this.client.request<DisputeStatus>(
      'GET',
      `/api/v1/transactions/${transactionId}/dispute`
    )
  }

  /** Submit evidence for an open dispute (buyer or seller). */
  async submitEvidence(
    transactionId: string,
    input: EvidenceInput
  ): Promise<ApiResponse<{ evidenceId: string }>> {
    return this.client.request<{ evidenceId: string }>(
      'POST',
      `/api/v1/transactions/${transactionId}/dispute/evidence`,
      input
    )
  }

  /** Confirm on-chain escrow funding. Advances transaction to 'escrowed'. */
  async fund(
    transactionId: string,
    input: FundInput
  ): Promise<ApiResponse<FundResult>> {
    return this.client.request<FundResult>(
      'POST',
      `/api/v1/transactions/${transactionId}/fund`,
      input
    )
  }
}
