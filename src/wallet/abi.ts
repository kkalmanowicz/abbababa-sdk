// AbbaBabaEscrow ABI — UUPS upgradeable escrow with 2% platform fee (v2.2.0)
// Source: contracts/contracts/AbbaBabaEscrow.sol
// Deployed: 2026-02-14 to Base Sepolia (proxy: 0x1Aed68edafC24cc936cFabEcF88012CdF5DA0601, impl v2.2.0: 0xe5A4e3EbaE1878b860cC440744442D5718Beb014)
export const ABBABABA_ESCROW_ABI = [
  {
    name: 'PLATFORM_FEE_BPS',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'accept',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'canClaimAbandoned',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'canFinalize',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'claimAbandoned',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'createEscrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'seller', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'disputeWindow', type: 'uint256' },
      { name: 'abandonmentGrace', type: 'uint256' },
      { name: 'criteriaHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'dispute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'finalizeRelease',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'getEscrow',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'buyer', type: 'address' },
      { name: 'seller', type: 'address' },
      { name: 'lockedAmount', type: 'uint256' },
      { name: 'platformFee', type: 'uint256' },
      { name: 'status', type: 'uint8' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'disputeWindow', type: 'uint256' },
      { name: 'abandonmentGrace', type: 'uint256' },
      { name: 'deliveredAt', type: 'uint256' },
      { name: 'proofHash', type: 'bytes32' },
      { name: 'criteriaHash', type: 'bytes32' },
    ],
  },
  {
    name: 'isDisputeWindowActive',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'escrowId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'isTokenSupported',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'paused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'resolveDispute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'outcome', type: 'uint8' },
      { name: 'buyerPercent', type: 'uint256' },
      { name: 'sellerPercent', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'submitDelivery',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'proofHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'supportedTokens',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'version',
    type: 'function',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

// AbbaBabaScore ABI — on-chain agent reputation (UUPS upgradeable)
// Source: contracts/contracts/AbbaBabaScore.sol
// Deployed: 2026-02-14 to Base Sepolia
// V2: Simplified - removed registration points, unlock threshold, bonds, donations
export const ABBABABA_SCORE_ABI = [
  {
    name: 'getScore',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'int256' }],
  },
  {
    name: 'getMaxJobValue',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getAgentStats',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [
      { name: 'score', type: 'int256' },
      { name: 'jobs', type: 'uint256' },
      { name: 'disputesLost', type: 'uint256' },
      { name: 'abandoned', type: 'uint256' },
      { name: 'maxJobValue', type: 'uint256' },
    ],
  },
  {
    name: 'recordCompletion',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'buyer', type: 'address' },
      { name: 'seller', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'recordDisputeOutcome',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'buyer', type: 'address' },
      { name: 'seller', type: 'address' },
      { name: 'outcome', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    name: 'recordAbandonment',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'seller', type: 'address' }],
    outputs: [],
  },
  {
    name: 'version',
    type: 'function',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

// AbbaBabaResolver ABI — AI-only dispute resolution
// Source: contracts/contracts/AbbaBabaResolver.sol
// Deployed: 2026-02-14 to Base Sepolia
export const ABBABABA_RESOLVER_ABI = [
  {
    name: 'RESOLVER_ROLE',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'submitResolution',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrowId', type: 'bytes32' },
      { name: 'outcome', type: 'uint8' },
      { name: 'buyerPercent', type: 'uint256' },
      { name: 'sellerPercent', type: 'uint256' },
      { name: 'reasoning', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'version',
    type: 'function',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

// Standard ERC20 ABI - approve, transfer, balanceOf, allowance, mint (testnet only)
export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // MockERC20 mint — available on testnet only
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const
