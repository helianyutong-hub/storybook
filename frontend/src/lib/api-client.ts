import axios, { AxiosError } from 'axios';

/**
 * Axios instance configured for API requests
 * Uses Vite proxy to forward /api requests to http://localhost:3000
 * No need for VITE_API_BASE_URL environment variable
 */
export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor
 * Automatically adds authentication token to requests if available
 */
apiClient.interceptors.request.use(
  (config) => {
    // 与 AppStore 保持一致：token 存在 storybook_auth 中
    let token: string | null = null;
    try {
      const raw = localStorage.getItem('storybook_auth');
      if (raw) token = JSON.parse(raw).token ?? null;
    } catch {
      token = null;
    }
    if (token) {
      // 使用自定义头部，避免线上网关覆盖标准 Authorization 头
      config.headers['X-Storybook-Token'] = token;
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor
 * Handles common error scenarios like 401 unauthorized
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // 401 Unauthorized：token 已失效（常见于重新部署后数据重置），自动清掉登录态并引导重新登录
    if (error.response?.status === 401) {
      localStorage.removeItem('storybook_auth');
      window.location.href = '/login';
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('Access forbidden');
    }

    // Handle 500 Internal Server Error
    if (error.response?.status === 500) {
      console.error('Server error occurred');
    }

    return Promise.reject(error);
  }
);

/**
 * Type-safe error handler for API errors
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || 'An error occurred';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}

export default apiClient;

