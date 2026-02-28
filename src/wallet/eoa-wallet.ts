import { createWalletClient, createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia, base, polygon, polygonAmoy } from 'viem/chains'
import type { WalletSender } from './escrow.js'

type ChainKey = 'baseSepolia' | 'base' | 'polygon' | 'polygonAmoy'

const CHAIN_MAP = {
  baseSepolia,
  base,
  polygon,
  polygonAmoy,
}

/**
 * Create a plain EOA (Externally Owned Account) wallet using a private key.
 * Returns a viem WalletClient and PublicClient — no ZeroDev required.
 * The agent pays their own gas (~$0.02/flow on Base Sepolia).
 *
 * The returned walletClient is compatible with EscrowClient (duck-typed via
 * sendTransaction interface) — use it directly in fundEscrow, disputeEscrow, etc.
 */
export async function createEOAWallet(config: {
  privateKey: string
  chain?: ChainKey
  rpcUrl?: string
}): Promise<{ address: string; walletClient: WalletSender; publicClient: unknown }> {
  const chain = CHAIN_MAP[config.chain ?? 'baseSepolia']
  const account = privateKeyToAccount(config.privateKey as `0x${string}`)
  const transport = http(config.rpcUrl)

  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  })

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  })

  return {
    address: account.address,
    walletClient,
    publicClient,
  }
}
