import React, { JSX, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Box } from "@mui/material"; // Import Box from Material UI
import BottomNavigationBar from "./components/BottomNavigationBar";
import StatusPage from "./pages/StatusPage";
import LoginPage from "./pages/LoginPage";
import PlaybackPage from "./pages/PlaybackPage";
import SettingsPage from "./pages/SettingsPage";

interface AuthData {
  token: string;
  expiresIn: number; // Assuming your backend returns an expiry timestamp (in ms)
}

// Key for storing auth data in localStorage
const AUTH_STORAGE_KEY = "authToken";

const getAuthData = (): AuthData | null => {
  const storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
  if (storedAuth) {
    try {
      const authData = JSON.parse(storedAuth) as AuthData;
      return authData;
    } catch (error) {
      console.error("Error parsing auth data from localStorage:", error);
      localStorage.removeItem(AUTH_STORAGE_KEY); // Clear invalid data
      return null;
    }
  }
  return null;
};

const isAuthenticated = (): boolean => {
  const authData = getAuthData();
  if (authData && authData.expiresIn > Date.now()) {
    return true;
  }
  return false;
};

const PrivateRoute = ({ children }: { children: JSX.Element }) => {
  return isAuthenticated() ? children : <Navigate to="/login" />;
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(isAuthenticated());

  useEffect(
    () => {
      setIsLoggedIn(isAuthenticated());
    },
    [
      /* You might want to add dependencies here if other parts of your app can change auth state */
    ]
  );

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        width: "100vw", // Optional: Make the container take full viewport width
        minHeight: "100vh", // Optional: Make the container take full viewport height
        alignItems: "center", // Optional: If you also want to center vertically
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={<LoginPage onLoginSuccess={() => setIsLoggedIn(true)} />}
          />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Navigate to="/status" />
              </PrivateRoute>
            }
          />
          <Route
            path="/playback"
            element={
              <PrivateRoute>
                <PlaybackPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/status"
            element={
              <PrivateRoute>
                <StatusPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <PrivateRoute>
                <SettingsPage />
              </PrivateRoute>
            }
          />
        </Routes>
        {isLoggedIn && <BottomNavigationBar />}
      </BrowserRouter>
    </Box>
  );
}

export default App;
