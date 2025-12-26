import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Container,
  Typography,
  Alert,
  Card,
  CardContent,
  Box,
  Fade,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  LinearProgress
} from "@mui/material";
import { LockOutlined, Send, CheckCircle, Cancel, HourglassEmpty } from "@mui/icons-material";
import { apiFetch } from "../utils/api";

// --- Interfaces ---

interface User {
  user_id: number;
  username: string;
}

interface LoginPageProps {
  onLoginSuccess: () => void;
}

type AuthStatus = 'idle' | 'pending' | 'approved' | 'denied' | 'expired' | 'error';

// --- Component ---

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();

  // State
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Fetch users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const { ok, data } = await apiFetch<{ success?: boolean; data?: User[]; message?: string }>("/api/auth/users");
        if (ok) {
          if (data.success && Array.isArray(data.data)) {
            setUsers(data.data);
          } else if (Array.isArray(data)) {
            setUsers(data as unknown as User[]);
          }
        } else {
          setLoginError(data.message || "Failed to load users");
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        setLoginError("Failed to connect to server");
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  // Poll for authorization status
  const startPolling = (token: string, expiresIn: number) => {
    setTimeLeft(expiresIn);
    
    // Start countdown
    countdownRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Poll every 2 seconds
    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await apiFetch<{ success?: boolean; status?: string; token?: string; expiresIn?: number }>(
          `/api/auth/authorize/status?token=${token}`
        );

        if (data.success) {
          if (data.status === 'approved') {
            // Stop polling
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
            
            setAuthStatus('approved');
            
            // Save auth data and redirect
            const authData = {
              token: data.token,
              expiresIn: data.expiresIn,
            };
            localStorage.setItem("authToken", JSON.stringify(authData));
            
            // Small delay to show success state
            setTimeout(() => {
              onLoginSuccess();
              navigate("/playback");
            }, 1000);
            
          } else if (data.status === 'denied') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
            setAuthStatus('denied');
            
          } else if (data.status === 'expired') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
            setAuthStatus('expired');
          }
          // If still pending, continue polling
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 2000);
  };

  // Handle Request Authorization
  const handleRequestAuth = async () => {
    if (!selectedUser) return;
    setIsRequesting(true);
    setLoginError(null);
    setAuthStatus('idle');

    try {
      const { ok, data } = await apiFetch<{ success?: boolean; authToken?: string; expiresIn?: number; message?: string }>(
        "/api/auth/authorize/request",
        "POST",
        { userId: selectedUser }
      );

      if (ok && data.success && data.authToken) {
        setAuthToken(data.authToken);
        setAuthStatus('pending');
        startPolling(data.authToken, data.expiresIn || 600);
      } else {
        setLoginError(data.message || "Failed to request authorization");
        setAuthStatus('error');
      }
    } catch (error) {
      console.error("Authorization request error:", error);
      setLoginError("Failed to request authorization");
      setAuthStatus('error');
    } finally {
      setIsRequesting(false);
    }
  };

  // Reset to initial state
  const handleReset = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setAuthToken(null);
    setAuthStatus('idle');
    setLoginError(null);
    setTimeLeft(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    switch (authStatus) {
      case 'pending':
        return <HourglassEmpty sx={{ fontSize: 48, color: 'warning.main' }} />;
      case 'approved':
        return <CheckCircle sx={{ fontSize: 48, color: 'success.main' }} />;
      case 'denied':
      case 'expired':
        return <Cancel sx={{ fontSize: 48, color: 'error.main' }} />;
      default:
        return <LockOutlined sx={{ fontSize: 28, color: 'white' }} />;
    }
  };

  const getStatusMessage = () => {
    switch (authStatus) {
      case 'pending':
        return "Waiting for approval on your mobile device...";
      case 'approved':
        return "Access granted! Redirecting...";
      case 'denied':
        return "Authorization was denied.";
      case 'expired':
        return "Authorization request expired.";
      default:
        return "Select your user to login";
    }
  };

  return (
    <Container maxWidth="xs">
      <Fade in timeout={600}>
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Card elevation={2} sx={{ width: '100%', borderRadius: 3 }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
                {authStatus === 'idle' || authStatus === 'error' ? (
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      bgcolor: 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 2,
                    }}
                  >
                    <LockOutlined sx={{ color: 'white', fontSize: 28 }} />
                  </Box>
                ) : (
                  <Box sx={{ mb: 2 }}>
                    {getStatusIcon()}
                  </Box>
                )}
                <Typography variant="h5" component="h1" fontWeight={600} gutterBottom>
                  DVR Login
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {getStatusMessage()}
                </Typography>
              </Box>

              {loginError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                  {loginError}
                </Alert>
              )}

              {(authStatus === 'idle' || authStatus === 'error') && (
                // Step 1: Select User and Request Authorization
                <Box>
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel id="user-select-label">Select User</InputLabel>
                    <Select
                      labelId="user-select-label"
                      value={selectedUser}
                      label="Select User"
                      onChange={(e) => setSelectedUser(e.target.value)}
                      disabled={isLoadingUsers || isRequesting}
                    >
                      {users.map((user) => (
                        <MenuItem key={user.user_id} value={user.user_id}>
                          {user.username}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={handleRequestAuth}
                    disabled={!selectedUser || isRequesting}
                    startIcon={isRequesting ? <CircularProgress size={20} color="inherit" /> : <Send />}
                    sx={{ py: 1.5 }}
                  >
                    {isRequesting ? "Requesting..." : "Request Authorization"}
                  </Button>
                </Box>
              )}

              {authStatus === 'pending' && (
                // Step 2: Waiting for approval
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ mb: 3 }}>
                    <CircularProgress size={40} />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Check your phone for the authorization request
                  </Typography>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Expires in {formatTime(timeLeft)}
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={(timeLeft / 600) * 100} 
                      sx={{ mt: 1, borderRadius: 1 }}
                    />
                  </Box>

                  <Button
                    variant="text"
                    fullWidth
                    onClick={handleReset}
                    sx={{ mt: 2 }}
                  >
                    Cancel
                  </Button>
                </Box>
              )}

              {authStatus === 'approved' && (
                // Success state
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="body1" color="success.main" fontWeight={500}>
                    Login successful!
                  </Typography>
                </Box>
              )}

              {(authStatus === 'denied' || authStatus === 'expired') && (
                // Failed state
                <Box sx={{ textAlign: 'center' }}>
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={handleReset}
                    sx={{ py: 1.5, mt: 2 }}
                  >
                    Try Again
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      </Fade>
    </Container>
  );
};

export default LoginPage;
