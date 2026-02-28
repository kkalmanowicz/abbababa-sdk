/**
 * Abba Baba In-House Session Keys
 *
 * Generates ephemeral session bundles for autonomous agents:
 * - Session wallet: real EOA for on-chain signing (blockchain-enforced hard cap)
 * - E2E keypair: secp256k1 for encrypted payloads (same curve as AgentCrypto)
 * - Session bundle: self-contained base64 string passed to the agent process
 *
 * Security: treat a serialized bundle like a private key. Never send it to the platform.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { secp256k1 } from '@noble/curves/secp256k1'

// ─── Hex helpers ──────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The raw payload inside a serialized session bundle.
 * Treat as a secret — same sensitivity as a private key.
 */
export interface SessionBundlePayload {
  /** Platform-issued session token ("abba_session_..."). Use as apiKey. */
  token: string
  /** Parent agent ID (for reference — platform enforces via token). */
  agentId: string
  /** Soft spending cap in USDC (API-enforced). null = no limit. */
  budgetUsdc: number | null
  /** Session expiry — Unix timestamp seconds. */
  expiry: number

  /** Ephemeral EOA private key (0x-prefixed). Signs escrow/delivery on-chain. */
  walletPrivateKey: string
  /** Ephemeral EOA address. Fund this with USDC + a small ETH gas reserve. */
  walletAddress: string

  /** Fresh secp256k1 private key (hex, 32 bytes). Used for E2E encryption. */
  e2ePrivateKey: string
  /** Compressed secp256k1 public key (hex, 33 bytes). Share with counterparties. */
  e2ePublicKey: string
}

export interface SessionWallet {
  privateKey: `0x${string}`
  address: string
}

export interface E2EKeypair {
  privateKey: string  // hex, 32 bytes
  publicKey: string   // hex, 33 bytes compressed
}

// ─── Key generation ───────────────────────────────────────────────────────────

/**
 * Generate an ephemeral EOA wallet for on-chain session signing.
 * The caller is responsible for funding this address with USDC (and a small
 * ETH/gas reserve) before passing the bundle to the agent.
 */
export function generateSessionWallet(): SessionWallet {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  return {
    privateKey,
    address: account.address,
  }
}

/**
 * Generate a fresh secp256k1 keypair for E2E encryption.
 * Uses the same curve as AgentCrypto — the agent can call initCrypto()
 * with e2ePrivateKey and get a fully functional crypto context.
 */
export function generateE2EKeypair(): E2EKeypair {
  const privBytes = secp256k1.utils.randomPrivateKey()
  const pubBytes = secp256k1.getPublicKey(privBytes, true) // compressed
  return {
    privateKey: toHex(privBytes),
    publicKey: toHex(pubBytes),
  }
}

// ─── Bundle serialize / deserialize ──────────────────────────────────────────

const BUNDLE_PREFIX = 'abba_session_bundle_'

/**
 * Serialize and deserialize session bundles.
 *
 * The bundle is a base64-encoded JSON payload prefixed with
 * `abba_session_bundle_`. Treat it as a secret.
 */
export const SessionBundle = {
  /**
   * Serialize a session payload to a base64 bundle string.
   * Compatible with Node.js (Buffer) and browser (btoa) environments.
   */
  serialize(payload: SessionBundlePayload): string {
    const json = JSON.stringify(payload)
    const b64 =
      typeof Buffer !== 'undefined'
        ? Buffer.from(json, 'utf8').toString('base64')
        : btoa(unescape(encodeURIComponent(json)))
    return BUNDLE_PREFIX + b64
  },

  /**
   * Deserialize a base64 bundle string back to a SessionBundlePayload.
   * @throws If the bundle is not prefixed with `abba_session_bundle_`.
   */
  deserialize(serialized: string): SessionBundlePayload {
    if (!serialized.startsWith(BUNDLE_PREFIX)) {
      throw new Error(
        'Invalid session bundle: expected "abba_session_bundle_" prefix. ' +
        'Ensure you passed the full string returned by session.serialize().'
      )
    }
    const b64 = serialized.slice(BUNDLE_PREFIX.length)
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(b64, 'base64').toString('utf8')
        : decodeURIComponent(escape(atob(b64)))
    return JSON.parse(json) as SessionBundlePayload
  },
}
