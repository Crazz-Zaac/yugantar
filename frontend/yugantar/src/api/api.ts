import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ENV } from '@/config/env';

/*
 * Auth tokens (OWASP-recommended SPA pattern):
 *  - The short-lived ACCESS token lives only in memory (this module), never in
 *    localStorage, so injected script can't read it back out of storage and it
 *    disappears when the tab closes.
 *  - The REFRESH token is an httpOnly cookie set by the backend; JavaScript
 *    never sees it. On page load and on any 401 we call /auth/refresh to get a
 *    new access token.
 *  - The backend rotates the refresh token on every refresh. To stop two tabs
 *    from refreshing at the same moment (one would use an already-rotated
 *    token and be logged out), refreshes are serialised across tabs with the
 *    Web Locks API. The cookie jar is shared, so the second tab simply uses
 *    the newly rotated cookie.
 */

export const apiClient = axios.create({
  baseURL: ENV.API_BASE,
  withCredentials: true,
});

// Used only for /auth/refresh, so it never goes through the 401 interceptor
const refreshClient = axios.create({
  baseURL: ENV.API_BASE,
  withCredentials: true,
});

// ─── In-memory access token ────────────────────────────────────────────────

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

// ─── Refresh (single-flight within a tab, serialised across tabs) ──────────

const REFRESH_LOCK = 'yugantar-auth-refresh';
let inflightRefresh: Promise<string> | null = null;

function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  // Supported by all current browsers; fall back to no lock if missing
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(REFRESH_LOCK, fn) as Promise<T>;
  }
  return fn();
}

/** Get a fresh access token using the httpOnly refresh cookie. */
export function refreshAccessToken(): Promise<string> {
  if (!inflightRefresh) {
    inflightRefresh = withCrossTabLock(async () => {
      const res = await refreshClient.post('/auth/refresh');
      const token: string = res.data.access_token;
      setAccessToken(token);
      return token;
    }).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

// ─── Cross-tab logout ──────────────────────────────────────────────────────

const authChannel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('yugantar-auth') : null;

export type AuthBroadcast = { type: 'logout' } | { type: 'login' };

export function broadcastAuth(message: AuthBroadcast): void {
  authChannel?.postMessage(message);
}

export function onAuthBroadcast(handler: (message: AuthBroadcast) => void): () => void {
  if (!authChannel) return () => {};
  const listener = (event: MessageEvent<AuthBroadcast>) => handler(event.data);
  authChannel.addEventListener('message', listener);
  return () => authChannel.removeEventListener('message', listener);
}

// ─── Interceptors ──────────────────────────────────────────────────────────

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Custom event dispatched when refresh fails — AuthContext listens to this
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/users/login', '/users/register'];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh for 401s that haven't already been retried
    if (!originalRequest || error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    const url = originalRequest.url || '';
    if (AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint))) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    try {
      const newToken = await refreshAccessToken();
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Session is truly over (expired, revoked, account blocked)
      setAccessToken(null);
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      return Promise.reject(refreshError);
    }
  }
);
