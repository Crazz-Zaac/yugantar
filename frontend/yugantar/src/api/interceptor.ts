import { apiClient } from "./api";

let isRefreshing = false;
let refreshQueue: (() => void)[] = [];

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
          const res = await apiClient.post("/auth/refresh");
         const newAccessToken = res.data.access_token ?? res.data.token?.access_token;

          localStorage.setItem("access_token", newAccessToken);

          refreshQueue.forEach((cb) => cb());
          refreshQueue = [];
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }

      return new Promise((resolve) => {
        refreshQueue.push(() => resolve(apiClient(originalRequest)));
      });
    }

    return Promise.reject(error);
  }
);
