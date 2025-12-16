// src/utils/auth.ts

export const AUTH_STORAGE_KEY = "authToken";

export interface AuthData {
 token: string;
 expiresIn: number;
}

export const getAuthData = (): AuthData | null => {
 const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
 if (storedAuth) {
  try {
   return JSON.parse(storedAuth) as AuthData;
  } catch (error) {
   console.error("Error parsing auth data from localStorage:", error);
   localStorage.removeItem(AUTH_STORAGE_KEY);
   return null;
  }
 }
 return null;
};

export const isAuthenticated = (): boolean => {
 const authData = getAuthData();
 return !!(authData && authData.expiresIn > Date.now());
};

export const clearAuthData = (): void => {
 localStorage.removeItem(AUTH_STORAGE_KEY);
};