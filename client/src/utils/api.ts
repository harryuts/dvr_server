import { getAuthData } from "../utils/auth";
import { getApiBaseUrl } from "./apiConfig";

/**
 * Simple fetch wrapper for unauthenticated API calls (e.g., login flow)
 */
export const apiFetch = async <T = unknown>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body: unknown = null
): Promise<{ ok: boolean; status: number; data: T }> => {
  const url = `${getApiBaseUrl()}${endpoint}`;
  
  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : null,
  };

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));
  
  return {
    ok: response.ok,
    status: response.status,
    data: data as T,
  };
};

export const authenticatedFetch = async (
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body: unknown = null,
  customHeaders: Record<string, string> = {}
) => {
  const authData = getAuthData();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...customHeaders,
  };

  if (authData?.token) {
    headers["Authorization"] = `${authData.token}`;
  }

  const config: RequestInit = {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  };

  const response = await fetch(`${url}`, config);

  // Handle 401 Unauthorized - session is invalid
  if (response.status === 401) {
    console.warn('[authenticatedFetch] Received 401 Unauthorized. Clearing session and redirecting to login.');
    const { clearAuthData } = await import('./auth');
    clearAuthData();
    window.location.href = '/login';
  }

  return response;
};
