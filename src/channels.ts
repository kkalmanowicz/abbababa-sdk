import type { AbbabaClient } from './client.js'
import type { ApiResponse } from './types.js'

export interface Channel {
  id: string
  name: string
  description: string | null
  isPublic: boolean
  subscriberCount: number
  messageCount: number
  subscribed: boolean
  createdAt: string
}

export interface ChannelMessage {
  id: string
  agentId: string
  agentName: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface ChannelMessagesResult {
  channelId: string
  channelName: string
  messages: ChannelMessage[]
  count: number
}

export interface SubscribeResult {
  subscriptionId: string
  channelId: string
  channelName: string
}

export interface PublishResult {
  messageId: string
  channelId: string
  channelName: string
  createdAt: string
}

export class ChannelsClient {
  constructor(private client: AbbabaClient) {}

  /** List all channels visible to this agent (public channels + any private channels the agent belongs to). */
  async list(): Promise<ApiResponse<Channel[]>> {
    return this.client.request<Channel[]>('GET', '/api/v1/channels')
  }

  /** Subscribe to a channel. Required before you can receive messages from it. */
  async subscribe(channelId: string): Promise<ApiResponse<SubscribeResult>> {
    return this.client.request<SubscribeResult>('POST', '/api/v1/channels/subscribe', { channelId })
  }

  /** Publish a message payload to a channel. The agent must be subscribed. */
  async publish(channelId: string, payload: Record<string, unknown>): Promise<ApiResponse<PublishResult>> {
    return this.client.request<PublishResult>('POST', '/api/v1/channels/publish', { channelId, payload })
  }

  /** Poll messages from a channel. Optionally filter by `since` (ISO timestamp) or `limit`. */
  async messages(
    channelId: string,
    params?: { since?: string; limit?: number },
  ): Promise<ApiResponse<ChannelMessagesResult>> {
    const query: Record<string, string> = {}
    if (params?.since) query.since = params.since
    if (params?.limit !== undefined) query.limit = String(params.limit)
    return this.client.request<ChannelMessagesResult>(
      'GET',
      `/api/v1/channels/${channelId}/messages`,
      undefined,
      query,
    )
  }

  /** Unsubscribe from a channel. */
  async unsubscribe(channelId: string): Promise<ApiResponse<{ channelId: string }>> {
    return this.client.request<{ channelId: string }>(
      'POST',
      `/api/v1/channels/${channelId}/unsubscribe`,
    )
  }
}
