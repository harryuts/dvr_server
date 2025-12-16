import React, { useState } from "react";
 import { useNavigate } from "react-router-dom";
 import { useForm, SubmitHandler } from "react-hook-form";
 import { yupResolver } from "@hookform/resolvers/yup";
 import * as yup from "yup";
 import { TextField, Button, Container, Typography, Alert } from "@mui/material";
 import { getApiBaseUrl } from "../utils/apiConfig"; // Import the function

 interface LoginFormValues {
  pin: string;
 }

 interface LoginResponse {
  token: string;
  expiresIn: number; // Expecting the backend to return the expiration timestamp (in ms)
  message?: string;
 }

 interface LoginPageProps {
  onLoginSuccess: () => void; // Prop to notify the App component of successful login
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
        onLoginSuccess(); // Notify the App component
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
      <Typography variant="h4" component="h1" gutterBottom>
        Login with PIN
      </Typography>
      {loginError && <Alert severity="error">{loginError}</Alert>}
      <form onSubmit={handleSubmit(onSubmit)}>
        <TextField
          label="PIN (6 digits)"
          type="password"
          fullWidth
          margin="normal"
          {...register("pin")}
          error={!!errors.pin}
          helperText={errors.pin?.message}
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={isSubmitting}
        >
          {isSubmitting ? "Logging In..." : "Login"}
        </Button>
      </form>
    </Container>
  );
};

export default LoginPage;