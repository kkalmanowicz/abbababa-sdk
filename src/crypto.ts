/**
 * Abba Baba E2E Encryption — ECIES with Dual ECDH + Forward Secrecy
 *
 * Protocol: abba-e2e-v1
 *
 * Per-message encryption:
 *   1. Generate ephemeral secp256k1 key pair (epk_priv, epk_pub)
 *   2. ECDH_1 = getSharedSecret(epk_priv, recipient_pub)  — ephemeral ↔ recipient
 *   3. ECDH_2 = getSharedSecret(sender_priv, recipient_pub) — static ↔ static
 *   4. ikm    = ECDH_1.x || ECDH_2.x  (64 bytes)
 *   5. aad    = JSON({ v, from, to, epk, ts })
 *   6. enc_key = HKDF-SHA256(ikm, salt=random16, info="abba-e2e-v1-enc", 32)
 *   7. ct      = AES-256-GCM(enc_key, iv=random12, plaintext, aad)
 *   8. sig     = secp256k1.sign(sha256(iv || ct || aad), sender_priv)
 *
 * Wire: body field `_e2e` carries the EncryptedEnvelope JSON.
 */

import { secp256k1 } from '@noble/curves/secp256k1'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { randomBytes } from '@noble/hashes/utils'
import type { EncryptedEnvelope, E2EDecryptResult, DeliveryAttestation } from './types.js'

// ─── Hex helpers ──────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length')
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return arr
}

// ─── ECDH helper ─────────────────────────────────────────────────────────────

/**
 * Perform ECDH and return the 32-byte x-coordinate of the shared point.
 * secp256k1.getSharedSecret returns a 33-byte compressed point (prefix + x).
 */
function ecdhX(privKeyHex: string, pubKeyHex: string): Uint8Array {
  const shared = secp256k1.getSharedSecret(privKeyHex, pubKeyHex)
  return shared.slice(1, 33) // x-coordinate only
}

// ─── Core encrypt / decrypt ───────────────────────────────────────────────────

/**
 * Encrypt a plaintext object for a recipient's secp256k1 public key.
 *
 * @param plaintext       - Object to encrypt (JSON-serialized)
 * @param recipientPubKey - Recipient's compressed secp256k1 public key, hex (33 bytes)
 * @param senderPrivKey   - Sender's secp256k1 private key, hex (32 bytes)
 * @param senderPubKey    - Sender's compressed secp256k1 public key, hex (33 bytes)
 */
export async function encrypt(
  plaintext: Record<string, unknown>,
  recipientPubKey: string,
  senderPrivKey: string,
  senderPubKey: string,
): Promise<EncryptedEnvelope> {
  const ts = Date.now()

  // 1. Ephemeral key pair
  const epkPrivBytes = secp256k1.utils.randomPrivateKey()
  const epkPubBytes = secp256k1.getPublicKey(epkPrivBytes, true)
  const epkPrivHex = toHex(epkPrivBytes)
  const epkHex = toHex(epkPubBytes)

  // 2 & 3. Dual ECDH
  const ecdh1 = ecdhX(epkPrivHex, recipientPubKey) // ephemeral ↔ recipient
  const ecdh2 = ecdhX(senderPrivKey, recipientPubKey) // static sender ↔ recipient

  // 4. Combine IKM (64 bytes)
  const ikm = new Uint8Array(64)
  ikm.set(ecdh1, 0)
  ikm.set(ecdh2, 32)

  // 5. AAD — binds all envelope metadata to the ciphertext
  const aadObj = { v: 1 as const, from: senderPubKey, to: recipientPubKey, epk: epkHex, ts }
  const aad = new TextEncoder().encode(JSON.stringify(aadObj))

  // 6. HKDF-SHA256 → 32-byte encryption key
  // Use new Uint8Array(...) to produce ArrayBuffer-backed views that WebCrypto accepts.
  const salt = new Uint8Array(randomBytes(16))
  const info = new TextEncoder().encode('abba-e2e-v1-enc')
  const encKey = new Uint8Array(hkdf(sha256, ikm, salt, info, 32))

  // 7. AES-256-GCM encrypt
  const iv = new Uint8Array(randomBytes(12))
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(plaintext))
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  const ctWithTag = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    cryptoKey,
    plaintextBytes,
  )
  const ctBytes = new Uint8Array(ctWithTag)

  // 8. Sign sha256(iv || ct || aad) with sender's static private key
  const sigInput = new Uint8Array(iv.length + ctBytes.length + aad.length)
  sigInput.set(iv, 0)
  sigInput.set(ctBytes, iv.length)
  sigInput.set(aad, iv.length + ctBytes.length)
  const sigHash = new Uint8Array(sha256(sigInput))
  const sig = secp256k1.sign(sigHash, senderPrivKey)

  return {
    v: 1,
    from: senderPubKey,
    to: recipientPubKey,
    epk: epkHex,
    salt: toHex(salt),
    iv: toHex(iv),
    ct: toHex(ctBytes),
    sig: sig.toDERHex(),
    ts,
  }
}

/**
 * Decrypt an EncryptedEnvelope using the recipient's private key.
 * Verifies the sender's ECDSA signature. Throws on tampered ciphertext
 * (GCM auth tag failure) or malformed envelope.
 *
 * @param envelope        - EncryptedEnvelope from the `_e2e` body field
 * @param recipientPrivKey - Recipient's secp256k1 private key, hex (32 bytes)
 */
export async function decrypt(
  envelope: EncryptedEnvelope,
  recipientPrivKey: string,
): Promise<E2EDecryptResult> {
  const { v, from, to, epk, salt, iv, ct, sig, ts } = envelope

  if (v !== 1) throw new Error(`Unsupported envelope version: ${v}`)

  // Re-derive encryption key using symmetric ECDH property
  const ecdh1 = ecdhX(recipientPrivKey, epk)  // recipient ↔ ephemeral (== epk_priv ↔ recipient_pub)
  const ecdh2 = ecdhX(recipientPrivKey, from) // recipient ↔ static sender

  const ikm = new Uint8Array(64)
  ikm.set(ecdh1, 0)
  ikm.set(ecdh2, 32)

  const aadObj = { v: 1 as const, from, to, epk, ts }
  const aad = new TextEncoder().encode(JSON.stringify(aadObj))

  const saltBytes = fromHex(salt)
  const info = new TextEncoder().encode('abba-e2e-v1-enc')
  const encKey = new Uint8Array(hkdf(sha256, ikm, saltBytes, info, 32))

  const ivBytes = fromHex(iv)
  const ctBytes = fromHex(ct)

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    encKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )

  let plaintextBuffer: ArrayBuffer
  try {
    plaintextBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes, additionalData: aad },
      cryptoKey,
      ctBytes,
    )
  } catch {
    throw new Error('Decryption failed: invalid key or tampered ciphertext')
  }

  const plaintext = JSON.parse(new TextDecoder().decode(plaintextBuffer)) as Record<string, unknown>

  // Verify sender's ECDSA signature over sha256(iv || ct || aad)
  const sigInput = new Uint8Array(ivBytes.length + ctBytes.length + aad.length)
  sigInput.set(ivBytes, 0)
  sigInput.set(ctBytes, ivBytes.length)
  sigInput.set(aad, ivBytes.length + ctBytes.length)
  // Wrap in new Uint8Array to get ArrayBuffer-backed view (required for noble/curves overload resolution).
  const sigHash = new Uint8Array(sha256(sigInput))

  // Pass sig as Uint8Array (DER bytes) so noble/curves overload resolves cleanly.
  let verified = false
  try {
    verified = secp256k1.verify(fromHex(sig), sigHash, fromHex(from))
  } catch {
    verified = false
  }

  return { plaintext, verified, from, ts }
}

// ─── Attestation ──────────────────────────────────────────────────────────────

const POSITIVE_KEYWORDS = ['success', 'complete', 'delivered', 'result', 'done', 'ok', 'found', 'created']
const NEGATIVE_KEYWORDS = ['error', 'fail', 'reject', 'invalid', 'unable', 'missing', 'not found', 'exception']

function detectSentiment(text: string): 'positive' | 'negative' | 'neutral' {
  const lower = text.toLowerCase()
  const hasNeg = NEGATIVE_KEYWORDS.some((kw) => lower.includes(kw))
  if (hasNeg) return 'negative'
  const hasPos = POSITIVE_KEYWORDS.some((kw) => lower.includes(kw))
  if (hasPos) return 'positive'
  return 'neutral'
}

function estimateTokens(json: string): number {
  return Math.ceil(json.length / 4)
}

function checkCodeExecutable(payload: Record<string, unknown>): boolean | null {
  const codeFields = Object.entries(payload).filter(([k]) =>
    ['code', 'source', 'script', 'program', 'snippet', 'function'].some((kw) => k.toLowerCase().includes(kw))
  )
  if (codeFields.length === 0) return null

  for (const [, v] of codeFields) {
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    // JSON value check
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed)
        return true
      } catch {
        return false
      }
    }
    // Balanced braces check for code
    let depth = 0
    for (const ch of trimmed) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
      if (depth < 0) return false
    }
    return depth === 0
  }
  return null
}

function checkFlaggedContent(text: string): boolean {
  const lower = text.toLowerCase()
  const blocklist = ['<script', 'javascript:', 'eval(', 'exec(', 'system(', 'os.system', '__import__']
  return blocklist.some((kw) => lower.includes(kw))
}

/**
 * Generate a `DeliveryAttestation` from a plaintext payload before encrypting.
 *
 * The attestation is stored in plaintext alongside the `_e2e` envelope so the
 * dispute resolver can reason about the delivery without decrypting it. The
 * `hash` ties every semantic field to the actual content — fabricating fields
 * causes hash mismatch when the seller reveals plaintext.
 */
export function generateAttestation(payload: Record<string, unknown>): DeliveryAttestation {
  const json = JSON.stringify(payload)
  const hashBytes = sha256(new TextEncoder().encode(json))
  return {
    format: 'json',
    length: json.length,
    sections: Object.keys(payload),
    hash: 'sha256:' + toHex(hashBytes),
    delivered_at: new Date().toISOString(),
    tokenCount: estimateTokens(json),
    sentiment: detectSentiment(json),
    codeExecutable: checkCodeExecutable(payload),
    flaggedContent: checkFlaggedContent(json),
  }
}

/**
 * Verify that a `DeliveryAttestation` hash matches the given plaintext.
 * Returns `true` if the hash is valid, `false` if tampered.
 *
 * Call this before accepting dispute evidence that claims to reveal plaintext.
 */
export function verifyAttestation(plaintext: Record<string, unknown>, attestation: DeliveryAttestation): boolean {
  const json = JSON.stringify(plaintext)
  const computed = 'sha256:' + toHex(sha256(new TextEncoder().encode(json)))
  return computed === attestation.hash
}

// ─── Key utilities ────────────────────────────────────────────────────────────

/**
 * Derive the compressed secp256k1 public key (33 bytes, hex) from a private key.
 */
export function getPublicKey(privateKeyHex: string): string {
  return toHex(secp256k1.getPublicKey(privateKeyHex, true))
}

/**
 * Generate a new random secp256k1 private key (hex, 32 bytes).
 */
export function generatePrivateKey(): string {
  return toHex(secp256k1.utils.randomPrivateKey())
}

// ─── AgentCrypto class ────────────────────────────────────────────────────────

/**
 * Holds a secp256k1 keypair for an agent and provides encrypt/decrypt helpers.
 *
 * @example
 * const crypto = AgentCrypto.fromPrivateKey(process.env.AGENT_E2E_PRIVATE_KEY!)
 * // Encrypt a message for a known recipient public key:
 * const envelope = await crypto.encryptFor({ action: 'quote', amount: 10 }, recipientPubKey)
 * // Decrypt a received message:
 * const result = await crypto.decrypt(message.body._e2e)
 * if (!result.verified) throw new Error('Signature mismatch — reject message')
 */
export class AgentCrypto {
  readonly publicKey: string

  private constructor(
    private readonly privateKey: string,
    publicKey: string,
  ) {
    this.publicKey = publicKey
  }

  /**
   * Encrypt a plaintext object for a recipient identified by their compressed
   * secp256k1 public key (hex). Produces a new envelope with a fresh ephemeral
   * key pair and random salt/IV — identical calls produce different ciphertexts.
   */
  async encryptFor(
    plaintext: Record<string, unknown>,
    recipientPubKey: string,
  ): Promise<EncryptedEnvelope> {
    return encrypt(plaintext, recipientPubKey, this.privateKey, this.publicKey)
  }

  /**
   * Decrypt an EncryptedEnvelope addressed to this agent.
   * Verifies the sender's ECDSA signature.
   * Throws if the ciphertext is tampered or the key is wrong.
   */
  async decrypt(envelope: EncryptedEnvelope): Promise<E2EDecryptResult> {
    return decrypt(envelope, this.privateKey)
  }

  /** Create an AgentCrypto from an existing secp256k1 private key (hex). */
  static fromPrivateKey(privateKeyHex: string): AgentCrypto {
    return new AgentCrypto(privateKeyHex, getPublicKey(privateKeyHex))
  }

  /** Generate a brand-new random keypair. Useful for testing. */
  static generate(): AgentCrypto {
    const privKey = generatePrivateKey()
    return AgentCrypto.fromPrivateKey(privKey)
  }
}
