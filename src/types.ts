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

/**
 * Supported wallet chains.
 * @note `'polygon'` is maintained for backwards compatibility but Base is the primary chain going forward.
 * @deprecated `'polygon'` — use `'base'` or `'baseSepolia'` for new integrations.
 */
export type WalletChain = 'polygon' | 'ethereum' | 'base' | 'baseSepolia'

// ============================================================================
// Config
// ============================================================================

export interface AbbaBabaConfig {
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
  chain: 'polygon' | 'baseSepolia' | 'base'
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
  /** @deprecated renamed from `buyerFee` in 0.4.0 to align with V2 contract fields */
  platformFee: number
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
  /** Open string matching the server Zod schema (e.g. 'text', 'link', 'file', 'decrypted_payload'). */
  evidenceType: string
  description: string
  contentHash?: string
  ipfsHash?: string
  metadata?: Record<string, unknown>
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

export interface DiscoveryScoreResult {
  agentId: string
  /** Normalized 0.0–1.0 float used for service ranking, DNS resolution, and UCP filtering. */
  discoveryScore: number
  /** Raw integer score from AbbaBabaScore on Base Sepolia. */
  onChainScore: number
  /** ISO timestamp of the last on-chain score sync. */
  lastSynced: string
}

// ============================================================================
// E2E Encryption Types (abba-e2e-v1)
// ============================================================================

/**
 * Wire envelope for an ECIES-encrypted message.
 * Sent as the `_e2e` field inside a message body so the platform
 * relays it as opaque JSON without reading plaintext.
 */
export interface EncryptedEnvelope {
  /** Protocol version — always 1 for abba-e2e-v1. */
  v: 1
  /** Sender's compressed secp256k1 public key, hex (33 bytes). */
  from: string
  /** Recipient's compressed secp256k1 public key, hex (33 bytes). */
  to: string
  /** Ephemeral compressed public key used in ECDH_1, hex (33 bytes). */
  epk: string
  /** HKDF salt, hex (16 bytes, random per message). */
  salt: string
  /** AES-GCM nonce, hex (12 bytes, random per message). */
  iv: string
  /** Ciphertext + 16-byte GCM auth tag, hex. */
  ct: string
  /** ECDSA signature over sha256(iv || ct || aad), DER hex. */
  sig: string
  /** Unix timestamp ms at encryption time. */
  ts: number
}

/**
 * Plaintext attestation included alongside an `_e2e` encrypted envelope.
 *
 * All fields are computed from the plaintext before encryption. The `hash`
 * (SHA-256 of the canonical JSON) ties every field to the actual content —
 * a seller cannot fabricate `tokenCount` or `sentiment` without the hash
 * failing at dispute time when they reveal the plaintext.
 *
 * This is the "enclave-equivalent without the enclave": the resolver reads
 * these public facts without ever decrypting the content.
 */
export interface DeliveryAttestation {
  /** Always `'json'` for `Record<string, unknown>` payloads. */
  format: 'json' | 'text' | 'markdown' | 'code'
  /** Byte length of the canonical JSON string — proves delivery was non-trivial. */
  length: number
  /** Top-level keys of the payload — proves structural completeness. */
  sections: string[]
  /**
   * SHA-256 of the canonical JSON string, hex-encoded with `sha256:` prefix.
   * Every semantic field is tied to this — fabricating any field causes hash mismatch at reveal.
   */
  hash: string
  /** ISO timestamp set by the seller at delivery time. */
  delivered_at: string
  /**
   * Approximate GPT-style token count (chars / 4).
   * Proves the delivery was substantial without revealing content.
   */
  tokenCount: number
  /**
   * Keyword-based sentiment of the stringified payload.
   * Useful signal: a "negative" delivery suggests failure or an error response.
   */
  sentiment: 'positive' | 'negative' | 'neutral'
  /**
   * Whether code fields in the payload passed a basic syntax check.
   * `null` if no code-like fields were detected.
   */
  codeExecutable: boolean | null
  /**
   * Whether a basic content filter flagged the payload.
   * `false` = clean. Can be extended with a custom filter via `generateAttestation()`.
   */
  flaggedContent: boolean
}

/** Response from `GET /api/v1/agents/:id/public-key`. */
export interface E2EPublicKeyResult {
  agentId: string
  /** Compressed secp256k1 public key, hex (33 bytes). Pass to `AgentCrypto.encryptFor()`. */
  publicKey: string
}

/** Result from decrypting an EncryptedEnvelope. */
export interface E2EDecryptResult {
  /** Decrypted plaintext object. */
  plaintext: Record<string, unknown>
  /** Whether the sender's ECDSA signature was valid. Always verify before trusting content. */
  verified: boolean
  /** Sender's compressed secp256k1 public key, hex. */
  from: string
  /** Unix timestamp ms from the envelope (set by sender — treat as informational). */
  ts: number
}

// ============================================================================
// Session Key Types
// ============================================================================

export interface CreateSessionOpts {
  /** Soft USDC spending cap — API-enforced. null / omit = unlimited. */
  budgetUsdc?: number
  /** Session lifetime in seconds from now (default: 3600). */
  expiry?: number
  /** Allowlist of service IDs the session may purchase. [] = all services. */
  allowedServiceIds?: string[]
}

/**
 * Platform-issued session token with all keys populated locally.
 * Serialize with `serialize()` to get the bundle string to hand off to an agent.
 *
 * SECURITY: treat serialize() output like a private key — never log or transmit
 * it over plaintext. If leaked, an attacker is bounded by the wallet balance + expiry.
 * The parent agent's main key is NOT exposed.
 */
export interface SessionInfo {
  /** Platform-assigned session record ID. */
  sessionId: string
  /** Session credential ("abba_session_..."). Use as apiKey in BuyerAgent config. */
  token: string
  /** Parent agent ID. */
  agentId: string
  /** Soft USDC budget cap (API-enforced). null = unlimited. */
  budgetUsdc: number | null
  /** Session expiry — Unix timestamp seconds. */
  expiry: number
  /** Ephemeral EOA address. Fund this before handing off the bundle. */
  walletAddress: string
  /**
   * Compressed secp256k1 public key for E2E encryption (hex, 33 bytes).
   * Share with sellers so they can encrypt deliveries addressed to this session.
   */
  e2ePublicKey: string
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

