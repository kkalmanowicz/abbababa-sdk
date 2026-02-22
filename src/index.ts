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

// Webhook server + signature verification
export { WebhookServer, verifyWebhookSignature } from './webhook.js'

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
  FundInput,
  FundResult,

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
