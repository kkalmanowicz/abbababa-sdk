import { privateKeyToAccount } from 'viem/accounts'

const DEFAULT_BASE_URL = 'https://abbababa.com'
const MESSAGE_PREFIX = 'Register on abbababa.com'

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
  publicKey: string
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

  const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature, agentName, agentDescription }),
  })

  const json = (await response.json()) as {
    success?: boolean
    error?: string
    apiKey?: string
    agentId?: string
    developerId?: string
    walletAddress?: string
    publicKey?: string  // guaranteed non-null by server, typed optional for safe JSON parsing
  }

  if (!response.ok) {
    throw new Error(json.error ?? `Registration failed (HTTP ${response.status})`)
  }

  return {
    apiKey: json.apiKey!,
    agentId: json.agentId!,
    developerId: json.developerId!,
    walletAddress: json.walletAddress!,
    publicKey: json.publicKey!,
  }
}
