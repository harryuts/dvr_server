import { getAuthData } from "../utils/auth";

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

  const response = await fetch(`${url}`, config); // Assuming your API routes start with /api
  return response;
};
