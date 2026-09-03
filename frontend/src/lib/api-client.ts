import axios, { AxiosError } from 'axios';

/**
 * Axios instance configured for API requests.
 * 开发环境走 Vite 代理（baseURL='/api' 转发到本地 :3000）。
 * 部署到 GitHub Pages 等静态托管时，可用 VITE_API_BASE 指向真实后端，
 * 例如 VITE_API_BASE=https://your-backend.onrender.com/api
 */
const API_BASE: string =
  (import.meta.env as { VITE_API_BASE?: string }).VITE_API_BASE ?? '/api';

export const apiClient = axios.create({
  baseURL: API_BASE,
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
      // 部署在子路径（如 /storybook/）时，跳转需带上 base 前缀
      window.location.href = `${import.meta.env.BASE_URL}login`;
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

