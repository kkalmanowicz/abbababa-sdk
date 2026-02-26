// Core client
export { AbbabaClient } from './client.js'

// Headless registration
export { register } from './register.js'

// Agent orchestrators
export { SellerAgent } from './seller.js'
export { BuyerAgent } from './buyer.js'

// Sub-clients
export { ServicesClient } from './services.js'
export { CheckoutClient } from './checkout.js'
export { TransactionsClient } from './transactions.js'
export { MemoryClient } from './memory.js'
export { MessagesClient } from './messages.js'
export { ChannelsClient } from './channels.js'
export { AgentsClient } from './agents.js'

// Webhook server + signature verification
export { WebhookServer, verifyWebhookSignature } from './webhook.js'

// E2E encryption
export { AgentCrypto, encrypt, decrypt, getPublicKey, generatePrivateKey, generateAttestation, verifyAttestation } from './crypto.js'

// Errors
export {
  AbbabaError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
  ValidationError,
  RateLimitError,
} from './errors.js'

// Types
export type {
  // E2E Encryption
  EncryptedEnvelope,
  E2EDecryptResult,
  E2EPublicKeyResult,
  DeliveryAttestation,

  // Config
  AbbabaConfig,
  ApiResponse,

  // Enums
  ServiceCategory,
  PriceUnit,
  ServiceCurrency,
  DeliveryType,
  ServiceStatus,
  PaymentMethod,
  PaymentStatus,
  TransactionStatus,
  DisputeOutcome,
  WalletChain,

  // Service
  CreateServiceInput,
  UpdateServiceInput,
  Service,
  ServiceSearchParams,
  ServiceListResult,
  AgentSummary,

  // Checkout
  CheckoutInput,
  CheckoutResult,
  CryptoPaymentInstructions,
  PaymentInstructions,

  // Transaction
  Transaction,
  TransactionListParams,
  TransactionListResult,
  DeliverInput,
  DisputeInput,
  DisputeStatus,
  EvidenceInput,
  FundInput,
  FundResult,

  // Agents
  AgentListParams,
  FeeTierResult,
  AgentScoreResult,
  MarketplacePulse,
  MarketplacePulseCategory,
  MemoryRenewResult,
  DiscoveryScoreResult,

  // Webhook
  WebhookEvent,
  WebhookHandler,

  // Wallet
  GasStrategy,
  SmartAccountConfig,
  SmartAccountResult,
  EscrowDetails,
  AgentStats,

  // Session Keys
  SessionKeyConfig,
  SessionKeyResult,
  UseSessionKeyConfig,
  RevokeSessionKeyConfig,

  // Polling
  PollOptions,

  // x402
  X402PaymentRequirements,
} from './types.js'

// V2 on-chain enums
export { EscrowStatus, OnChainDisputeOutcome } from './types.js'

// Wallet constants (chain IDs, contract addresses, token registry)
export {
  POLYGON_AMOY_CHAIN_ID,
  POLYGON_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  ESCROW_V2_ADDRESSES,
  SCORE_V2_ADDRESSES,
  RESOLVER_V2_ADDRESSES,
  MAINNET_GRADUATION_SCORE,
  TESTNET_USDC_ADDRESS,
  TOKEN_REGISTRY,
  MAINNET_CHAIN_IDS,
  TESTNET_CHAIN_IDS,
  getToken,
  getTokensByTier,
  isTokenSupported,
} from './wallet/constants.js'
export type { TokenInfo } from './wallet/constants.js'

// Registration types
export type { RegisterOptions, RegisterResult } from './register.js'

// Memory types
export type {
  MemoryWriteInput,
  MemoryEntry,
  MemorySearchInput,
  MemorySearchResult,
  MemoryHistoryParams,
} from './memory.js'

// Messages types
export type {
  SendMessageInput,
  AgentMessage,
  InboxParams,
  SubscribeInput,
  MessageSubscription,
} from './messages.js'

// Channels types
export type {
  Channel,
  ChannelMessage,
  ChannelMessagesResult,
  SubscribeResult,
  PublishResult,
} from './channels.js'
