import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import {
  TextField,
  Button,
  Container,
  Typography,
  Alert,
  Card,
  CardContent,
  Box,
  Fade
} from "@mui/material";
import { LockOutlined } from "@mui/icons-material";
import { getApiBaseUrl } from "../utils/apiConfig";

interface LoginFormValues {
  pin: string;
}

interface LoginResponse {
  token: string;
  expiresIn: number;
  message?: string;
}

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const loginSchema = yup.object().shape({
  pin: yup
    .string()
    .required("PIN is required")
    .matches(/^\d{6}$/, "PIN must be a 6-digit number"),
});

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: yupResolver(loginSchema),
  });
  const navigate = useNavigate();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit: SubmitHandler<LoginFormValues> = async (data) => {
    setIsSubmitting(true);
    setLoginError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pin: data.pin }),
      });

      if (response.ok) {
        const responseData: LoginResponse = await response.json();
        const authData = {
          token: responseData.token,
          expiresIn: responseData.expiresIn,
        };
        localStorage.setItem("authToken", JSON.stringify(authData));
        onLoginSuccess();
        navigate("/playback");
      } else {
        const errorData = await response.json();
        setLoginError(errorData.message || "Invalid PIN");
      }
    } catch (error: unknown) {
      console.error("Login error:", error);
      setLoginError("Failed to connect to the server");
    } finally {
      setIsSubmitting(false);
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
          <Card
            elevation={2}
            sx={{
              width: '100%',
              borderRadius: 3,
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  mb: 3,
                }}
              >
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
                <Typography variant="h5" component="h1" fontWeight={600} gutterBottom>
                  DVR System
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Enter your PIN to continue
                </Typography>
              </Box>

              {loginError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                  {loginError}
                </Alert>
              )}

              <form onSubmit={handleSubmit(onSubmit)}>
                <TextField
                  label="PIN (6 digits)"
                  type="password"
                  fullWidth
                  margin="normal"
                  {...register("pin")}
                  error={!!errors.pin}
                  helperText={errors.pin?.message}
                  sx={{ mb: 2 }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  size="large"
                  disabled={isSubmitting}
                  sx={{
                    py: 1.5,
                    fontSize: '1rem',
                    fontWeight: 500,
                  }}
                >
                  {isSubmitting ? "Logging In..." : "Login"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </Box>
      </Fade>
    </Container>
  );
};

export default LoginPage;