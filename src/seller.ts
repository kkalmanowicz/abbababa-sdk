import { AbbaBabaClient } from './client.js'
import type { WalletSender } from './wallet/escrow.js'
import { AgentCrypto, generateAttestation, verifyAttestation } from './crypto.js'
import type {
  AbbaBabaConfig,
  CreateServiceInput,
  Service,
  Transaction,
  PollOptions,
  ApiResponse,
  AgentStats,
  E2EDecryptResult,
  EncryptedEnvelope,
  DeliveryAttestation,
  SessionInfo,
} from './types.js'

export class SellerAgent {
  public readonly client: AbbaBabaClient
  private running = false
  private walletAddress: string | null = null
  private walletClient: WalletSender | null = null
  private _crypto: AgentCrypto | null = null

  constructor(config: AbbaBabaConfig) {
    this.client = new AbbaBabaClient(config)
  }

  /**
   * Detect the chain ID from the wallet client.
   * Returns the wallet's chain ID if available, otherwise defaults to Base Sepolia.
   */
  private async _detectChainId(): Promise<number> {
    const { BASE_MAINNET_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID } = await import('./wallet/constants.js')
    if (this.walletClient && 'chain' in this.walletClient) {
      const chainId = (this.walletClient as unknown as { chain?: { id: number } }).chain?.id
      if (chainId) return chainId
    }
    return BASE_SEPOLIA_CHAIN_ID
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

  /**
   * Initialize a plain EOA wallet for on-chain delivery signing.
   * The agent pays their own gas (~$0.02/tx on Base Sepolia).
   *
   * @param privateKey - 32-byte hex private key (0x-prefixed)
   * @param chain      - Target chain (default: 'baseSepolia')
   */
  async initEOAWallet(
    privateKey: string,
    chain?: 'baseSepolia' | 'base' | 'polygon' | 'polygonAmoy'
  ): Promise<string> {
    const { createEOAWallet } = await import('./wallet/eoa-wallet.js')
    const result = await createEOAWallet({ privateKey, chain })
    this.walletAddress = result.address
    this.walletClient = result.walletClient
    return result.address
  }

  /** Deliver results for a transaction via the API. */
  async deliver(transactionId: string, responsePayload: unknown): Promise<ApiResponse<Transaction>> {
    return this.client.transactions.deliver(transactionId, { responsePayload })
  }

  /**
   * Submit delivery proof on-chain. Seller signs directly — no platform relay.
   * Call this after deliver() to commit the proof hash to the escrow contract.
   * Requires initEOAWallet() to have been called first.
   *
   * @param proofHash - keccak256 hash of the delivery proof (0x-prefixed)
   */
  async submitDelivery(transactionId: string, proofHash: `0x${string}`): Promise<string> {
    if (!this.walletClient) {
      throw new Error('Wallet not initialized. Call initEOAWallet() first.')
    }
    const { EscrowClient } = await import('./wallet/escrow.js')
    const { createPublicClient, http } = await import('viem')
    const { baseSepolia, base } = await import('viem/chains')
    const { BASE_MAINNET_CHAIN_ID } = await import('./wallet/constants.js')

    const chainId = await this._detectChainId()
    const viemChain = chainId === BASE_MAINNET_CHAIN_ID ? base : baseSepolia
    const escrow = new EscrowClient(this.walletClient, undefined, chainId)
    const txHash = await escrow.submitDelivery(transactionId, proofHash)

    // Wait for the submitDelivery tx to be mined before returning.
    // Without this, the buyer's accept() call can race ahead and revert
    // because the on-chain proof hasn't been committed yet.
    const publicClient = createPublicClient({ chain: viemChain, transport: http() })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` })
    if (receipt.status === 'reverted') {
      throw new Error('submitDelivery() reverted on-chain. Check that the escrow exists and is in Funded status.')
    }

    return txHash
  }

  /**
   * Get own on-chain reputation score.
   * Does not require a wallet — read-only.
   */
  async getAgentScore(agentAddress?: string): Promise<AgentStats> {
    const address = agentAddress ?? this.walletAddress
    if (!address) {
      throw new Error('No address. Provide agentAddress or call initEOAWallet() first.')
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

  /**
   * Create a session bundle for a seller — purely local, no platform API call.
   *
   * Generates an ephemeral EOA wallet and E2E keypair for use in a delegated
   * seller agent process. No budget or allowedServices concept for sellers.
   *
   * Seller sessions are used to delegate delivery signing to an untrusted
   * process without exposing the main seller private key.
   *
   * @param opts.expiry - Session lifetime in seconds (default: 3600).
   * @returns SessionInfo with a `serialize()` method for the bundle string.
   */
  async createSession(
    opts?: { expiry?: number }
  ): Promise<Pick<SessionInfo, 'expiry' | 'walletAddress' | 'e2ePublicKey'> & { serialize(): string }> {
    const { generateSessionWallet, generateE2EKeypair, SessionBundle } = await import('./wallet/session-key.js')
    const wallet = generateSessionWallet()
    const e2eKeypair = generateE2EKeypair()
    const expirySecs = opts?.expiry ?? 3600
    const expiryTs = Math.floor(Date.now() / 1000) + expirySecs

    const bundlePayload = {
      token: '',        // seller sessions don't have a platform token
      agentId: '',
      budgetUsdc: null,
      expiry: expiryTs,
      walletPrivateKey: wallet.privateKey as string,
      walletAddress: wallet.address,
      e2ePrivateKey: e2eKeypair.privateKey,
      e2ePublicKey: e2eKeypair.publicKey,
    }

    const serialized = SessionBundle.serialize(bundlePayload)
    return {
      expiry: expiryTs,
      walletAddress: wallet.address,
      e2ePublicKey: e2eKeypair.publicKey,
      serialize: () => serialized,
    }
  }

  /**
   * Initialize this seller agent from a serialized session bundle.
   *
   * Sets the session EOA wallet (for on-chain delivery signing) and E2E crypto
   * keypair (for `decryptRequestPayload` / `deliverEncrypted`).
   *
   * Call this instead of `initEOAWallet()` + `initCrypto()` when operating
   * as a delegated session seller.
   *
   * @param serializedBundle - The string from `session.serialize()`.
   */
  async initWithSession(serializedBundle: string): Promise<void> {
    const { SessionBundle } = await import('./wallet/session-key.js')
    const payload = SessionBundle.deserialize(serializedBundle)

    if (payload.expiry < Math.floor(Date.now() / 1000)) {
      throw new Error('Session bundle has expired. Request a new session from the operator.')
    }

    await this.initEOAWallet(payload.walletPrivateKey)
    this.initCrypto(payload.e2ePrivateKey)
  }

  /** Stop the polling loop. */
  stop(): void {
    this.running = false
  }

  getWalletAddress(): string | null {
    return this.walletAddress
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
