import {
  createPublicClient,
  http,
  type Address,
  type Chain,
} from 'viem'
import { polygonAmoy, polygon, baseSepolia, base } from 'viem/chains'
import type { SmartAccountConfig, SmartAccountResult, GasStrategy } from '../types.js'
import {
  ZERODEV_BUNDLER_URL,
  ZERODEV_PAYMASTER_URL,
  getToken,
  MIN_GAS_BALANCE,
} from './constants.js'

const CHAINS: Record<string, Chain> = {
  polygon,
  polygonAmoy,
  baseSepolia,
  base,
}

/**
 * Resolve the gas strategy for a kernel client.
 *
 * - 'self-funded': No paymaster — account pays gas with native ETH.
 * - 'erc20': ERC-20 paymaster — account pays gas in USDC.
 * - 'sponsored': ZeroDev UltraRelay — platform sponsors gas via ERC-7683 relayer.
 *   30% less gas, 20% lower latency than standard ERC-4337. Supported on Base + Base Sepolia.
 * - 'auto': Check ETH balance — use self-funded if sufficient, otherwise erc20.
 */
async function resolveGasStrategy(
  strategy: GasStrategy,
  publicClient: ReturnType<typeof createPublicClient>,
  accountAddress: string
): Promise<'self-funded' | 'erc20' | 'sponsored'> {
  if (strategy === 'self-funded' || strategy === 'erc20' || strategy === 'sponsored') {
    return strategy
  }

  // 'auto' — check native balance
  const balance = await publicClient.getBalance({
    address: accountAddress as Address,
  })
  return balance >= MIN_GAS_BALANCE ? 'self-funded' : 'erc20'
}

/**
 * Build a kernel account client with the appropriate gas strategy.
 *
 * Shared by createSmartAccount() and session-keys.ts to avoid duplicating
 * paymaster configuration logic.
 */
export async function buildKernelClient(opts: {
  account: unknown
  chain: Chain
  bundlerUrl: string
  paymasterUrl: string
  gasStrategy: 'self-funded' | 'erc20' | 'sponsored'
}): Promise<unknown> {
  const sdk = await import('@zerodev/sdk')
  const { createKernelAccountClient, createZeroDevPaymasterClient } = sdk

  // UltraRelay (ERC-7683): platform sponsors gas — no paymaster needed.
  // Zeroed gas fees let the relayer inject actual prices at execution.
  // 30% less gas + 20% lower latency vs standard ERC-4337.
  // Supported on Base Mainnet and Base Sepolia.
  if (opts.gasStrategy === 'sponsored') {
    return createKernelAccountClient({
      account: opts.account as any,
      chain: opts.chain,
      bundlerTransport: http(`${opts.bundlerUrl}?provider=ULTRA_RELAY`),
      userOperation: {
        estimateFeesPerGas: async () => ({
          maxFeePerGas: BigInt(0),
          maxPriorityFeePerGas: BigInt(0),
        }),
      },
    })
  }

  if (opts.gasStrategy === 'erc20') {
    const usdcToken = getToken(opts.chain.id, 'USDC')
    if (!usdcToken) {
      throw new Error(
        `No USDC address configured for chain ${opts.chain.id}. Cannot use ERC-20 gas strategy.`
      )
    }
    const usdcAddress = usdcToken.address

    const paymasterClient = createZeroDevPaymasterClient({
      chain: opts.chain,
      transport: http(opts.paymasterUrl),
    })

    return createKernelAccountClient({
      account: opts.account as any,
      chain: opts.chain,
      bundlerTransport: http(opts.bundlerUrl),
      paymaster: {
        getPaymasterData: (userOperation: any) =>
          paymasterClient.sponsorUserOperation({
            userOperation,
            gasToken: usdcAddress as `0x${string}`,
          }),
      },
    })
  }

  // self-funded — no paymaster
  return createKernelAccountClient({
    account: opts.account as any,
    chain: opts.chain,
    bundlerTransport: http(opts.bundlerUrl),
  })
}

/**
 * Create a ZeroDev Kernel smart account (ERC-7579).
 *
 * Gas strategy:
 * - 'self-funded': Agent pays gas with native ETH.
 * - 'erc20': Agent pays gas in USDC via ZeroDev's ERC-20 paymaster.
 * - 'sponsored': Platform sponsors gas via ZeroDev UltraRelay (ERC-7683).
 *   30% less gas, 20% lower latency. Requires a gas policy on ZeroDev dashboard.
 *   Supported on Base Mainnet and Base Sepolia only.
 * - 'auto' (default): Checks ETH balance — uses self-funded if >= 0.01 ETH,
 *   otherwise falls back to ERC-20 paymaster.
 *
 * Requires peer dependencies:
 * - @zerodev/sdk
 * - @zerodev/ecdsa-validator
 */
export async function createSmartAccount(
  config: SmartAccountConfig
): Promise<SmartAccountResult> {
  // Dynamic imports — these are optional peer dependencies
  const sdk = await import('@zerodev/sdk')
  const { signerToEcdsaValidator } = await import('@zerodev/ecdsa-validator')
  const { privateKeyToAccount } = await import('viem/accounts')

  const {
    createKernelAccount,
    constants,
  } = sdk

  const chain = CHAINS[config.chain ?? 'baseSepolia']
  if (!chain) {
    throw new Error(`Unsupported chain: ${config.chain}`)
  }

  const entryPoint = constants.getEntryPoint('0.7')
  const kernelVersion = constants.KERNEL_V3_1

  const bundlerUrl = `${ZERODEV_BUNDLER_URL}/${config.zeroDevProjectId}`
  const paymasterUrl = `${ZERODEV_PAYMASTER_URL}/${config.zeroDevProjectId}`

  // 1. Public client for chain reads
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  })

  // 2. Create the EOA signer from private key
  const signer = privateKeyToAccount(config.privateKey as `0x${string}`)

  // 3. Create ECDSA validator module
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer,
    entryPoint,
    kernelVersion,
  })

  // 4. Create the Kernel smart account (ERC-7579 modular)
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint,
    kernelVersion,
  })

  // 5. Resolve gas strategy
  const gasStrategy = await resolveGasStrategy(
    config.gasStrategy ?? 'auto',
    publicClient,
    kernelAccount.address as string
  )

  // 6. Create the account client with resolved strategy
  const kernelClient = await buildKernelClient({
    account: kernelAccount,
    chain,
    bundlerUrl,
    paymasterUrl,
    gasStrategy,
  })

  return {
    address: kernelAccount.address as string,
    kernelClient,
    gasStrategy,
  }
}
