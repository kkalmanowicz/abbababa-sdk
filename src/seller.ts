import { AbbabaClient } from './client.js'
import { AgentCrypto, generateAttestation, verifyAttestation } from './crypto.js'
import type {
  AbbabaConfig,
  CreateServiceInput,
  Service,
  Transaction,
  PollOptions,
  ApiResponse,
  SmartAccountConfig,
  UseSessionKeyConfig,
  AgentStats,
  E2EDecryptResult,
  EncryptedEnvelope,
  DeliveryAttestation,
} from './types.js'

export class SellerAgent {
  public readonly client: AbbabaClient
  private running = false
  private walletAddress: string | null = null
  private kernelClient: unknown = null
  private resolvedGasStrategy: 'self-funded' | 'erc20' | 'sponsored' | null = null
  private _crypto: AgentCrypto | null = null

  constructor(config: AbbabaConfig) {
    this.client = new AbbabaClient(config)
  }

  /** Register a service on the marketplace. */
  async listService(input: CreateServiceInput): Promise<Service> {
    const res = await this.client.services.create(input)
    if (!res.success || !res.data) {
      throw new Error(res.error ?? 'Failed to list service')
    }
    return res.data
  }

  /**
   * Poll for new purchases as an async generator.
   * Yields transactions in 'escrowed' or 'pending' status where this agent is the seller.
   * Tracks seen transaction IDs to avoid yielding duplicates.
   */
  async *pollForPurchases(options?: PollOptions): AsyncGenerator<Transaction> {
    const interval = options?.interval ?? 5_000
    const statuses = options?.statuses ?? ['escrowed', 'pending']
    const seen = new Set<string>()
    this.running = true

    while (this.running) {
      for (const status of statuses) {
        try {
          const res = await this.client.transactions.list({
            role: 'seller',
            status,
            limit: 50,
          })

          if (res.success && res.data) {
            for (const tx of res.data.transactions) {
              if (!seen.has(tx.id)) {
                seen.add(tx.id)
                yield tx
              }
            }
          }
        } catch (err) {
          console.error(`[SellerAgent] Poll error (status=${status}):`, err)
        }
      }

      await sleep(interval)
    }
  }

  /** Deliver results for a transaction via the API. */
  async deliver(transactionId: string, responsePayload: unknown): Promise<ApiResponse<Transaction>> {
    return this.client.transactions.deliver(transactionId, { responsePayload })
  }

  /**
   * Submit delivery proof on-chain (V4) and optionally deliver via the API.
   * Requires initWallet() or initWithSessionKey() to have been called first.
   * @param proofHash - keccak256 hash of the delivery proof data.
   * @param responsePayload - Optional API delivery payload. If provided, also calls the deliver endpoint.
   */
  async submitDelivery(
    transactionId: string,
    proofHash: `0x${string}`,
    responsePayload?: unknown
  ): Promise<string> {
    if (!this.kernelClient) {
      throw new Error('Wallet not initialized. Call initWallet() first.')
    }
    const { EscrowClient } = await import('./wallet/escrow.js')
    const escrow = new EscrowClient(this.kernelClient)
    const txHash = await escrow.submitDelivery(transactionId, proofHash)

    if (responsePayload !== undefined) {
      await this.client.transactions.deliver(transactionId, { responsePayload })
    }

    return txHash
  }

  /**
   * Initialize a ZeroDev smart account for on-chain operations.
   * Requires @zerodev/sdk, @zerodev/ecdsa-validator, and permissionless as peer deps.
   */
  async initWallet(config: SmartAccountConfig): Promise<string> {
    const { createSmartAccount } = await import('./wallet/smart-account.js')
    const result = await createSmartAccount(config)
    this.walletAddress = result.address
    this.kernelClient = result.kernelClient
    this.resolvedGasStrategy = result.gasStrategy
    return result.address
  }

  /**
   * Initialize wallet from a serialized session key (agent operation).
   * No owner private key needed — only the serialized session key string.
   */
  async initWithSessionKey(config: UseSessionKeyConfig): Promise<string> {
    const { useSessionKey } = await import('./wallet/session-keys.js')
    const result = await useSessionKey(config)
    this.walletAddress = result.address
    this.kernelClient = result.kernelClient
    this.resolvedGasStrategy = result.gasStrategy
    return result.address
  }

  /**
   * Get own on-chain reputation score.
   * Does not require a wallet — read-only.
   */
  async getAgentScore(agentAddress?: string): Promise<AgentStats> {
    const address = agentAddress ?? this.walletAddress
    if (!address) {
      throw new Error('No address. Provide agentAddress or call initWallet() first.')
    }
    const { ScoreClient } = await import('./wallet/escrow.js')
    const score = new ScoreClient()
    return score.getAgentStats(address)
  }

  /**
   * Decrypt an encrypted `requestPayload` from an incoming transaction.
   *
   * When a buyer used `purchaseEncrypted()`, the `requestPayload` field contains
   * `{ _e2e: EncryptedEnvelope }`. Call this to recover the plaintext job spec.
   * Also verifies the buyer's ECDSA signature — reject if `result.verified` is false.
   *
   * Requires `initCrypto()` to have been called first.
   */
  async decryptRequestPayload(transaction: Transaction): Promise<E2EDecryptResult> {
    if (!this._crypto) {
      throw new Error('E2E crypto not initialized. Call initCrypto() first.')
    }
    const payload = transaction.requestPayload as Record<string, unknown> | null | undefined
    if (!payload?._e2e) {
      throw new Error(
        'requestPayload does not contain an _e2e envelope. Was it sent with purchaseEncrypted()?'
      )
    }
    return this._crypto.decrypt(payload._e2e as EncryptedEnvelope)
  }

  /**
   * Deliver results with an encrypted `responsePayload`.
   *
   * Fetches the buyer agent's E2E public key, encrypts `responsePayload` client-side,
   * then calls the deliver endpoint. The platform stores `{ _e2e: EncryptedEnvelope }` —
   * only the buyer can decrypt the result with `decryptResponsePayload()`.
   *
   * Requires `initCrypto()` to have been called first.
   *
   * @param transactionId  - Transaction to deliver.
   * @param responsePayload - Plaintext result object to encrypt.
   * @param buyerAgentId   - The buyer's agent ID. Their E2E public key is fetched automatically.
   */
  async deliverEncrypted(
    transactionId: string,
    responsePayload: Record<string, unknown>,
    buyerAgentId: string,
  ): Promise<ApiResponse<Transaction>> {
    if (!this._crypto) {
      throw new Error('E2E crypto not initialized. Call initCrypto() first.')
    }
    const keyRes = await this.client.agents.getE2EPublicKey(buyerAgentId)
    if (!keyRes.success || !keyRes.data) {
      throw new Error(keyRes.error ?? 'Could not fetch buyer E2E public key')
    }
    const buyerPubKey = keyRes.data.publicKey
    const attestation = generateAttestation(responsePayload)
    const envelope = await this._crypto.encryptFor(responsePayload, buyerPubKey)
    return this.client.transactions.deliver(transactionId, {
      responsePayload: { _e2e: envelope, attestation },
    })
  }

  /**
   * Disclose the encrypted `responsePayload` as dispute evidence.
   *
   * Verifies the plaintext against the stored attestation hash, then submits it as
   * `decrypted_payload` evidence so the resolver can inspect actual content.
   *
   * Requires `initCrypto()` to have been called first.
   *
   * @param transactionId  - The disputed transaction.
   * @param originalPayload - The same plaintext object that was passed to `deliverEncrypted()`.
   * @throws If hash verification fails (plaintext does not match stored attestation).
   */
  async submitPayloadEvidence(
    transactionId: string,
    originalPayload: Record<string, unknown>,
  ): Promise<ApiResponse<{ evidenceId: string }>> {
    const txRes = await this.client.transactions.get(transactionId)
    if (!txRes.success || !txRes.data) {
      throw new Error(txRes.error ?? 'Could not fetch transaction')
    }
    const rp = txRes.data.responsePayload as Record<string, unknown> | null | undefined
    const attestation = rp?.attestation as DeliveryAttestation | undefined

    if (!attestation) {
      throw new Error('No attestation found in responsePayload. Was deliverEncrypted() used?')
    }

    const hashVerified = verifyAttestation(originalPayload, attestation)
    if (!hashVerified) {
      throw new Error('Hash verification failed: originalPayload does not match stored attestation hash')
    }

    const sections = Object.keys(originalPayload)
    return this.client.transactions.submitEvidence(transactionId, {
      evidenceType: 'decrypted_payload',
      description: `Seller discloses encrypted responsePayload. Hash verified: ${hashVerified}. Sections: ${sections.join(', ')}`,
      contentHash: attestation.hash,
      metadata: {
        role: 'seller',
        payload: originalPayload,
        senderVerified: true,
        attestationHash: attestation.hash,
      },
    })
  }

  /** Stop the polling loop. */
  stop(): void {
    this.running = false
  }

  getWalletAddress(): string | null {
    return this.walletAddress
  }

  /** Returns the resolved gas strategy after initWallet() or initWithSessionKey(). */
  getGasStrategy(): 'self-funded' | 'erc20' | 'sponsored' | null {
    return this.resolvedGasStrategy
  }

  /**
   * Initialize E2E encryption for this agent using a secp256k1 private key.
   * After calling this, buyers can encrypt job payloads to your `crypto.publicKey`
   * and you can decrypt them with `MessagesClient.decryptReceived(message, crypto)`.
   *
   * @param privateKeyHex - 32-byte secp256k1 private key, hex string.
   *                        Generate one with `AgentCrypto.generate()`.
   */
  initCrypto(privateKeyHex: string): AgentCrypto {
    this._crypto = AgentCrypto.fromPrivateKey(privateKeyHex)
    return this._crypto
  }

  /**
   * The agent's E2E crypto context. `null` until `initCrypto()` is called.
   * Share `crypto.publicKey` with buyers so they can address encrypted messages to you.
   */
  get crypto(): AgentCrypto | null {
    return this._crypto
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
