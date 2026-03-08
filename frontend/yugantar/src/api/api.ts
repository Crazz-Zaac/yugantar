import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { ENV } from '@/config/env';

export const apiClient = axios.create({
  baseURL: ENV.API_BASE,
  withCredentials: true,
});

export const refreshClient = axios.create({
  baseURL: ENV.API_BASE,
  withCredentials: true,
});

// Request interceptor: attach access token 

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: auto-refresh on 401 

// Custom event dispatched when refresh fails — AuthContext listens to this
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

let isRefreshing = false;
let pendingQueue: {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}[] = [];

function processQueue(error: unknown, token: string | null = null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  pendingQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh for 401s that haven't already been retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't intercept auth endpoints themselves
    const url = originalRequest.url || '';
    if (url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/users/login') || url.includes('/users/register')) {
      return Promise.reject(error);
    }

    // If already refreshing, queue this request
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then((newToken) => {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        originalRequest._retry = true;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Call the refresh endpoint (sends httpOnly cookie automatically)
      const res = await refreshClient.post('/auth/refresh');
      const newAccessToken: string = res.data.access_token;

      // Persist the new token
      localStorage.setItem('access_token', newAccessToken);
      apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;

      // Retry all queued requests with the new token
      processQueue(null, newAccessToken);

      // Retry the original request
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Refresh failed - session is truly expired
      processQueue(refreshError, null);
      localStorage.removeItem('access_token');

      // Notify AuthContext to clear user state
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

