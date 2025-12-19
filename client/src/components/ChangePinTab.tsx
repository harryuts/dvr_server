import React, { useState, useEffect } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { TextField, Button, Container, Typography, Alert } from "@mui/material";
import { getApiBaseUrl } from "../utils/apiConfig";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../utils/api";
import { AUTH_STORAGE_KEY, getAuthData } from "../utils/auth";

interface ChangePinFormValues {
  oldPin: string;
  newPin: string;
  confirmNewPin: string;
}

const changePinSchema = yup.object().shape({
  oldPin: yup
    .string()
    .required("Old PIN is required")
    .matches(/^\d{6}$/, "Old PIN must be a 6-digit number"),
  newPin: yup
    .string()
    .required("New PIN is required")
    .matches(/^\d{6}$/, "New PIN must be a 6-digit number"),
  confirmNewPin: yup
    .string()
    .required("Confirm New PIN is required")
    .oneOf([yup.ref("newPin")], "New PINs must match"),
});

const ChangePinTab: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePinFormValues>({
    resolver: yupResolver(changePinSchema),
  });
  const [changePinError, setChangePinError] = useState<string | null>(null);
  const [changePinSuccess, setChangePinSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const authData = getAuthData();
    if (!authData || authData.expiresIn <= Date.now()) {
      console.warn("Session expired, redirecting to login.");
      navigate("/login");
    }
  }, [navigate]);

  const onSubmit: SubmitHandler<ChangePinFormValues> = async (data) => {
    setIsSubmitting(true);
    setChangePinError(null);
    setChangePinSuccess(null);

    const authData = getAuthData();
    if (!authData) {
      console.error("No authentication token found.");
      setChangePinError("Authentication error. Please log in again.");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/api/auth/change-pin`,
        "POST",
        { oldPin: data.oldPin, newPin: data.newPin }
      );

      if (response.ok) {
        setChangePinSuccess("PIN changed successfully!");
        // Optionally clear the form after success
      } else if (response.status === 401) {
        // Handle unauthorized access (token expired or invalid)
        localStorage.removeItem(AUTH_STORAGE_KEY);
        navigate("/login");
      } else {
        const errorData = await response.json();
        setChangePinError(errorData.message || "Failed to change PIN");
      }
    } catch (error: unknown) {
      console.error("Change PIN error:", error);
      setChangePinError("Failed to connect to the server");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="xs">
      <Typography variant="h6" component="h6" gutterBottom>
        Change PIN
      </Typography>
      {changePinError && <Alert severity="error">{changePinError}</Alert>}
      {changePinSuccess && <Alert severity="success">{changePinSuccess}</Alert>}
      <form onSubmit={handleSubmit(onSubmit)}>
        <TextField
          label="Old PIN (6 digits)"
          type="password"
          fullWidth
          margin="normal"
          {...register("oldPin")}
          error={!!errors.oldPin}
          helperText={errors.oldPin?.message}
        />
        <TextField
          label="New PIN (6 digits)"
          type="password"
          fullWidth
          margin="normal"
          {...register("newPin")}
          error={!!errors.newPin}
          helperText={errors.newPin?.message}
        />
        <TextField
          label="Confirm New PIN (6 digits)"
          type="password"
          fullWidth
          margin="normal"
          {...register("confirmNewPin")}
          error={!!errors.confirmNewPin}
          helperText={errors.confirmNewPin?.message}
        />
        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          disabled={isSubmitting}
        >
          {isSubmitting ? "Changing PIN..." : "Change PIN"}
        </Button>
      </form>
    </Container>
  );
};

export default ChangePinTab;
