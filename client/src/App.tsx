import React, { JSX, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Box, ThemeProvider, CssBaseline } from "@mui/material";
import { theme } from "./theme";
import SideNavigationBar from "./components/SideNavigationBar";
import StatusPage from "./pages/StatusPage";
import LoginPage from "./pages/LoginPage";
import PlaybackPage from "./pages/PlaybackPage";
import SettingsPage from "./pages/SettingsPage";
import LivePage from "./pages/LivePage";
import POSIntegrationPage from "./pages/POSIntegrationPage";

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
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display: "flex",
          width: "100vw",
          height: "100vh", // Use height instead of minHeight to fix viewport
          bgcolor: 'background.default',
          overflow: 'hidden', // Prevent body scroll
        }}
      >
        <BrowserRouter>
          {isLoggedIn && <SideNavigationBar />}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden', // Contain scrolling to this area
              position: 'relative',
            }}
          >
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Routes>
                <Route
                  path="/login"
                  element={<LoginPage onLoginSuccess={() => setIsLoggedIn(true)} />}
                />
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      <Navigate to="/live" />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/live"
                  element={
                    <PrivateRoute>
                      <LivePage />
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
                <Route
                  path="/pos-integration"
                  element={
                    <PrivateRoute>
                      <POSIntegrationPage />
                    </PrivateRoute>
                  }
                />
              </Routes>
            </Box>
          </Box>
        </BrowserRouter>
      </Box>
    </ThemeProvider>
  );
}

export default App;
