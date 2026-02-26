import {
  createPublicClient,
  http,
  type Address,
  type Chain,
  type Hex,
} from 'viem'
import { polygonAmoy, polygon, baseSepolia, base } from 'viem/chains'
import { ABBABABA_ESCROW_ABI, ERC20_ABI } from './abi.js'
import {
  ESCROW_V2_ADDRESSES,
  POLYGON_AMOY_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_MAINNET_CHAIN_ID,
  ZERODEV_BUNDLER_URL,
  ZERODEV_PAYMASTER_URL,
  MIN_GAS_BALANCE,
  TOKEN_REGISTRY,
} from './constants.js'
import { buildKernelClient } from './smart-account.js'
import type {
  SessionKeyConfig,
  SessionKeyResult,
  UseSessionKeyConfig,
  RevokeSessionKeyConfig,
  SmartAccountResult,
  GasStrategy,
} from '../types.js'

const CHAINS: Record<string, Chain> = {
  polygon,
  polygonAmoy,
  baseSepolia,
  base,
}

const DEFAULT_VALIDITY_SECONDS = 3600 // 1 hour

/**
 * Build escrow-scoped policies for a session key (V2).
 *
 * Creates a CallPolicy restricted to V2 escrow operations:
 * 1. ERC20.approve for each allowed token (spender must equal V2 escrow contract)
 * 2. Escrow.createEscrow (8 args: escrowId, seller, amount, token, deadline, disputeWindow, abandonmentGrace, criteriaHash)
 * 3. Escrow.submitDelivery
 * 4. Escrow.accept
 * 5. Escrow.finalizeRelease
 * 6. Escrow.dispute
 *
 * Plus a TimestampPolicy for time-bound expiration.
 *
 * @param config.tokens - Token symbols to allow (default: all tokens in registry for chain)
 *
 * Requires @zerodev/permissions as a peer dependency.
 */
const DEFAULT_GAS_BUDGET = 10_000_000_000_000_000n // 0.01 ETH

export async function buildEscrowPolicies(config: {
  chainId?: number
  validitySeconds?: number
  gasBudgetWei?: bigint
  tokens?: string[]
}): Promise<unknown[]> {
  const chainId = config.chainId ?? BASE_SEPOLIA_CHAIN_ID
  const validitySeconds = config.validitySeconds ?? DEFAULT_VALIDITY_SECONDS

  const { toCallPolicy, CallPolicyVersion, ParamCondition, toGasPolicy } = await import(
    '@zerodev/permissions/policies'
  )
  const { toTimestampPolicy } = await import('@zerodev/permissions/policies')

  // Resolve V2 escrow contract
  const escrowAddress = ESCROW_V2_ADDRESSES[chainId]
  if (!escrowAddress) throw new Error(`No V2 escrow contract for chain ${chainId}`)

  // Resolve tokens to allow
  const registry = TOKEN_REGISTRY[chainId] ?? {}
  const tokenSymbols = config.tokens ?? Object.keys(registry)
  const tokenAddresses: string[] = []
  for (const symbol of tokenSymbols) {
    const info = registry[symbol]
    if (info) tokenAddresses.push(info.address)
  }

  if (tokenAddresses.length === 0) {
    throw new Error(`No token addresses for chain ${chainId}`)
  }

  // Build permissions: one approve entry per token + V4 escrow operations
  const permissions: unknown[] = []

  for (const tokenAddr of tokenAddresses) {
    permissions.push({
      target: tokenAddr as Address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [
        {
          condition: ParamCondition.EQUAL,
          value: escrowAddress as Address,
        },
        null, // amount — no restriction
      ],
    })
  }

  // V4 escrow operations
  permissions.push({
    target: escrowAddress as Address,
    abi: ABBABABA_ESCROW_ABI,
    functionName: 'createEscrow',
    args: [null, null, null, null, null], // escrowId, seller, amount, token, deadline
  })
  permissions.push({
    target: escrowAddress as Address,
    abi: ABBABABA_ESCROW_ABI,
    functionName: 'submitDelivery',
    args: [null, null], // escrowId, proofHash
  })
  permissions.push({
    target: escrowAddress as Address,
    abi: ABBABABA_ESCROW_ABI,
    functionName: 'accept',
    args: [null], // escrowId
  })
  permissions.push({
    target: escrowAddress as Address,
    abi: ABBABABA_ESCROW_ABI,
    functionName: 'finalizeRelease',
    args: [null], // escrowId
  })
  permissions.push({
    target: escrowAddress as Address,
    abi: ABBABABA_ESCROW_ABI,
    functionName: 'dispute',
    args: [null], // escrowId
  })

  const callPolicy = toCallPolicy({
    policyVersion: CallPolicyVersion.V0_0_4,
    permissions: permissions as any,
  })

  const validUntil = Math.floor(Date.now() / 1000) + validitySeconds

  const timestampPolicy = toTimestampPolicy({
    validUntil,
  })

  const gasPolicy = toGasPolicy({
    allowed: config.gasBudgetWei ?? DEFAULT_GAS_BUDGET,
  })

  return [callPolicy, timestampPolicy, gasPolicy]
}

/**
 * Generate a scoped session key for an agent (owner operation).
 *
 * The owner calls this with their private key. A random session key is generated,
 * scoped to V4 escrow operations via CallPolicy + TimestampPolicy, and serialized
 * into a single string that can be passed to the agent.
 *
 * Requires peer dependencies:
 * - @zerodev/sdk
 * - @zerodev/ecdsa-validator
 * - @zerodev/permissions
 */
export async function generateSessionKey(
  config: SessionKeyConfig
): Promise<SessionKeyResult> {
  // Dynamic imports — optional peer dependencies
  const sdk = await import('@zerodev/sdk')
  const { signerToEcdsaValidator } = await import('@zerodev/ecdsa-validator')
  const { generatePrivateKey, privateKeyToAccount } = await import(
    'viem/accounts'
  )
  const { toPermissionValidator, serializePermissionAccount } = await import(
    '@zerodev/permissions'
  )
  const { toEmptyECDSASigner } = await import('@zerodev/permissions/signers')

  const {
    createKernelAccount,
    createZeroDevPaymasterClient,
    constants,
  } = sdk

  const chain = CHAINS[config.chain ?? 'baseSepolia']
  if (!chain) throw new Error(`Unsupported chain: ${config.chain}`)

  const entryPoint = constants.getEntryPoint('0.7')
  const kernelVersion = constants.KERNEL_V3_1

  const bundlerUrl = `${ZERODEV_BUNDLER_URL}/${config.zeroDevProjectId}`
  const paymasterUrl = `${ZERODEV_PAYMASTER_URL}/${config.zeroDevProjectId}`

  // 1. Public client for chain reads
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  })

  // 2. Create the owner's EOA signer
  const ownerSigner = privateKeyToAccount(
    config.ownerPrivateKey as `0x${string}`
  )

  // 3. Create owner's ECDSA validator (sudo)
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerSigner,
    entryPoint,
    kernelVersion,
  })

  // 4. Generate a random session key
  const sessionPrivateKey = generatePrivateKey()
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey)

  // 5. Create an empty ECDSA signer from the session key's address
  //    (the owner doesn't need the session private key to authorize it)
  const emptySessionSigner = toEmptyECDSASigner(sessionKeyAccount.address)

  // 6. Build policies (escrow-scoped by default, or custom)
  const chainId = chain.id
  const policies = config.customPolicies
    ? (config.customPolicies as any[])
    : await buildEscrowPolicies({
        chainId,
        validitySeconds: config.validitySeconds ?? DEFAULT_VALIDITY_SECONDS,
        gasBudgetWei: config.gasBudgetWei,
      })

  // 7. Create permission validator (regular plugin)
  const permissionPlugin = await toPermissionValidator(publicClient, {
    signer: emptySessionSigner,
    policies: policies as any[],
    entryPoint,
    kernelVersion,
  })

  // 8. Create kernel account with sudo (owner) + regular (session key)
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionPlugin,
    },
    entryPoint,
    kernelVersion,
  })

  // 9. Serialize the account with the session private key embedded
  const serialized = await serializePermissionAccount(
    kernelAccount as any,
    sessionPrivateKey
  )

  return {
    serializedSessionKey: serialized,
    sessionKeyAddress: sessionKeyAccount.address,
    smartAccountAddress: kernelAccount.address as string,
  }
}

/**
 * Use a serialized session key to get a working kernel client (agent operation).
 *
 * The agent calls this with the serialized string received from the owner.
 * No owner private key is needed — the session key was embedded during serialization.
 * The resulting kernel client can only perform actions allowed by the session's policies.
 *
 * Requires peer dependencies:
 * - @zerodev/sdk
 * - @zerodev/permissions
 */
export async function useSessionKey(
  config: UseSessionKeyConfig
): Promise<SmartAccountResult> {
  const sdk = await import('@zerodev/sdk')
  const { deserializePermissionAccount } = await import(
    '@zerodev/permissions'
  )

  const { constants } = sdk

  const chain = CHAINS[config.chain ?? 'baseSepolia']
  if (!chain) throw new Error(`Unsupported chain: ${config.chain}`)

  const entryPoint = constants.getEntryPoint('0.7')
  const kernelVersion = constants.KERNEL_V3_1

  const bundlerUrl = `${ZERODEV_BUNDLER_URL}/${config.zeroDevProjectId}`
  const paymasterUrl = `${ZERODEV_PAYMASTER_URL}/${config.zeroDevProjectId}`

  // 1. Public client
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  })

  // 2. Deserialize the session key account
  //    The session private key + policies are embedded in the serialized string
  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    kernelVersion,
    config.serializedSessionKey
  )

  // 3. Resolve gas strategy
  const strategy = config.gasStrategy ?? 'auto'
  let resolvedStrategy: 'self-funded' | 'erc20' | 'sponsored'
  if (strategy === 'auto') {
    const balance = await publicClient.getBalance({
      address: sessionKeyAccount.address as Address,
    })
    resolvedStrategy = balance >= MIN_GAS_BALANCE ? 'self-funded' : 'erc20'
  } else {
    resolvedStrategy = strategy
  }

  // 4. Create kernel client with resolved gas strategy
  const kernelClient = await buildKernelClient({
    account: sessionKeyAccount as any,
    chain,
    bundlerUrl,
    paymasterUrl,
    gasStrategy: resolvedStrategy,
  })

  return {
    address: sessionKeyAccount.address as string,
    kernelClient,
    gasStrategy: resolvedStrategy,
  }
}

/**
 * Revoke a session key on-chain (owner operation).
 *
 * The owner calls this with their private key and the serialized session key
 * to reconstruct and uninstall the permission plugin from the Kernel account.
 *
 * Requires peer dependencies:
 * - @zerodev/sdk
 * - @zerodev/ecdsa-validator
 * - @zerodev/permissions
 */
export async function revokeSessionKey(
  config: RevokeSessionKeyConfig
): Promise<string> {
  const sdk = await import('@zerodev/sdk')
  const { signerToEcdsaValidator } = await import('@zerodev/ecdsa-validator')
  const { privateKeyToAccount } = await import('viem/accounts')
  const { deserializePermissionAccount } = await import(
    '@zerodev/permissions'
  )

  const {
    createKernelAccount,
    constants,
  } = sdk

  const chain = CHAINS[config.chain ?? 'baseSepolia']
  if (!chain) throw new Error(`Unsupported chain: ${config.chain}`)

  const entryPoint = constants.getEntryPoint('0.7')
  const kernelVersion = constants.KERNEL_V3_1

  const bundlerUrl = `${ZERODEV_BUNDLER_URL}/${config.zeroDevProjectId}`
  const paymasterUrl = `${ZERODEV_PAYMASTER_URL}/${config.zeroDevProjectId}`

  // 1. Public client
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  })

  // 2. Reconstruct the owner's sudo validator
  const ownerSigner = privateKeyToAccount(
    config.ownerPrivateKey as `0x${string}`
  )
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerSigner,
    entryPoint,
    kernelVersion,
  })

  // 3. Deserialize the session key to get the permission plugin
  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    entryPoint,
    kernelVersion,
    config.serializedSessionKey
  )

  // 4. Create the sudo kernel account (owner has full control)
  const sudoAccount = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  })

  // 5. Resolve gas strategy
  const strategy = config.gasStrategy ?? 'auto'
  let resolvedStrategy: 'self-funded' | 'erc20' | 'sponsored'
  if (strategy === 'auto') {
    const balance = await publicClient.getBalance({
      address: sudoAccount.address as Address,
    })
    resolvedStrategy = balance >= MIN_GAS_BALANCE ? 'self-funded' : 'erc20'
  } else {
    resolvedStrategy = strategy
  }

  // 6. Create sudo kernel client with resolved gas strategy
  const sudoClient = await buildKernelClient({
    account: sudoAccount,
    chain,
    bundlerUrl,
    paymasterUrl,
    gasStrategy: resolvedStrategy,
  })

  // 7. Uninstall the permission plugin
  const userOpHash = await (sudoClient as any).uninstallPlugin({
    plugin: sessionKeyAccount,
  })

  return userOpHash as string
}
