import axios from 'axios';

export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let csrfToken: string | null = null;

export async function initCsrf(): Promise<void> {
  const response = await http.get('/auth/csrf');
  csrfToken = response.data.data.csrfToken as string;
}

http.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase();
  if (csrfToken && method && !['get', 'head', 'options'].includes(method)) {
    config.headers.set('X-CSRF-Token', csrfToken);
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) return Promise.reject(error);
    const code = error.response?.data?.error?.code;
    const config = error.config as typeof error.config & { _retried?: boolean };
    if (error.response?.status === 403 && code === 'CSRF' && !config._retried) {
      config._retried = true;
      await initCsrf();
      config.headers.set('X-CSRF-Token', csrfToken ?? '');
      return http.request(config);
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.error?.message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'Something went wrong. Please try again.';
}
