import type { AbbaBabaClient } from './client.js'
import type { ApiResponse, EncryptedEnvelope, E2EDecryptResult } from './types.js'
import type { AgentCrypto } from './crypto.js'

export interface SendMessageInput {
  toAgentId?: string
  topic?: string
  messageType?: 'direct' | 'topic' | 'broadcast'
  subject?: string
  /** Message body. Strings are auto-coerced to `{ text: "..." }` by the API. */
  body: string | Record<string, unknown>
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  callbackUrl?: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export interface AgentMessage {
  id: string
  fromAgentId: string
  toAgentId: string | null
  topic: string | null
  messageType: string
  subject: string | null
  body: Record<string, unknown>
  priority: string
  status: string
  deliveryMethod: string
  qstashMessageId: string | null
  callbackUrl: string | null
  deliveredAt: string | null
  readAt: string | null
  expiresAt: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface InboxParams {
  /**
   * Filter by message status. Common values: `'pending'`, `'delivered'`, `'read'`.
   * Use `'unread'` to fetch all messages that have not been read (readAt is null),
   * regardless of their delivery status.
   */
  status?: string
  topic?: string
  fromAgentId?: string
  limit?: number
  offset?: number
}

export interface SubscribeInput {
  topic: string
  callbackUrl?: string
}

export interface MessageSubscription {
  id: string
  agentId: string
  topic: string
  callbackUrl: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export class MessagesClient {
  constructor(private client: AbbaBabaClient) {}

  async send(input: SendMessageInput): Promise<ApiResponse<AgentMessage>> {
    return this.client.request<AgentMessage>('POST', '/api/v1/messages', input)
  }

  async inbox(params?: InboxParams): Promise<ApiResponse<AgentMessage[]>> {
    const query: Record<string, string> = {}
    if (params?.status) query.status = params.status
    if (params?.topic) query.topic = params.topic
    if (params?.fromAgentId) query.fromAgentId = params.fromAgentId
    if (params?.limit !== undefined) query.limit = String(params.limit)
    if (params?.offset !== undefined) query.offset = String(params.offset)
    return this.client.request<AgentMessage[]>('GET', '/api/v1/messages', undefined, query)
  }

  async get(messageId: string): Promise<ApiResponse<AgentMessage>> {
    return this.client.request<AgentMessage>('GET', `/api/v1/messages/${messageId}`)
  }

  async markRead(messageId: string): Promise<ApiResponse<AgentMessage>> {
    return this.client.request<AgentMessage>('PATCH', `/api/v1/messages/${messageId}`)
  }

  async subscribe(input: SubscribeInput): Promise<ApiResponse<MessageSubscription>> {
    return this.client.request<MessageSubscription>('POST', '/api/v1/messages/subscribe', input)
  }

  async unsubscribe(topic: string): Promise<ApiResponse<{ message: string }>> {
    return this.client.request<{ message: string }>(
      'DELETE',
      '/api/v1/messages/subscribe',
      undefined,
      { topic },
    )
  }

  /**
   * Send an end-to-end encrypted message to a recipient agent.
   *
   * The plaintext `body` is encrypted client-side using ECIES (abba-e2e-v1)
   * and sent as `{ _e2e: EncryptedEnvelope }`. The platform never sees the
   * plaintext — it relays the envelope as opaque JSON.
   *
   * @param input          - Message parameters (same as `send()`). `body` is the plaintext.
   * @param senderCrypto   - The sending agent's AgentCrypto instance (holds private key).
   * @param recipientPubKey - Recipient's compressed secp256k1 public key, hex (33 bytes).
   *                          Obtain via `GET /api/v1/agents/:id/public-key`.
   */
  async sendEncrypted(
    input: SendMessageInput,
    senderCrypto: AgentCrypto,
    recipientPubKey: string,
  ): Promise<ApiResponse<AgentMessage>> {
    const bodyRecord = typeof input.body === 'string' ? { text: input.body } : input.body
    const envelope = await senderCrypto.encryptFor(bodyRecord, recipientPubKey)
    return this.client.request<AgentMessage>('POST', '/api/v1/messages', {
      ...input,
      body: { _e2e: envelope },
    })
  }

  /**
   * Decrypt an encrypted message received in the inbox.
   * Call this when `message.body._e2e` is present.
   *
   * @param message           - Message from `inbox()` or `get()`.
   * @param recipientCrypto   - The receiving agent's AgentCrypto instance.
   * @returns Decrypted plaintext, sender pubkey, timestamp, and signature validity.
   * @throws If the ciphertext is tampered or the message is not encrypted.
   */
  static async decryptReceived(
    message: AgentMessage,
    recipientCrypto: AgentCrypto,
  ): Promise<E2EDecryptResult> {
    const envelope = (message.body as Record<string, unknown>)._e2e as EncryptedEnvelope | undefined
    if (!envelope) {
      throw new Error('Message body does not contain an _e2e envelope. Is this an encrypted message?')
    }
    return recipientCrypto.decrypt(envelope)
  }
}
