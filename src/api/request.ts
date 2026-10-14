type RequestPayload = Record<string, unknown> | undefined;

interface RequestOptions {data?: RequestPayload; options?:Record<string,unknown>; responseType?:string}

interface RequestResult<T = unknown> {
  data: T;
  error: null;
}

function createMockResponse<T = unknown>(url: string, payload?: RequestPayload): RequestResult<T> {
  if (url.includes('/pluginuser/login')) {
    return { data: 'standalone-demo-token' as T, error: null };
  }

  return {
    data: {
      url,
      payload,
      standalone: true,
    } as T,
    error: null,
  };
}

export const requestClient = {
  get<T = unknown>(url: string, options?: RequestOptions) {
    return Promise.resolve(createMockResponse<T>(url, options?.data));
  },
  post<T = unknown>(url: string, options?: RequestOptions) {
    return Promise.resolve(createMockResponse<T>(url, options?.data));
  },
};

export const baseRequestClient = requestClient;

export function doLogout() {
  window.location.replace('/login');
}
