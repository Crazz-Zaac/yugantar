import { apiClient, refreshClient } from "./api";

let isRefreshing = false;
let refreshQueue: ((token: string) => void)[] = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as any;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const res = await refreshClient.post("/auth/refresh");
          const newAccessToken = res.data.token?.access_token;

          localStorage.setItem("access_token", newAccessToken);

          refreshQueue.forEach(cb => cb(newAccessToken));
          refreshQueue = [];
        } catch (err) {
          localStorage.removeItem("access_token");
          // localStorage.removeItem("refresh_token");
          window.location.href = "/login";
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }

      return new Promise((resolve) => {
        refreshQueue.push((token: string) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(originalRequest));
        });
      });
    }

    return Promise.reject(error);
  }
);
