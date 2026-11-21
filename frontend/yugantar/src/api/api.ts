import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getLang } from "@/lib/i18n";
import { ENV } from "@/config/env";

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

const REFRESH_LOCK = "yugantar-auth-refresh";
let inflightRefresh: Promise<string> | null = null;

function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  // Supported by all current browsers; fall back to no lock if missing
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(REFRESH_LOCK, fn) as Promise<T>;
  }
  return fn();
}

/** Get a fresh access token using the httpOnly refresh cookie. */
export function refreshAccessToken(): Promise<string> {
  if (!inflightRefresh) {
    inflightRefresh = withCrossTabLock(async () => {
      const res = await refreshClient.post("/auth/refresh");
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
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("yugantar-auth")
    : null;

export type AuthBroadcast = { type: "logout" } | { type: "login" };

export function broadcastAuth(message: AuthBroadcast): void {
  authChannel?.postMessage(message);
}

export function onAuthBroadcast(
  handler: (message: AuthBroadcast) => void
): () => void {
  if (!authChannel) return () => {};
  const listener = (event: MessageEvent<AuthBroadcast>) => handler(event.data);
  authChannel.addEventListener("message", listener);
  return () => authChannel.removeEventListener("message", listener);
}

// ─── Interceptors ──────────────────────────────────────────────────────────

apiClient.interceptors.request.use(config => {
  // Server texts (errors, notifications) in the interface language
  config.headers["X-Language"] = getLang();
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Custom event dispatched when refresh fails — AuthContext listens to this
export const SESSION_EXPIRED_EVENT = "auth:session-expired";

const AUTH_ENDPOINTS = [
  "/auth/login",
  "/auth/refresh",
  "/auth/mfa", // wrong-code 401s must not trigger a token refresh
  "/users/login",
  "/users/register",
];

apiClient.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh for 401s that haven't already been retried
    if (
      !originalRequest ||
      error.response?.status !== 401 ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }
    const url = originalRequest.url || "";
    if (AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint))) {
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

// ─── Multi-factor authentication ────────────────────────────────────────────
//
// Sign-in is two steps: POST /users/login verifies the password and returns a
// short-lived mfa_token (no access token yet); the second factor is completed
// on /auth/mfa/*, which returns the real access token. During the MFA step the
// mfa_token is sent explicitly as a Bearer token (the in-memory access token is
// still null, so the request interceptor leaves our header untouched).

export interface LoginStep1Response {
  access_token: string;
  mfa_required: boolean;
  mfa_setup_required: boolean;
  mfa_token: string;
}

export async function loginStep1(
  email: string,
  password: string
): Promise<LoginStep1Response> {
  const res = await apiClient.post("/users/login", { email, password });
  return res.data;
}

const mfaAuth = (mfaToken: string) => ({
  headers: { Authorization: `Bearer ${mfaToken}` },
});

// Enrolment is done from Settings by the signed-in user (normal access token).
export async function mfaSetup(): Promise<{
  secret: string;
  otpauth_uri: string;
}> {
  return (await apiClient.post("/auth/mfa/setup")).data;
}

export async function mfaConfirmSetup(
  code: string
): Promise<{ recovery_codes: string[] }> {
  return (await apiClient.post("/auth/mfa/setup/confirm", { code })).data;
}

export async function mfaChallenge(
  mfaToken: string,
  code: string
): Promise<{ access_token: string }> {
  const res = await apiClient.post(
    "/auth/mfa/challenge",
    { code },
    mfaAuth(mfaToken)
  );
  return res.data;
}

// Management (signed-in, uses the real access token automatically)

export interface MfaStatus {
  feature_enabled: boolean;
  enabled: boolean;
  enrolled_at: string | null;
  recovery_codes_remaining: number;
}

export async function mfaStatus(): Promise<MfaStatus> {
  return (await apiClient.get("/auth/mfa/status")).data;
}

export async function mfaRegenerateRecoveryCodes(
  code: string
): Promise<{ recovery_codes: string[] }> {
  return (await apiClient.post("/auth/mfa/recovery/regenerate", { code })).data;
}

export async function mfaReset(
  password: string,
  code: string
): Promise<{ msg: string }> {
  return (await apiClient.post("/auth/mfa/reset", { password, code })).data;
}
