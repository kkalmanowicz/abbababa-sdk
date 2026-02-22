export { createSmartAccount, buildKernelClient } from './smart-account.js'
export { EscrowClient, ScoreClient, ResolverClient, DisputeOutcome, EscrowStatus } from './escrow.js'
export {
  generateSessionKey,
  useSessionKey,
  revokeSessionKey,
  buildEscrowPolicies,
} from './session-keys.js'
export {
  // V2 contract addresses (UUPS Upgradeable - 2026-02-14)
  ESCROW_V2_ADDRESSES,
  SCORE_V2_ADDRESSES,
  RESOLVER_V2_ADDRESSES,
  TESTNET_USDC_ADDRESS,
  DEPRECATED_MOCK_USDC_ADDRESSES,
  MOCK_USDC_ADDRESSES,
  // Legacy V1 addresses (deprecated)
  ESCROW_V1_ADDRESSES,
  SCORE_V1_ADDRESSES,
  ESCROW_V4_ADDRESSES,
  SCORE_ADDRESSES,
  // Token registry
  TOKEN_REGISTRY,
  getToken,
  getTokensByTier,
  isTokenSupported,
  // Chain IDs
  POLYGON_AMOY_CHAIN_ID,
  POLYGON_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  // Gas
  MIN_GAS_BALANCE,
} from './constants.js'
export type { TokenInfo } from './constants.js'
