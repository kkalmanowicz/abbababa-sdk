import type { AbbabaConfig, ApiResponse } from './types.js'
import {
  AbbabaError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  PaymentRequiredError,
  RateLimitError,
  ValidationError,
} from './errors.js'
import { ServicesClient } from './services.js'
import { CheckoutClient } from './checkout.js'
import { TransactionsClient } from './transactions.js'
import { MemoryClient } from './memory.js'
import { MessagesClient } from './messages.js'
import { ChannelsClient } from './channels.js'
import { register, type RegisterOptions, type RegisterResult } from './register.js'

const DEFAULT_BASE_URL = 'https://abbababa.com'
const DEFAULT_TIMEOUT = 30_000

export class AbbabaClient {
  private apiKey: string
  private baseUrl: string
  private timeout: number

  public readonly services: ServicesClient
  public readonly checkout: CheckoutClient
  public readonly transactions: TransactionsClient
  public readonly memory: MemoryClient
  public readonly messages: MessagesClient
  public readonly channels: ChannelsClient

  /**
   * Headless registration: sign with a wallet private key, receive an API key.
   * No browser, email, or CAPTCHA required.
   */
  static register(opts: RegisterOptions): Promise<RegisterResult> {
    return register(opts)
  }

  constructor(config: AbbabaConfig) {
    if (!config.apiKey) {
      throw new Error('apiKey is required')
    }

    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT

    this.services = new ServicesClient(this)
    this.checkout = new CheckoutClient(this)
    this.transactions = new TransactionsClient(this)
    this.memory = new MemoryClient(this)
    this.messages = new MessagesClient(this)
    this.channels = new ChannelsClient(this)
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    let url = `${this.baseUrl}${path}`

    if (queryParams) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== '') {
          params.set(key, value)
        }
      }
      const qs = params.toString()
      if (qs) url += `?${qs}`
    }

    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Accept': 'application/json',
    }

    const init: RequestInit & { signal?: AbortSignal } = {
      method,
      headers,
    }

    if (body !== undefined && method !== 'GET') {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }

    const controller = new AbortController()
    init.signal = controller.signal
    const timer = setTimeout(() => controller.abort(), this.timeout)

    let response: Response
    try {
      response = await fetch(url, init)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new AbbabaError(0, `Request timed out after ${this.timeout}ms`)
      }
      throw new AbbabaError(0, `Network error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
    }

    let json: ApiResponse<T>
    try {
      json = await response.json() as ApiResponse<T>
    } catch {
      throw new AbbabaError(
        response.status,
        `Invalid JSON response (HTTP ${response.status})`
      )
    }

    if (!response.ok) {
      const message = json.error ?? `HTTP ${response.status}`
      switch (response.status) {
        case 401:
          throw new AuthenticationError(message)
        case 402: {
          throw new PaymentRequiredError(message, json)
        }
        case 403:
          throw new ForbiddenError(message)
        case 404:
          throw new NotFoundError(message)
        case 400: {
          // Surface the details array in the error message so callers can
          // see which fields failed without inspecting error.details manually.
          // e.g. "Invalid checkout data: callbackUrl — Invalid URL"
          let detailMessage = message
          if (Array.isArray(json.details) && json.details.length > 0) {
            const fieldErrors = (json.details as Array<{ path?: unknown[]; message?: string }>)
              .map(d => {
                const field = Array.isArray(d.path) && d.path.length > 0 ? d.path.join('.') : 'unknown'
                return `${field} — ${d.message ?? 'invalid'}`
              })
              .join('; ')
            detailMessage = `${message}: ${fieldErrors}`
          }
          throw new ValidationError(detailMessage, json.details)
        }
        case 429: {
          const retryAfter = parseInt(
            response.headers.get('Retry-After') ?? '60',
            10
          )
          throw new RateLimitError(message, retryAfter)
        }
        default:
          throw new AbbabaError(response.status, message, json.details)
      }
    }

    return json
  }
}
