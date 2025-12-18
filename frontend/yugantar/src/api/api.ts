import axios from 'axios';
import { ENV } from '@/config/env';

export const apiClient = axios.create({
  baseURL: ENV.API_BASE,
  withCredentials: true,
});

export const refreshClient = axios.create({
  baseURL: ENV.API_BASE,
  withCredentials: true,
});


apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

