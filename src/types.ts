// ============================================================================
// Enums (mirror Prisma schema exactly)
// ============================================================================

export type ServiceCategory =
  | 'research'
  | 'summarization'
  | 'coding'
  | 'security'
  | 'data'
  | 'booking'
  | 'content'
  | 'other'

export type PriceUnit =
  | 'per_request'
  | 'per_document'
  | 'per_hour'
  | 'per_output'
  | 'flat'

export type ServiceCurrency =
  | 'USDC'
  | 'USD'
  | 'USDT'
  | 'DAI'
  | 'ETH'
  | 'WETH'
  | 'POL'
  | 'WPOL'
  | 'AAVE'
  | 'UNI'
  | 'WBTC'

export type DeliveryType = 'webhook' | 'api_response' | 'async'

export type ServiceStatus = 'active' | 'paused' | 'archived'

export type PaymentMethod = 'usdc' | 'crypto'

export type PaymentStatus = 'pending' | 'paid' | 'failed'

export type TransactionStatus =
  | 'pending'
  | 'escrowed'
  | 'processing'
  | 'delivered'
  | 'completed'
  | 'refunded'
  | 'disputed'
  | 'abandoned'

export type DisputeOutcome = 'buyer_refund' | 'seller_paid' | 'split'

export type WalletChain = 'polygon' | 'ethereum' | 'base' | 'baseSepolia'

export type GasStrategy = 'self-funded' | 'erc20' | 'auto'

// ============================================================================
// Config
// ============================================================================

export interface AbbabaConfig {
  apiKey: string
  baseUrl?: string
  timeout?: number
}

// ============================================================================
// API Response Wrapper
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  details?: unknown
  message?: string
}

// ============================================================================
// Agent Info (embedded in service/transaction responses)
// ============================================================================

export interface AgentSummary {
  id: string
  agentName: string
  trustScore?: number
  sellerRating?: number
}

// ============================================================================
// Service Types
// ============================================================================

export interface CreateServiceInput {
  title: string
  description: string
  category: ServiceCategory
  price: number
  priceUnit: PriceUnit
  currency?: ServiceCurrency
  deliveryType?: DeliveryType
  callbackRequired?: boolean
  endpointUrl?: string
}

export interface UpdateServiceInput {
  title?: string
  description?: string
  price?: number
  priceUnit?: PriceUnit
  currency?: ServiceCurrency
  deliveryType?: DeliveryType
  callbackRequired?: boolean
  endpointUrl?: string | null
  status?: 'active' | 'paused'
}

export interface Service {
  id: string
  agentId: string
  title: string
  description: string
  category: ServiceCategory
  price: number
  priceUnit: PriceUnit
  currency: ServiceCurrency
  deliveryType: DeliveryType
  callbackRequired: boolean
  endpointUrl?: string | null
  status: ServiceStatus
  rating?: number | null
  ratingCount: number
  avgResponseTimeMs?: number | null
  totalTransactions: number
  agent: AgentSummary
  createdAt: string
  updatedAt: string
}

export interface ServiceSearchParams {
  q?: string
  category?: ServiceCategory
  currency?: ServiceCurrency
  maxPrice?: number
  minRating?: number
  sortBy?: 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'response_time'
  limit?: number
  offset?: number
}

export interface ServiceListResult {
  services: Service[]
  total: number
  limit: number
  offset: number
}

// ============================================================================
// Checkout Types
// ============================================================================

export interface CheckoutInput {
  serviceId: string
  quantity?: number
  paymentMethod: PaymentMethod
  /**
   * Webhook URL to receive delivery notifications.
   * Optional — omit if your agent polls `transactions.get()` instead of using webhooks.
   * Must be a valid HTTPS URL if provided.
   */
  callbackUrl?: string
  requestPayload?: unknown
}

export interface CryptoPaymentInstructions {
  type: 'crypto'
  escrowContract: string
  escrowId: string
  sellerAddress: string
  tokenAddress: string
  tokenSymbol: string
  tokenDecimals: number
  amount: string
  totalWithFee: string
  currency: ServiceCurrency
  chain: 'polygonAmoy' | 'polygon' | 'baseSepolia' | 'base'
  chainId: number
  fundEndpoint: string
  instructions: string
}

export type PaymentInstructions = CryptoPaymentInstructions

export interface CheckoutResult {
  transactionId: string
  status: string
  totalCharged: number
  currency: ServiceCurrency
  paymentInstructions: PaymentInstructions
  service: {
    id: string
    title: string
    seller: string
  }
}

// ============================================================================
// Transaction Types
// ============================================================================

export interface Transaction {
  id: string
  serviceId: string
  buyerAgentId: string
  sellerAgentId: string
  quantity: number
  unitPrice: number
  subtotal: number
  buyerFee: number
  sellerFee: number
  totalCharged: number
  sellerReceives: number
  currency: ServiceCurrency
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  status: TransactionStatus
  escrowAddress?: string | null
  escrowTxHash?: string | null
  paymentIntentId?: string | null
  callbackUrl?: string | null
  requestPayload?: unknown
  responsePayload?: unknown
  deliveryProof?: string | null
  deliveredAt?: string | null
  completedAt?: string | null
  disputeReason?: string | null
  createdAt: string
  updatedAt: string
  myRole?: 'buyer' | 'seller'
  service?: {
    id: string
    title: string
    category?: ServiceCategory
  }
  buyerAgent?: {
    id: string
    agentName: string
  }
  sellerAgent?: {
    id: string
    agentName: string
  }
}

export interface TransactionListParams {
  role?: 'buyer' | 'seller' | 'all'
  status?: TransactionStatus
  limit?: number
  offset?: number
}

export interface TransactionListResult {
  transactions: Transaction[]
  total: number
  limit: number
  offset: number
}

export interface DeliverInput {
  responsePayload: unknown
}

export interface DisputeInput {
  reason: string
}

export interface DisputeStatus {
  status: 'evaluating' | 'resolved' | 'pending_admin'
  outcome: DisputeOutcome | null
  buyerPercent: number | null
  sellerPercent: number | null
  evidenceCount: number
  createdAt: string
  resolvedAt: string | null
}

export interface EvidenceInput {
  type: 'text' | 'link' | 'file'
  content: string
}

export interface FundInput {
  txHash: string
}

export interface FundResult {
  id: string
  status: TransactionStatus
  escrowTxHash: string
  onChain: {
    escrowId: string
    buyer: string
    seller: string
    lockedAmount: string
    platformFee: string
    status: string
  }
}

// ============================================================================
// Webhook Types
// ============================================================================

export interface WebhookEvent {
  event: 'service.delivered'
  transactionId: string
  serviceId: string
  responsePayload: unknown
  deliveredAt: string
}

export type WebhookHandler = (event: WebhookEvent) => Promise<void>

// ============================================================================
// Wallet Types
// ============================================================================

export interface SmartAccountConfig {
  privateKey: string
  zeroDevProjectId: string
  chain?: 'polygon' | 'polygonAmoy' | 'baseSepolia' | 'base'
  /** Gas payment strategy (default: 'auto'). */
  gasStrategy?: GasStrategy
}

export interface SmartAccountResult {
  address: string
  kernelClient: unknown
  /** Resolved gas strategy (never 'auto' — resolved to 'self-funded' or 'erc20'). */
  gasStrategy: 'self-funded' | 'erc20'
}

export interface EscrowDetails {
  token: string
  buyer: string
  seller: string
  /** Amount locked in escrow (after 2% platform fee deduction) */
  lockedAmount: bigint
  /** 2% platform fee deducted at escrow creation */
  platformFee: bigint
  status: number
  createdAt: number
  deadline: number
  /** Agent-negotiated dispute window in seconds (default: 1 hour) */
  disputeWindow: number
  /** Agent-negotiated abandonment grace period in seconds (default: 2 days) */
  abandonmentGrace: number
  deliveredAt: number
  proofHash: string | null
  /** keccak256 hash of success criteria JSON — enables AI dispute resolution */
  criteriaHash: string | null
}

// ============================================================================
// V4 On-Chain Enums
// ============================================================================

export enum EscrowStatus {
  None = 0,
  Funded = 1,
  Delivered = 2,
  Released = 3,
  Refunded = 4,
  Disputed = 5,
  Resolved = 6,
  Abandoned = 7,
}

export enum OnChainDisputeOutcome {
  None = 0,
  BuyerRefund = 1,
  SellerPaid = 2,
  Split = 3,
}

export interface AgentStats {
  score: bigint
  totalJobs: bigint
  disputesLost: bigint
  jobsAbandoned: bigint
  /** V2: Maximum job value allowed based on score (USDC 6 decimals) */
  maxJobValue: bigint
}

// ============================================================================
// x402 Payment Types
// ============================================================================

export interface X402PaymentRequirements {
  x402Version: number
  accepts: Array<{
    scheme: string
    network: string
    maxAmountRequired: string
    resource: string
    payTo: string
    asset: string
    extra: Record<string, unknown>
  }>
}

// ============================================================================
// Agents API Types
// ============================================================================

export interface AgentListParams {
  category?: string
  search?: string
  limit?: number
  offset?: number
}

export interface FeeTierResult {
  feeBps: number
  feePercent: number
  tierName: string
  monthlyVolume: number
  nextTierVolume: number | null
  nextTierFeeBps: number | null
  volumeToNextTier: number | null
}

export interface AgentScoreResult {
  address: string
  score: number
  required: number
  graduated: boolean
}

export interface MarketplacePulseCategory {
  name: string
  count: number
}

export interface MarketplacePulse {
  timestamp: string
  services: {
    total: number
    newLast24h: number
    categories: MarketplacePulseCategory[]
  }
  transactions: {
    totalCompleted: number
    last24h: number
    volumeUsd24h: string
  }
  agents: {
    totalRegistered: number
    activeLast7d: number
  }
  settlement: {
    supportedTokens: string[]
    chain: string
    escrowVersion: string
  }
  platform: {
    protocolFee: string
    uptime: string
  }
}

export interface MemoryRenewResult {
  key: string
  namespace: string
  expiresAt: string | null
  renewed: boolean
}

// ============================================================================
// Polling Options
// ============================================================================

export interface PollOptions {
  /** Polling interval in milliseconds (default: 5000) */
  interval?: number
  /** Transaction statuses to poll for (default: ['escrowed', 'pending']) */
  statuses?: TransactionStatus[]
}

// ============================================================================
// Session Key Types (ERC-7715)
// ============================================================================

/** Config for generating a scoped session key (owner operation). */
export interface SessionKeyConfig {
  ownerPrivateKey: string
  zeroDevProjectId: string
  chain?: 'polygon' | 'polygonAmoy' | 'baseSepolia' | 'base'
  /** Session validity in seconds (default: 3600 = 1 hour) */
  validitySeconds?: number
  /** Max gas this session key may spend in wei (default: 10_000_000_000_000_000n = 0.01 ETH) */
  gasBudgetWei?: bigint
  /** Override default escrow-scoped policies with custom policies */
  customPolicies?: unknown[]
}

/** Result from generating a session key. */
export interface SessionKeyResult {
  /** Serialized session key string — pass this to the agent */
  serializedSessionKey: string
  /** The session key's EOA address */
  sessionKeyAddress: string
  /** The Kernel smart account address */
  smartAccountAddress: string
}

/** Config for using a session key (agent operation — no owner key needed). */
export interface UseSessionKeyConfig {
  serializedSessionKey: string
  zeroDevProjectId: string
  chain?: 'polygon' | 'polygonAmoy' | 'baseSepolia' | 'base'
  /** Gas payment strategy (default: 'auto'). */
  gasStrategy?: GasStrategy
}

/** Config for revoking a session key on-chain (owner operation). */
export interface RevokeSessionKeyConfig {
  ownerPrivateKey: string
  zeroDevProjectId: string
  /** The serialized session key to reconstruct the permission plugin for revocation */
  serializedSessionKey: string
  chain?: 'polygon' | 'polygonAmoy' | 'baseSepolia' | 'base'
  /** Gas payment strategy (default: 'auto'). */
  gasStrategy?: GasStrategy
}
