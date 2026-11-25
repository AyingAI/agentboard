export type ApiProvider = 'claude' | 'openai';

export const DEFAULT_API_BASE_URL: Record<ApiProvider, string> = {
  claude: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
};

export const INVALID_API_BASE_URL = 'Base URL 必须使用 HTTPS。本机模型可以使用 localhost、127.0.0.1 或 [::1] 的 HTTP 地址。请移除网址中的登录信息、查询参数或片段。';

export function normalizeApiBaseUrl(provider: ApiProvider, rawUrl?: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl?.trim() || DEFAULT_API_BASE_URL[provider]);
  } catch {
    return null;
  }
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) return null;
  if (url.username || url.password || url.search || url.hash) return null;

  const path = url.pathname.replace(/\/+$/, '');
  return url.origin + (/\/v\d+$/i.test(path) ? path : `${path}/v1`);
}

export const apiFetchOptions = {
  redirect: 'error',
  credentials: 'omit',
  referrerPolicy: 'no-referrer',
  cache: 'no-store',
} as const satisfies RequestInit;
