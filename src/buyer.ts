import { AbbaBabaClient } from './client.js'
import { WebhookServer } from './webhook.js'
import { AgentCrypto, verifyAttestation } from './crypto.js'
import type { WalletSender } from './wallet/escrow.js'
import type {
  AbbaBabaConfig,
  Service,
  ServiceSearchParams,
  CheckoutInput,
  CheckoutResult,
  Transaction,
  ApiResponse,
  WebhookHandler,
  AgentStats,
  E2EDecryptResult,
  EncryptedEnvelope,
  DeliveryAttestation,
  CreateSessionOpts,
  SessionInfo,
} from './types.js'

export class BuyerAgent {
  public readonly client: AbbaBabaClient
  private webhookServer: WebhookServer | null = null
  private walletAddress: string | null = null
  private walletClient: WalletSender | null = null
  private resolvedGasStrategy: 'self-funded' | null = null
  private _crypto: AgentCrypto | null = null

  constructor(config: AbbaBabaConfig) {
    this.client = new AbbaBabaClient(config)
  }

  /** Search the marketplace for services. */
  async findServices(
    query: string,
    filters?: Omit<ServiceSearchParams, 'q'>
  ): Promise<Service[]> {
    const res = await this.client.services.search({ q: query, ...filters })
    if (!res.success || !res.data) {
      throw new Error(res.error ?? 'Search failed')
    }
    return res.data.services
  }

  /** Purchase a service. Returns checkout result with payment instructions. */
  async purchase(input: CheckoutInput): Promise<CheckoutResult> {
    const res = await this.client.checkout.purchase(input)
    if (!res.success || !res.data) {
      throw new Error(res.error ?? 'Purchase failed')
    }
    return res.data
  }

  /** Confirm delivery and release escrow via the API. */
  async confirm(transactionId: string): Promise<ApiResponse<Transaction>> {
    return this.client.transactions.confirm(transactionId)
  }

  /** Open a dispute on a transaction via the API. */
  async dispute(transactionId: string, reason: string): Promise<ApiResponse<Transaction>> {
    return this.client.transactions.dispute(transactionId, { reason })
  }

  /**
   * Start a webhook server to receive delivery notifications.
   * Returns the callback URL to pass to checkout.
   *
   * @param port    Port to listen on
   * @param handler Async function called with each webhook event
   * @param options.signingSecret  WEBHOOK_SIGNING_SECRET — when provided, requests with
   *                               an invalid or missing X-Abbababa-Signature are rejected
   *                               with 401. Strongly recommended in production.
   * @param options.path           URL path (default: '/webhook')
   */
  async onDelivery(
    port: number,
    handler: WebhookHandler,
    options?: { signingSecret?: string; path?: string }
  ): Promise<{ url: string }> {
    this.webhookServer = new WebhookServer(handler, options)
    return this.webhookServer.start(port)
  }

  /** Stop the webhook server. */
  async stopWebhook(): Promise<void> {
    if (this.webhookServer) {
      await this.webhookServer.stop()
      this.webhookServer = null
    }
  }

  /**
   * Initialize a plain EOA wallet for on-chain payments.
   * The agent pays their own gas (~$0.02/flow on Base Sepolia).
   * No ZeroDev or smart account required.
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
    this.resolvedGasStrategy = 'self-funded'
    return result.address
  }

  /**
   * Fund an on-chain escrow for a transaction (V2 — includes deadline).
   * Requires initEOAWallet() to have been called first.
   * @param tokenSymbol - Settlement token symbol (default: 'USDC').
   * @param deadline - Unix timestamp after which the seller must deliver.
   * Returns the on-chain transaction hash.
   */
  async fundEscrow(
    transactionId: string,
    sellerAddress: string,
    amount: bigint,
    tokenSymbol: string = 'USDC',
    deadline: bigint = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400)
  ): Promise<string> {
    if (!this.walletClient) {
      throw new Error('Wallet not initialized. Call initEOAWallet() first.')
    }
    const { EscrowClient } = await import('./wallet/escrow.js')
    const { getToken, BASE_SEPOLIA_CHAIN_ID } = await import('./wallet/constants.js')
    const { createPublicClient, http } = await import('viem')
    const { baseSepolia } = await import('viem/chains')
    const token = getToken(BASE_SEPOLIA_CHAIN_ID, tokenSymbol)
    const escrow = new EscrowClient(this.walletClient, token)

    // Step 1: Approve token spending (includes 2% fee automatically)
    const approveTxHash = await escrow.approveToken(amount)

    // Step 2: Wait for approve receipt so the nonce is confirmed on-chain.
    // Without this, the createEscrow call can get the same nonce as the approve
    // and revert with "nonce too low" on networks with slow tx propagation.
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() })
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash as `0x${string}` })

    // Step 3: Create escrow on-chain
    return escrow.fundEscrow(transactionId, sellerAddress, amount, deadline)
  }

  /**
   * Fund escrow on-chain and verify with the backend.
   * This is the complete funding flow:
   *   1. Approve token spending
   *   2. Call createEscrow on the V2 escrow contract
   *   3. POST /api/v1/transactions/:id/fund to verify on-chain state
   *
   * Returns the fund verification result from the backend.
   * Requires initEOAWallet() to have been called first.
   */
  async fundAndVerify(
    transactionId: string,
    sellerAddress: string,
    amount: bigint,
    tokenSymbol: string = 'USDC',
    deadline: bigint = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400)
  ): Promise<ApiResponse<import('./types.js').FundResult>> {
    const txHash = await this.fundEscrow(transactionId, sellerAddress, amount, tokenSymbol, deadline)
    return this.client.transactions.fund(transactionId, { txHash })
  }

  /**
   * Accept delivery on-chain and confirm via the API.
   *
   * V2 flow: The buyer's own wallet must call accept() on the escrow contract
   * (the platform cannot do this — the contract enforces msg.sender == buyer).
   * After the on-chain release succeeds, the API confirm updates the DB record.
   *
   * Requires initEOAWallet() to have been called first.
   */
  async confirmAndRelease(transactionId: string): Promise<void> {
    // Step 1: On-chain accept with buyer's own EOA wallet (required — only buyer can call)
    if (!this.walletClient) {
      throw new Error('Wallet not initialized. Call initEOAWallet() first.')
    }
    const { EscrowClient } = await import('./wallet/escrow.js')
    const { createPublicClient, http } = await import('viem')
    const { baseSepolia } = await import('viem/chains')

    const escrow = new EscrowClient(this.walletClient)
    const acceptTxHash = await escrow.acceptDelivery(transactionId)

    // Wait for on-chain confirmation before updating the API
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() })
    await publicClient.waitForTransactionReceipt({ hash: acceptTxHash as `0x${string}` })

    // Step 2: API confirm (marks transaction completed server-side)
    await this.client.transactions.confirm(transactionId)
  }

  /**
   * Dispute a delivery on-chain within the 24h dispute window.
   * Returns the on-chain transaction hash.
   */
  async disputeOnChain(transactionId: string): Promise<string> {
    if (!this.walletClient) {
      throw new Error('Wallet not initialized. Call initEOAWallet() first.')
    }
    const { EscrowClient } = await import('./wallet/escrow.js')
    const escrow = new EscrowClient(this.walletClient)
    return escrow.disputeEscrow(transactionId)
  }

  /**
   * Claim funds for an abandoned escrow (deadline + 2 days passed).
   * Returns the on-chain transaction hash.
   */
  async claimAbandoned(transactionId: string): Promise<string> {
    if (!this.walletClient) {
      throw new Error('Wallet not initialized. Call initEOAWallet() first.')
    }
    const { EscrowClient } = await import('./wallet/escrow.js')
    const escrow = new EscrowClient(this.walletClient)
    return escrow.claimAbandoned(transactionId)
  }

  /**
   * Get an agent's on-chain reputation score on Base Sepolia (testnet).
   * Does not require a wallet — read-only.
   */
  async getAgentScore(agentAddress: string): Promise<AgentStats> {
    const { ScoreClient } = await import('./wallet/escrow.js')
    const score = new ScoreClient()
    return score.getAgentStats(agentAddress)
  }

  /**
   * Get an agent's on-chain score from Base Sepolia testnet.
   * Returns the raw int256 score value.
   */
  async getTestnetScore(agentAddress: string): Promise<number> {
    const { ScoreClient } = await import('./wallet/escrow.js')
    const { BASE_SEPOLIA_CHAIN_ID } = await import('./wallet/constants.js')
    const scoreClient = new ScoreClient(BASE_SEPOLIA_CHAIN_ID)
    const raw = await scoreClient.getScore(agentAddress)
    return Number(raw)
  }

  /**
   * Check if an agent is eligible to transact on Base Mainnet.
   * Eligibility requires earning ≥10 reputation points on Base Sepolia testnet.
   * Returns current testnet score and whether the agent has graduated.
   */
  async getMainnetEligibility(agentAddress: string): Promise<{
    eligible: boolean
    testnetScore: number
    required: number
  }> {
    const { MAINNET_GRADUATION_SCORE } = await import('./wallet/constants.js')
    const testnetScore = await this.getTestnetScore(agentAddress)
    return {
      eligible: testnetScore >= MAINNET_GRADUATION_SCORE,
      testnetScore,
      required: MAINNET_GRADUATION_SCORE,
    }
  }

  /**
   * Create a session key bundle for delegation to an autonomous agent.
   *
   * Generates an ephemeral EOA wallet and E2E keypair locally, then registers
   * the session wallet address with the platform. Returns a `SessionInfo` with
   * a `serialize()` method to produce the bundle string for the agent.
   *
   * After calling `createSession()`:
   * 1. Fund `session.walletAddress` with USDC (up to `budgetUsdc`) + a small
   *    ETH gas reserve using `fundSession(session)`.
   * 2. Serialize: `const bundle = session.serialize()`
   * 3. Pass `bundle` to the agent process.
   * 4. Agent calls `agentBuyer.initWithSession(bundle)` — fully operational.
   *
   * Requires a valid API key (`this.client`) — does NOT require initEOAWallet().
   */
  async createSession(opts?: CreateSessionOpts): Promise<SessionInfo & { serialize(): string }> {
    const { generateSessionWallet, generateE2EKeypair, SessionBundle } = await import('./wallet/session-key.js')
    const wallet = generateSessionWallet()
    const e2eKeypair = generateE2EKeypair()
    const expirySecs = opts?.expiry ?? 3600
    const expiryTs = Math.floor(Date.now() / 1000) + expirySecs

    const res = await this.client.request<{ sessionId: string; token: string; expiresAt: string }>(
      'POST',
      '/api/v1/agents/session',
      {
        budgetUsdc: opts?.budgetUsdc ?? null,
        expiry: expirySecs,
        allowedServiceIds: opts?.allowedServiceIds ?? [],
        sessionWallet: wallet.address,
        e2ePublicKey: e2eKeypair.publicKey,
      }
    )

    if (!res.success || !res.data) {
      throw new Error(res.error ?? 'Failed to create session')
    }

    const bundlePayload = {
      token: res.data.token,
      agentId: '', // agentId is encoded into the session token on the platform side
      budgetUsdc: opts?.budgetUsdc ?? null,
      expiry: expiryTs,
      walletPrivateKey: wallet.privateKey as string,
      walletAddress: wallet.address,
      e2ePrivateKey: e2eKeypair.privateKey,
      e2ePublicKey: e2eKeypair.publicKey,
    }

    const serialized = SessionBundle.serialize(bundlePayload)
    const info: SessionInfo = {
      sessionId: res.data.sessionId,
      token: res.data.token,
      agentId: bundlePayload.agentId,
      budgetUsdc: opts?.budgetUsdc ?? null,
      expiry: expiryTs,
      walletAddress: wallet.address,
      e2ePublicKey: e2eKeypair.publicKey,
    }

    return { ...info, serialize: () => serialized }
  }

  /**
   * Initialize this agent from a serialized session bundle.
   *
   * Sets the session EOA wallet (for on-chain signing) and E2E crypto keypair
   * (for `purchaseEncrypted` / `decryptResponsePayload`). The API client already
   * uses the session token via the constructor `apiKey`.
   *
   * Call this instead of `initEOAWallet()` + `initCrypto()` when operating
   * as a delegated session agent.
   *
   * @param serializedBundle - The string from `session.serialize()`.
   */
  async initWithSession(serializedBundle: string): Promise<void> {
    const { SessionBundle } = await import('./wallet/session-key.js')
    const payload = SessionBundle.deserialize(serializedBundle)

    if (payload.expiry < Math.floor(Date.now() / 1000)) {
      throw new Error('Session bundle has expired. Request a new session from the operator.')
    }

    // Initialize EOA wallet from the session private key
    await this.initEOAWallet(payload.walletPrivateKey)

    // Initialize E2E crypto from the session E2E keypair
    this.initCrypto(payload.e2ePrivateKey)
  }

  /**
   * Fund a session wallet with USDC + a small ETH gas reserve.
   *
   * Transfers `session.budgetUsdc` USDC and 0.01 ETH from the main wallet
   * (which must be initialized via `initEOAWallet()`) to the session EOA address.
   * This sets the blockchain-enforced hard cap — the agent cannot spend more
   * than what's in the session wallet regardless of the API soft cap.
   *
   * Requires `initEOAWallet()` to have been called with the MAIN wallet first.
   *
   * @param session - The SessionInfo returned by `createSession()`.
   * @param tokenSymbol - Token to transfer (default: 'USDC').
   * @returns On-chain USDC transfer transaction hash.
   */
  async fundSession(
    session: Pick<SessionInfo, 'walletAddress' | 'budgetUsdc'>,
    tokenSymbol: string = 'USDC'
  ): Promise<string> {
    if (!this.walletClient) {
      throw new Error('Main wallet not initialized. Call initEOAWallet() with the main private key first.')
    }
    if (session.budgetUsdc === null || session.budgetUsdc <= 0) {
      throw new Error('budgetUsdc must be a positive number to fund a session wallet.')
    }

    const { EscrowClient } = await import('./wallet/escrow.js')
    const { getToken, BASE_SEPOLIA_CHAIN_ID } = await import('./wallet/constants.js')
    const token = getToken(BASE_SEPOLIA_CHAIN_ID, tokenSymbol)
    if (!token) throw new Error(`Token ${tokenSymbol} not found for chain ${BASE_SEPOLIA_CHAIN_ID}`)
    const escrow = new EscrowClient(this.walletClient, token)

    // Transfer USDC to session wallet
    const amountUnits = BigInt(Math.round(session.budgetUsdc * 10 ** token.decimals))
    return escrow.transferToken(session.walletAddress as `0x${string}`, amountUnits)
  }

  /**
   * Reclaim remaining USDC from an expired or exhausted session wallet.
   *
   * Reads the current USDC balance of this wallet (the session wallet) and
   * transfers it to `mainWalletAddress`. Call this after the session expires.
   *
   * This must be called on a BuyerAgent initialized with the SESSION private key
   * (via `initWithSession(bundle)`), not the main wallet:
   * ```ts
   * const reclaimer = new BuyerAgent({ apiKey: session.token })
   * await reclaimer.initWithSession(bundle)
   * await reclaimer.reclaimSession(MAIN_WALLET_ADDRESS)
   * ```
   *
   * @param mainWalletAddress - Destination address to receive the swept USDC.
   * @param tokenSymbol - Token to reclaim (default: 'USDC').
   * @returns On-chain USDC transfer transaction hash, or `null` if balance is zero.
   */
  async reclaimSession(
    mainWalletAddress: string,
    tokenSymbol: string = 'USDC'
  ): Promise<string | null> {
    if (!this.walletClient || !this.walletAddress) {
      throw new Error(
        'Session wallet not initialized. Call initWithSession(bundle) on a BuyerAgent ' +
        'configured with the session token, then call reclaimSession(mainWalletAddress).'
      )
    }

    const { EscrowClient } = await import('./wallet/escrow.js')
    const { getToken, BASE_SEPOLIA_CHAIN_ID } = await import('./wallet/constants.js')
    const token = getToken(BASE_SEPOLIA_CHAIN_ID, tokenSymbol)
    const escrow = new EscrowClient(this.walletClient, token)

    return escrow.sweepToken(
      this.walletAddress as `0x${string}`,
      mainWalletAddress as `0x${string}`
    )
  }

  getWalletAddress(): string | null {
    return this.walletAddress
  }

  /** Returns the resolved gas strategy after initEOAWallet(). */
  getGasStrategy(): 'self-funded' | null {
    return this.resolvedGasStrategy
  }

  /**
   * Purchase a service with an encrypted `requestPayload`.
   *
   * Encrypts `input.requestPayload` client-side using the seller agent's E2E public key
   * before the request leaves the SDK. The platform stores `{ _e2e: EncryptedEnvelope }`
   * and the seller decrypts it with `decryptRequestPayload()`. The platform never sees
   * the plaintext job spec.
   *
   * Requires `initCrypto()` to have been called first.
   *
   * @param input          - Checkout parameters. `requestPayload` is the plaintext to encrypt.
   * @param sellerAgentId  - The seller agent's ID. Their E2E public key is fetched automatically.
   */
  async purchaseEncrypted(input: CheckoutInput, sellerAgentId: string): Promise<CheckoutResult> {
    if (!this._crypto) {
      throw new Error('E2E crypto not initialized. Call initCrypto() first.')
    }
    const keyRes = await this.client.agents.getE2EPublicKey(sellerAgentId)
    if (!keyRes.success || !keyRes.data) {
      throw new Error(keyRes.error ?? 'Could not fetch seller E2E public key')
    }
    const sellerPubKey = keyRes.data.publicKey
    const plainPayload = (input.requestPayload ?? {}) as Record<string, unknown>
    const envelope = await this._crypto.encryptFor(plainPayload, sellerPubKey)
    const res = await this.client.checkout.purchase({
      ...input,
      requestPayload: { _e2e: envelope },
    })
    if (!res.success || !res.data) {
      throw new Error(res.error ?? 'Purchase failed')
    }
    return res.data
  }

  /**
   * Decrypt an encrypted `responsePayload` from a completed transaction.
   *
   * Call this after the seller delivers — if the seller used `deliverEncrypted()`,
   * `transaction.responsePayload` will be `{ _e2e: EncryptedEnvelope }`.
   *
   * Requires `initCrypto()` to have been called first.
   *
   * @throws If the payload is not encrypted or the crypto context is missing.
   */
  async decryptResponsePayload(transaction: Transaction): Promise<E2EDecryptResult> {
    if (!this._crypto) {
      throw new Error('E2E crypto not initialized. Call initCrypto() first.')
    }
    const payload = transaction.responsePayload as Record<string, unknown> | null | undefined
    if (!payload?._e2e) {
      throw new Error(
        'responsePayload does not contain an _e2e envelope. Was it sent with deliverEncrypted()?'
      )
    }
    return this._crypto.decrypt(payload._e2e as import('./types.js').EncryptedEnvelope)
  }

  /**
   * Auto-decrypt the encrypted `responsePayload` and submit it as dispute evidence.
   *
   * Fetches the transaction, decrypts `responsePayload._e2e`, verifies the sender
   * signature, optionally verifies the attestation hash, then submits as
   * `decrypted_payload` evidence to give the resolver full plaintext.
   *
   * Requires `initCrypto()` to have been called first.
   *
   * @param transactionId - The disputed transaction.
   */
  async submitPayloadEvidence(
    transactionId: string,
  ): Promise<ApiResponse<{ evidenceId: string }>> {
    if (!this._crypto) {
      throw new Error('E2E crypto not initialized. Call initCrypto() first.')
    }
    const txRes = await this.client.transactions.get(transactionId)
    if (!txRes.success || !txRes.data) {
      throw new Error(txRes.error ?? 'Could not fetch transaction')
    }
    const rp = txRes.data.responsePayload as Record<string, unknown> | null | undefined
    if (!rp?._e2e) {
      throw new Error(
        'responsePayload does not contain an _e2e envelope. Was it sent with deliverEncrypted()?'
      )
    }

    const result = await this._crypto.decrypt(rp._e2e as EncryptedEnvelope)
    const attestation = rp.attestation as DeliveryAttestation | undefined

    let hashVerified = false
    if (attestation) {
      hashVerified = verifyAttestation(result.plaintext, attestation)
    }

    return this.client.transactions.submitEvidence(transactionId, {
      evidenceType: 'decrypted_payload',
      description: `Buyer discloses encrypted responsePayload. Sender sig verified: ${result.verified}. Hash verified: ${hashVerified}`,
      contentHash: attestation?.hash,
      metadata: {
        role: 'buyer',
        payload: result.plaintext,
        senderVerified: result.verified,
        hashVerified,
      },
    })
  }

  /**
   * Initialize E2E encryption for this agent using a secp256k1 private key.
   * After calling this, use `this.crypto` to encrypt messages for recipients
   * and decrypt messages received from them.
   *
   * Store the private key in your secret manager — losing it means you
   * cannot decrypt historical messages. The derived public key is shared
   * with recipients so they can encrypt messages addressed to you.
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
   * Use `crypto.publicKey` to share your address with senders.
   * Use `crypto.encryptFor(body, recipientPubKey)` to encrypt outgoing messages.
   * Use `MessagesClient.decryptReceived(message, crypto)` to decrypt incoming ones.
   */
  get crypto(): AgentCrypto | null {
    return this._crypto
  }
}
