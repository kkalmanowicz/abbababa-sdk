import { AbbabaClient } from './client.js'
import { WebhookServer } from './webhook.js'
import type {
  AbbabaConfig,
  Service,
  ServiceSearchParams,
  CheckoutInput,
  CheckoutResult,
  Transaction,
  ApiResponse,
  WebhookHandler,
  SmartAccountConfig,
  SessionKeyConfig,
  SessionKeyResult,
  UseSessionKeyConfig,
  AgentStats,
} from './types.js'

export class BuyerAgent {
  public readonly client: AbbabaClient
  private webhookServer: WebhookServer | null = null
  private walletAddress: string | null = null
  private kernelClient: unknown = null
  private resolvedGasStrategy: 'self-funded' | 'erc20' | null = null

  constructor(config: AbbabaConfig) {
    this.client = new AbbabaClient(config)
  }

  /** Search the marketplace for services. */
  async findServices(
    query: string,
    filters?: Omit<ServiceSearchParams, 'q'>
  ): Promise<Service[]> {
    const res = await this.client.services.search({ q: query, ...filters })
    if (!res.success || !res.data) {
      throw new Error(res.error ?? 'Search failed')
    }
    return res.data.services
  }

  /** Purchase a service. Returns checkout result with payment instructions. */
  async purchase(input: CheckoutInput): Promise<CheckoutResult> {
    const res = await this.client.checkout.purchase(input)
    if (!res.success || !res.data) {
      throw new Error(res.error ?? 'Purchase failed')
    }
    return res.data
  }

  /** Confirm delivery and release escrow via the API. */
  async confirm(transactionId: string): Promise<ApiResponse<Transaction>> {
    return this.client.transactions.confirm(transactionId)
  }

  /** Open a dispute on a transaction via the API. */
  async dispute(transactionId: string, reason: string): Promise<ApiResponse<Transaction>> {
    return this.client.transactions.dispute(transactionId, { reason })
  }

  /**
   * Start a webhook server to receive delivery notifications.
   * Returns the callback URL to pass to checkout.
   *
   * @param port    Port to listen on
   * @param handler Async function called with each webhook event
   * @param options.signingSecret  WEBHOOK_SIGNING_SECRET — when provided, requests with
   *                               an invalid or missing X-Abbababa-Signature are rejected
   *                               with 401. Strongly recommended in production.
   * @param options.path           URL path (default: '/webhook')
   */
  async onDelivery(
    port: number,
    handler: WebhookHandler,
    options?: { signingSecret?: string; path?: string }
  ): Promise<{ url: string }> {
    this.webhookServer = new WebhookServer(handler, options)
    return this.webhookServer.start(port)
  }

  /** Stop the webhook server. */
  async stopWebhook(): Promise<void> {
    if (this.webhookServer) {
      await this.webhookServer.stop()
      this.webhookServer = null
    }
  }

  /**
   * Initialize a ZeroDev smart account for on-chain payments.
   * Requires @zerodev/sdk, @zerodev/ecdsa-validator, and permissionless as peer deps.
   */
  async initWallet(config: SmartAccountConfig): Promise<string> {
    const { createSmartAccount } = await import('./wallet/smart-account.js')
    const result = await createSmartAccount(config)
    this.walletAddress = result.address
    this.kernelClient = result.kernelClient
    this.resolvedGasStrategy = result.gasStrategy
    return result.address
  }

  /**
   * Fund an on-chain escrow for a transaction (V2 — includes deadline).
   * Requires initWallet() to have been called first.
   * @param tokenSymbol - Settlement token symbol (default: 'USDC').
   * @param deadline - Unix timestamp after which the seller must deliver.
   * Returns the on-chain transaction hash.
   */
  async fundEscrow(
    transactionId: string,
    sellerAddress: string,
    amount: bigint,
    tokenSymbol: string = 'USDC',
    deadline: bigint = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400)
  ): Promise<string> {
    if (!this.kernelClient) {
      throw new Error('Wallet not initialized. Call initWallet() first.')
    }
    const { EscrowClient } = await import('./wallet/escrow.js')
    const { getToken, BASE_SEPOLIA_CHAIN_ID } = await import('./wallet/constants.js')
    const token = getToken(BASE_SEPOLIA_CHAIN_ID, tokenSymbol)
    const escrow = new EscrowClient(this.kernelClient, token)
    await escrow.approveToken(amount)
    return escrow.fundEscrow(transactionId, sellerAddress, amount, deadline)
  }

  /**
   * Fund escrow on-chain and verify with the backend.
   * This is the complete funding flow:
   *   1. Approve token spending
   *   2. Call createEscrow on the V2 escrow contract
   *   3. POST /api/v1/transactions/:id/fund to verify on-chain state
   *
   * Returns the fund verification result from the backend.
   * Requires initWallet() or initWithSessionKey() to have been called first.
   */
  async fundAndVerify(
    transactionId: string,
    sellerAddress: string,
    amount: bigint,
    tokenSymbol: string = 'USDC',
    deadline: bigint = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400)
  ): Promise<ApiResponse<import('./types.js').FundResult>> {
    const txHash = await this.fundEscrow(transactionId, sellerAddress, amount, tokenSymbol, deadline)
    return this.client.transactions.fund(transactionId, { txHash })
  }

  /**
   * Accept delivery on-chain (V2: buyer calls accept() to release funds immediately).
   * Also confirms delivery via the API.
   */
  async confirmAndRelease(transactionId: string): Promise<void> {
    await this.client.transactions.confirm(transactionId)

    if (this.kernelClient) {
      const { EscrowClient } = await import('./wallet/escrow.js')
      const escrow = new EscrowClient(this.kernelClient)
      await escrow.acceptDelivery(transactionId)
    }
  }

  /**
   * Dispute a delivery on-chain within the 24h dispute window.
   * Returns the on-chain transaction hash.
   */
  async disputeOnChain(transactionId: string): Promise<string> {
    if (!this.kernelClient) {
      throw new Error('Wallet not initialized. Call initWallet() first.')
    }
    const { EscrowClient } = await import('./wallet/escrow.js')
    const escrow = new EscrowClient(this.kernelClient)
    return escrow.disputeEscrow(transactionId)
  }

  /**
   * Claim funds for an abandoned escrow (deadline + 2 days passed).
   * Returns the on-chain transaction hash.
   */
  async claimAbandoned(transactionId: string): Promise<string> {
    if (!this.kernelClient) {
      throw new Error('Wallet not initialized. Call initWallet() first.')
    }
    const { EscrowClient } = await import('./wallet/escrow.js')
    const escrow = new EscrowClient(this.kernelClient)
    return escrow.claimAbandoned(transactionId)
  }

  /**
   * Get an agent's on-chain reputation score on Base Sepolia (testnet).
   * Does not require a wallet — read-only.
   */
  async getAgentScore(agentAddress: string): Promise<AgentStats> {
    const { ScoreClient } = await import('./wallet/escrow.js')
    const score = new ScoreClient()
    return score.getAgentStats(agentAddress)
  }

  /**
   * Get an agent's on-chain score from Base Sepolia testnet.
   * Returns the raw int256 score value.
   */
  async getTestnetScore(agentAddress: string): Promise<number> {
    const { ScoreClient } = await import('./wallet/escrow.js')
    const { BASE_SEPOLIA_CHAIN_ID } = await import('./wallet/constants.js')
    const scoreClient = new ScoreClient(BASE_SEPOLIA_CHAIN_ID)
    const raw = await scoreClient.getScore(agentAddress)
    return Number(raw)
  }

  /**
   * Check if an agent is eligible to transact on Base Mainnet.
   * Eligibility requires earning ≥10 reputation points on Base Sepolia testnet.
   * Returns current testnet score and whether the agent has graduated.
   */
  async getMainnetEligibility(agentAddress: string): Promise<{
    eligible: boolean
    testnetScore: number
    required: number
  }> {
    const { MAINNET_GRADUATION_SCORE } = await import('./wallet/constants.js')
    const testnetScore = await this.getTestnetScore(agentAddress)
    return {
      eligible: testnetScore >= MAINNET_GRADUATION_SCORE,
      testnetScore,
      required: MAINNET_GRADUATION_SCORE,
    }
  }

  /**
   * Initialize wallet from a serialized session key (agent operation).
   * No owner private key needed — only the serialized session key string.
   * The resulting wallet can only perform actions allowed by the session's policies.
   * All existing methods (fundEscrow, confirmAndRelease) work after this call.
   *
   * Requires @zerodev/sdk and @zerodev/permissions as peer deps.
   */
  async initWithSessionKey(config: UseSessionKeyConfig): Promise<string> {
    const { useSessionKey } = await import('./wallet/session-keys.js')
    const result = await useSessionKey(config)
    this.walletAddress = result.address
    this.kernelClient = result.kernelClient
    this.resolvedGasStrategy = result.gasStrategy
    return result.address
  }

  /**
   * Generate a scoped session key for an agent (owner/developer operation).
   * The owner calls this with their private key, then passes the serialized
   * session key string to the agent. The session key is restricted to
   * V2 escrow operations by default.
   *
   * This is a static method — it doesn't require an API key or AbbabaClient.
   *
   * Requires @zerodev/sdk, @zerodev/ecdsa-validator, and @zerodev/permissions.
   */
  static async createSessionKey(
    config: SessionKeyConfig
  ): Promise<SessionKeyResult> {
    const { generateSessionKey } = await import('./wallet/session-keys.js')
    return generateSessionKey(config)
  }

  getWalletAddress(): string | null {
    return this.walletAddress
  }

  /** Returns the resolved gas strategy after initWallet() or initWithSessionKey(). */
  getGasStrategy(): 'self-funded' | 'erc20' | null {
    return this.resolvedGasStrategy
  }
}
