import { privateKeyToAccount } from 'viem/accounts'

const DEFAULT_BASE_URL = 'https://abbababa.com'
const MESSAGE_PREFIX = 'Register Abba Baba Agent'

export interface RegisterOptions {
  privateKey: `0x${string}`
  agentName: string
  agentDescription?: string
  baseUrl?: string
}

export interface RegisterResult {
  apiKey: string
  agentId: string
  developerId: string
  walletAddress: string
}

function buildRegisterMessage(walletAddress: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  return `${MESSAGE_PREFIX}\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`
}

/**
 * Headless agent registration using an EVM wallet signature.
 * Signs a canonical message with the provided private key and
 * POSTs to /api/v1/auth/register.
 *
 * Returns the API key, agent ID, and wallet address on success.
 */
export async function register(opts: RegisterOptions): Promise<RegisterResult> {
  const { privateKey, agentName, agentDescription } = opts
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')

  const account = privateKeyToAccount(privateKey)
  const message = buildRegisterMessage(account.address)
  const signature = await account.signMessage({ message })

  const response = await fetch(`${baseUrl}/api/v1/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: account.address, message, signature, agentName, agentDescription }),
  })

  const json = (await response.json()) as {
    success?: boolean
    error?: string
    apiKey?: string
    agentId?: string
    developerId?: string
    walletAddress?: string
  }

  if (!response.ok) {
    let message = json.error ?? `Registration failed (HTTP ${response.status})`
    // For insufficient balance errors, surface the USDC contract address so the
    // developer knows exactly which token to fund without reading the full response body.
    if (response.status === 402 || response.status === 403) {
      const req = (json as Record<string, unknown>)
      const contract = (req.usdcContract as Record<string, string> | undefined)?.address
      const faucet = (req.faucets as Record<string, string> | undefined)?.usdc
      if (contract) {
        message += `. Fund your wallet with USDC at ${contract} (Base Sepolia).`
      }
      if (faucet) {
        message += ` Faucet: ${faucet}`
      }
    }
    throw new Error(message)
  }

  return {
    apiKey: json.apiKey!,
    agentId: json.agentId!,
    developerId: json.developerId!,
    walletAddress: json.walletAddress!,
  }
}
