import {
  encodeFunctionData,
  keccak256,
  toBytes,
  type Address,
  type Chain,
  createPublicClient,
  http,
} from 'viem'
import { baseSepolia, base } from 'viem/chains'
import { ABBABABA_ESCROW_ABI, ABBABABA_SCORE_ABI, ABBABABA_RESOLVER_ABI, ERC20_ABI } from './abi.js'
import {
  ESCROW_V2_ADDRESSES,
  SCORE_V2_ADDRESSES,
  RESOLVER_V2_ADDRESSES,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  getToken,
  type TokenInfo,
} from './constants.js'
import type { EscrowDetails, AgentStats } from '../types.js'

/** Minimal interface satisfied by viem WalletClient and any compatible EOA wallet. */
export interface WalletSender {
  sendTransaction(args: { to: `0x${string}`; data: `0x${string}` }): Promise<`0x${string}`>
}

/** Dispute resolution outcome */
export enum DisputeOutcome {
  None = 0,
  BuyerRefund = 1,
  SellerPaid = 2,
  Split = 3,
}

/** Escrow status codes */
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

const CHAINS: Record<number, Chain> = {
  [BASE_SEPOLIA_CHAIN_ID]: baseSepolia,
  [BASE_MAINNET_CHAIN_ID]: base,
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

/**
 * Client for interacting with the AbbaBabaEscrow smart contract.
 * Supports UUPS upgradeable escrow with 2% platform fee,
 * criteriaHash for AI dispute resolution, configurable dispute windows,
 * and abandonment detection.
 *
 * Accepts a viem WalletClient (EOA — seller pays own gas).
 * The walletClient must expose a sendTransaction({ to, data }) interface.
 */
export class EscrowClient {
  private walletClient: WalletSender
  private chainId: number
  private escrowAddress: Address
  private tokenAddress: Address
  private tokenDecimals: number

  constructor(walletClient: WalletSender, token?: TokenInfo, chainId = BASE_SEPOLIA_CHAIN_ID) {
    this.walletClient = walletClient
    this.chainId = chainId

    // Resolve token (default USDC)
    if (token) {
      this.tokenAddress = token.address as Address
      this.tokenDecimals = token.decimals
    } else {
      const usdc = getToken(chainId, 'USDC')
      if (!usdc) throw new Error(`No USDC address for chain ${chainId}`)
      this.tokenAddress = usdc.address as Address
      this.tokenDecimals = usdc.decimals
    }

    const v2 = ESCROW_V2_ADDRESSES[chainId]
    if (!v2) throw new Error(`No V2 escrow contract for chain ${chainId}`)
    this.escrowAddress = v2 as Address
  }

  /**
   * Convert a platform transaction ID (CUID string) to a bytes32 escrow ID.
   * Uses keccak256, matching the existing backend pattern.
   */
  static toEscrowId(transactionId: string): `0x${string}` {
    return keccak256(toBytes(transactionId))
  }

  /**
   * Approve the escrow contract to spend the settlement token on behalf of the smart account.
   * Must be called before fundEscrow.
   * Automatically includes the 2% platform fee in the approved amount (ceiling division).
   */
  async approveToken(amount: bigint): Promise<string> {
    // The contract pulls amount + 2% platform fee from the buyer's allowance.
    // Use ceiling division to ensure the approved amount always covers the fee.
    const amountWithFee = (amount * 102n + 99n) / 100n
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [this.escrowAddress, amountWithFee],
    })

    const txHash = await this.walletClient.sendTransaction({
      to: this.tokenAddress,
      data,
    })

    return txHash
  }

  /**
   * Generate a criteriaHash from success criteria JSON.
   * The criteriaHash is stored on-chain to enable Tier 1 algorithmic resolution.
   */
  static toCriteriaHash(criteria: object | string): `0x${string}` {
    const json = typeof criteria === 'string' ? criteria : JSON.stringify(criteria)
    return keccak256(toBytes(json))
  }

  /**
   * Fund an escrow. Calls V2 createEscrow with agent-negotiable parameters.
   * The contract will safeTransferFrom the token (amount + 2% platform fee) from the caller.
   *
   * @param transactionId - Platform transaction ID (CUID)
   * @param sellerAddress - Seller's wallet address
   * @param amount - Amount in smallest token units (e.g., USDC with 6 decimals)
   * @param deadline - Unix timestamp for delivery deadline
   * @param disputeWindow - Dispute window in seconds (0 = default 1 hour, min 5min, max 24hr)
   * @param abandonmentGrace - Abandonment grace in seconds (0 = default 2 days, min 1hr, max 30 days)
   * @param criteriaHash - keccak256 hash of success criteria JSON (enables AI dispute resolution)
   */
  async fundEscrow(
    transactionId: string,
    sellerAddress: string,
    amount: bigint,
    deadline: bigint,
    disputeWindow: bigint = 0n,
    abandonmentGrace: bigint = 0n,
    criteriaHash: `0x${string}` = '0x0000000000000000000000000000000000000000000000000000000000000000'
  ): Promise<string> {
    const escrowId = EscrowClient.toEscrowId(transactionId)

    const data = encodeFunctionData({
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'createEscrow',
      args: [escrowId, sellerAddress as Address, amount, this.tokenAddress, deadline, disputeWindow, abandonmentGrace, criteriaHash],
    })

    const txHash = await this.walletClient.sendTransaction({
      to: this.escrowAddress,
      data,
    })

    return txHash
  }

  /**
   * Submit delivery proof on-chain. Called by the seller after completing work.
   */
  async submitDelivery(transactionId: string, proofHash: `0x${string}`): Promise<string> {
    const escrowId = EscrowClient.toEscrowId(transactionId)

    const data = encodeFunctionData({
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'submitDelivery',
      args: [escrowId, proofHash],
    })

    const txHash = await this.walletClient.sendTransaction({
      to: this.escrowAddress,
      data,
    })

    return txHash
  }

  /**
   * Accept delivery and release funds immediately. Called by the buyer.
   */
  async acceptDelivery(transactionId: string): Promise<string> {
    const escrowId = EscrowClient.toEscrowId(transactionId)

    const data = encodeFunctionData({
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'accept',
      args: [escrowId],
    })

    const txHash = await this.walletClient.sendTransaction({
      to: this.escrowAddress,
      data,
    })

    return txHash
  }

  /**
   * Finalize release after the dispute window has passed without a dispute.
   * Can be called by anyone.
   */
  async finalizeRelease(transactionId: string): Promise<string> {
    const escrowId = EscrowClient.toEscrowId(transactionId)

    const data = encodeFunctionData({
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'finalizeRelease',
      args: [escrowId],
    })

    const txHash = await this.walletClient.sendTransaction({
      to: this.escrowAddress,
      data,
    })

    return txHash
  }

  /**
   * Dispute a delivery within the dispute window. Called by the buyer.
   */
  async disputeEscrow(transactionId: string): Promise<string> {
    const escrowId = EscrowClient.toEscrowId(transactionId)

    const data = encodeFunctionData({
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'dispute',
      args: [escrowId],
    })

    const txHash = await this.walletClient.sendTransaction({
      to: this.escrowAddress,
      data,
    })

    return txHash
  }

  /**
   * Claim funds for an abandoned escrow (deadline + abandonmentGrace passed with no delivery).
   * Called by the buyer to reclaim funds.
   */
  async claimAbandoned(transactionId: string): Promise<string> {
    const escrowId = EscrowClient.toEscrowId(transactionId)

    const data = encodeFunctionData({
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'claimAbandoned',
      args: [escrowId],
    })

    const txHash = await this.walletClient.sendTransaction({
      to: this.escrowAddress,
      data,
    })

    return txHash
  }

  /**
   * Read escrow details from the V2 contract (view function, no gas needed).
   */
  async getEscrow(transactionId: string): Promise<EscrowDetails | null> {
    const escrowId = EscrowClient.toEscrowId(transactionId)
    const viemChain = CHAINS[this.chainId] ?? baseSepolia

    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(),
    })

    const result = await publicClient.readContract({
      address: this.escrowAddress,
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'getEscrow',
      args: [escrowId],
    })

    const [token, buyer, seller, lockedAmount, platformFee, status, createdAt, deadline, disputeWindow, abandonmentGrace, deliveredAt, proofHash, criteriaHash] = result as [
      string, string, string, bigint, bigint, number, bigint, bigint, bigint, bigint, bigint, string, string
    ]

    if (buyer === ZERO_ADDRESS) {
      return null
    }

    return {
      token,
      buyer,
      seller,
      lockedAmount,
      platformFee,
      status,
      createdAt: Number(createdAt),
      deadline: Number(deadline),
      disputeWindow: Number(disputeWindow),
      abandonmentGrace: Number(abandonmentGrace),
      deliveredAt: Number(deliveredAt),
      proofHash: proofHash === ZERO_BYTES32 ? null : proofHash,
      criteriaHash: criteriaHash === ZERO_BYTES32 ? null : criteriaHash,
    }
  }

  /**
   * Check if the dispute window is currently active for an escrow.
   */
  async isDisputeWindowActive(transactionId: string): Promise<boolean> {
    const escrowId = EscrowClient.toEscrowId(transactionId)
    const viemChain = CHAINS[this.chainId] ?? baseSepolia

    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(),
    })

    const result = await publicClient.readContract({
      address: this.escrowAddress,
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'isDisputeWindowActive',
      args: [escrowId],
    })

    return result as boolean
  }

  /**
   * Check if an escrow can be finalized (dispute window passed, no dispute filed).
   */
  async canFinalize(transactionId: string): Promise<boolean> {
    const escrowId = EscrowClient.toEscrowId(transactionId)
    const viemChain = CHAINS[this.chainId] ?? baseSepolia

    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(),
    })

    const result = await publicClient.readContract({
      address: this.escrowAddress,
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'canFinalize',
      args: [escrowId],
    })

    return result as boolean
  }

  /**
   * Transfer ERC20 tokens from this wallet to a recipient address.
   * Used to fund a session wallet with USDC before handing off the bundle.
   *
   * @param to - Recipient address (e.g. session wallet).
   * @param amount - Amount in smallest token units (e.g. 100_000000n for 100 USDC with 6 decimals).
   */
  async transferToken(to: `0x${string}`, amount: bigint): Promise<string> {
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [to, amount],
    })

    return this.walletClient.sendTransaction({
      to: this.tokenAddress,
      data,
    })
  }

  /**
   * Sweep all ERC20 tokens from `fromAddress` to `recipient`.
   * Reads the current balance via a public client, then sends all of it.
   * Used to reclaim funds from a session wallet after the session expires.
   *
   * This method must be called with a walletClient that controls `fromAddress`
   * (i.e., the session wallet's private key must be in `walletClient`).
   *
   * @param fromAddress - Source address (the session wallet).
   * @param recipient - Destination address (the main wallet).
   * @returns Transaction hash, or `null` if the balance is zero.
   */
  async sweepToken(fromAddress: `0x${string}`, recipient: `0x${string}`): Promise<string | null> {
    const viemChain = CHAINS[this.chainId] ?? baseSepolia
    const publicClient = createPublicClient({ chain: viemChain, transport: http() })

    const balance = await publicClient.readContract({
      address: this.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [fromAddress],
    }) as bigint

    if (balance === 0n) return null

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [recipient, balance],
    })

    return this.walletClient.sendTransaction({
      to: this.tokenAddress,
      data,
    })
  }

  /**
   * Check if an escrow can be claimed as abandoned (deadline + abandonmentGrace passed).
   */
  async canClaimAbandoned(transactionId: string): Promise<boolean> {
    const escrowId = EscrowClient.toEscrowId(transactionId)
    const viemChain = CHAINS[this.chainId] ?? baseSepolia

    const publicClient = createPublicClient({
      chain: viemChain,
      transport: http(),
    })

    const result = await publicClient.readContract({
      address: this.escrowAddress,
      abi: ABBABABA_ESCROW_ABI,
      functionName: 'canClaimAbandoned',
      args: [escrowId],
    })

    return result as boolean
  }
}

/**
 * Read-only client for the AbbaBabaScore on-chain reputation system.
 * No wallet needed — all methods are view functions.
 */
export class ScoreClient {
  private chainId: number
  private scoreAddress: Address

  constructor(chainId = BASE_SEPOLIA_CHAIN_ID) {
    this.chainId = chainId

    const addr = SCORE_V2_ADDRESSES[chainId]
    if (!addr) throw new Error(`No Score contract for chain ${chainId}`)
    this.scoreAddress = addr as Address
  }

  private getPublicClient() {
    const viemChain = CHAINS[this.chainId] ?? baseSepolia
    return createPublicClient({
      chain: viemChain,
      transport: http(),
    })
  }

  /**
   * Get an agent's trust score (int256 — can be negative).
   */
  async getScore(agentAddress: string): Promise<bigint> {
    const publicClient = this.getPublicClient()

    const result = await publicClient.readContract({
      address: this.scoreAddress,
      abi: ABBABABA_SCORE_ABI,
      functionName: 'getScore',
      args: [agentAddress as Address],
    })

    return result as bigint
  }

  /**
   * Get full agent stats from the reputation contract.
   * V2: Returns score, jobs, disputes lost, abandoned, and max job value.
   */
  async getAgentStats(agentAddress: string): Promise<AgentStats> {
    const publicClient = this.getPublicClient()

    const stats = await publicClient.readContract({
      address: this.scoreAddress,
      abi: ABBABABA_SCORE_ABI,
      functionName: 'getAgentStats',
      args: [agentAddress as Address],
    })

    const [score, jobs, lostDisputes, abandoned, maxJobValue] = stats as [
      bigint, bigint, bigint, bigint, bigint
    ]

    return {
      score,
      totalJobs: jobs,
      disputesLost: lostDisputes,
      jobsAbandoned: abandoned,
      maxJobValue,
    }
  }

  /**
   * Get maximum job value an agent can accept based on their score.
   * V2: Score-based limits from $10 (score <10) to unlimited (score 100+).
   * @returns Maximum job value in USDC (6 decimals)
   */
  async getMaxJobValue(agentAddress: string): Promise<bigint> {
    const publicClient = this.getPublicClient()

    const result = await publicClient.readContract({
      address: this.scoreAddress,
      abi: ABBABABA_SCORE_ABI,
      functionName: 'getMaxJobValue',
      args: [agentAddress as Address],
    })

    return result as bigint
  }

  /**
   * Get the Score contract address.
   */
  getScoreAddress(): Address {
    return this.scoreAddress
  }
}

/**
 * Client for interacting with the AbbaBabaResolver contract.
 * Used for submitting AI dispute resolutions (requires RESOLVER_ROLE).
 * V2 simplification: Single submitResolution function (no tier-specific functions).
 */
export class ResolverClient {
  private walletClient: WalletSender
  private chainId: number
  private resolverAddress: Address

  constructor(walletClient: WalletSender, chainId = BASE_SEPOLIA_CHAIN_ID) {
    this.walletClient = walletClient
    this.chainId = chainId

    const addr = RESOLVER_V2_ADDRESSES[chainId]
    if (!addr) throw new Error(`No Resolver contract for chain ${chainId}`)
    this.resolverAddress = addr as Address
  }

  /**
   * Submit AI dispute resolution.
   * Requires RESOLVER_ROLE on the resolver contract.
   */
  async submitResolution(
    transactionId: string,
    outcome: DisputeOutcome,
    buyerPercent: number,
    sellerPercent: number,
    reasoning: string
  ): Promise<string> {
    const escrowId = EscrowClient.toEscrowId(transactionId)

    const data = encodeFunctionData({
      abi: ABBABABA_RESOLVER_ABI,
      functionName: 'submitResolution',
      args: [escrowId, outcome, BigInt(buyerPercent), BigInt(sellerPercent), reasoning],
    })

    const txHash = await this.walletClient.sendTransaction({
      to: this.resolverAddress,
      data,
    })

    return txHash
  }
}
