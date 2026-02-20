export const POLYGON_AMOY_CHAIN_ID = 80002
export const POLYGON_MAINNET_CHAIN_ID = 137
export const BASE_SEPOLIA_CHAIN_ID = 84532
export const BASE_MAINNET_CHAIN_ID = 8453

// ============================================================================
// V2 Contract Addresses (UUPS Upgradeable - Deployed 2026-02-14)
// ============================================================================

/** AbbababaEscrowV2 — UUPS upgradeable escrow with simplified AI-only dispute resolution. */
export const ESCROW_V2_ADDRESSES: Record<number, string> = {
  [BASE_SEPOLIA_CHAIN_ID]: '0x1Aed68edafC24cc936cFabEcF88012CdF5DA0601',
  // BASE_MAINNET_CHAIN_ID address populated after mainnet deployment (Operation Mainnet)
}

/** AbbababaScoreV2 — on-chain agent reputation with simplified +1/-3/-5 scoring (UUPS upgradeable). */
export const SCORE_V2_ADDRESSES: Record<number, string> = {
  [BASE_SEPOLIA_CHAIN_ID]: '0x15a43BdE0F17A2163c587905e8E439ae2F1a2536',
  // BASE_MAINNET_CHAIN_ID address populated after mainnet deployment (Operation Mainnet)
}

/** AbbababaResolverV2 — AI-only instant dispute resolution (UUPS upgradeable). */
export const RESOLVER_V2_ADDRESSES: Record<number, string> = {
  [BASE_SEPOLIA_CHAIN_ID]: '0x41Be690C525457e93e13D876289C8De1Cc9d8B7A',
  // BASE_MAINNET_CHAIN_ID address populated after mainnet deployment (Operation Mainnet)
}

/** Mock USDC for testnet. */
export const MOCK_USDC_ADDRESSES: Record<number, string> = {
  [BASE_SEPOLIA_CHAIN_ID]: '0x9BCd298614fa3b9303418D3F614B63dE128AA6E5',
}

// ============================================================================
// Graduation Thresholds
// ============================================================================

/**
 * Minimum testnet score required before an agent can transact on Base Mainnet.
 * Score is read from AbbababaScoreV2 on Base Sepolia (chain ID 84532).
 */
export const MAINNET_GRADUATION_SCORE = 10

// Legacy V1 addresses (deprecated - use V2)
/** @deprecated V1 contracts deprecated Feb 14, 2026. Use ESCROW_V2_ADDRESSES instead. */
export const ESCROW_V1_ADDRESSES: Record<number, string> = {
  [BASE_SEPOLIA_CHAIN_ID]: '0x71b1544C4E0F8a07eeAEbBe72E2368d32bAaA11d',
}
/** @deprecated V1 contracts deprecated Feb 14, 2026. Use SCORE_V2_ADDRESSES instead. */
export const SCORE_V1_ADDRESSES: Record<number, string> = {
  [BASE_SEPOLIA_CHAIN_ID]: '0xF586a7A69a893C7eF760eA537DAa4864FEA97168',
}
/** @deprecated Use ESCROW_V2_ADDRESSES instead */
export const ESCROW_V4_ADDRESSES = ESCROW_V1_ADDRESSES
/** @deprecated Use SCORE_V2_ADDRESSES instead */
export const SCORE_ADDRESSES = SCORE_V1_ADDRESSES

// ============================================================================
// Token Registry
// ============================================================================

export interface TokenInfo {
  symbol: string
  address: string
  decimals: number
  tier: 1 | 2 | 3
}

export const TOKEN_REGISTRY: Record<number, Record<string, TokenInfo>> = {
  // V2: Removed Polygon Amoy (deprecated)
  [POLYGON_MAINNET_CHAIN_ID]: {
    // Tier 1 — Phase 1
    USDC: { symbol: 'USDC', address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, tier: 1 },
    WPOL: { symbol: 'WPOL', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18, tier: 1 },
    USDT: { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, tier: 1 },
    DAI:  { symbol: 'DAI',  address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18, tier: 1 },
    // Tier 2 — Phase 2 (high value)
    AAVE: { symbol: 'AAVE', address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', decimals: 18, tier: 2 },
    WETH: { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, tier: 2 },
    UNI:  { symbol: 'UNI',  address: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f', decimals: 18, tier: 2 },
    // Tier 3 — Future (ecosystem)
    WBTC: { symbol: 'WBTC', address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8, tier: 3 },
  },
  [BASE_SEPOLIA_CHAIN_ID]: {
    // Official Circle USDC on Base Sepolia
    USDC: { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6, tier: 1 },
  },
  [BASE_MAINNET_CHAIN_ID]: {
    // Official Circle USDC on Base
    USDC: { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, tier: 1 },
  },
}

/** Look up a token by chain and symbol. */
export function getToken(chainId: number, symbol: string): TokenInfo | undefined {
  return TOKEN_REGISTRY[chainId]?.[symbol]
}

/** Get all tokens for a chain filtered by tier. */
export function getTokensByTier(chainId: number, tier: 1 | 2 | 3): TokenInfo[] {
  const tokens = TOKEN_REGISTRY[chainId]
  if (!tokens) return []
  return Object.values(tokens).filter(t => t.tier <= tier)
}

/** Check if a token symbol is supported on a given chain. */
export function isTokenSupported(chainId: number, symbol: string): boolean {
  return TOKEN_REGISTRY[chainId]?.[symbol] !== undefined
}

// ============================================================================
// Gas & Infrastructure
// ============================================================================

// Minimum native token (ETH) balance for self-funded gas.
// If balance is below this, 'auto' strategy falls back to ERC-20 paymaster.
// 0.01 ETH in wei — enough for ~1-10 UserOperations on Base.
export const MIN_GAS_BALANCE = 10_000_000_000_000_000n

export const ZERODEV_BUNDLER_URL = 'https://rpc.zerodev.app/api/v3/bundler'
export const ZERODEV_PAYMASTER_URL = 'https://rpc.zerodev.app/api/v3/paymaster'
