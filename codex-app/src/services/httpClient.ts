import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

export interface HttpClientConfig {
  baseUrl?: string
  timeout?: number
  headers?: Record<string, string>
}

export interface HttpResponse<T = string> {
  data: T
  status: number
  headers: Record<string, string>
}

class HttpClient {
  private client: AxiosInstance
  private defaultHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  }

  constructor(config?: HttpClientConfig) {
    this.client = axios.create({
      baseURL: config?.baseUrl,
      timeout: config?.timeout || 30000,
      headers: {
        ...this.defaultHeaders,
        ...config?.headers,
      },
    })

    // Request interceptor for logging/debugging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[HTTP] ${config.method?.toUpperCase()} ${config.url}`)
        return config
      },
      (error) => {
        console.error('[HTTP] Request error:', error)
        return Promise.reject(error)
      }
    )

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[HTTP] Response ${response.status} from ${response.config.url}`)
        return response
      },
      (error) => {
        console.error('[HTTP] Response error:', error.message)
        return Promise.reject(error)
      }
    )
  }

  async get(url: string, config?: AxiosRequestConfig): Promise<HttpResponse> {
    const response: AxiosResponse = await this.client.get(url, config)
    return {
      data: response.data,
      status: response.status,
      headers: response.headers as Record<string, string>,
    }
  }

  async post(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<HttpResponse> {
    const response: AxiosResponse = await this.client.post(url, data, config)
    return {
      data: response.data,
      status: response.status,
      headers: response.headers as Record<string, string>,
    }
  }

  setHeader(key: string, value: string): void {
    this.client.defaults.headers.common[key] = value
  }

  setCookie(cookie: string): void {
    this.setHeader('Cookie', cookie)
  }

  setReferer(referer: string): void {
    this.setHeader('Referer', referer)
  }
}

// Singleton instance for the app
let httpClientInstance: HttpClient | null = null

export function getHttpClient(): HttpClient {
  if (!httpClientInstance) {
    httpClientInstance = new HttpClient()
  }
  return httpClientInstance
}

export function createHttpClient(config?: HttpClientConfig): HttpClient {
  return new HttpClient(config)
}

export default HttpClient
