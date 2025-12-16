import React, { useState, useEffect } from "react";
import { useForm, SubmitHandler, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import {
  TextField,
  Button,
  Container,
  Typography,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { getApiBaseUrl } from "../utils/apiConfig";
import { useNavigate } from "react-router-dom";
import { authenticatedFetch } from "../utils/api";
import { getAuthData } from "../utils/auth";

interface ApiKey {
  api_key: string;
  owner_id: string;
  name: string | null;
  is_active: number;
  created_at: number;
  expires_at: number | null;
}

interface CreateApiKeyFormValues {
  ownerId: string;
  name?: string;
  expiresAt?: string | null; // store as string for input compatibility
}

const createApiKeySchema = yup.object({
  ownerId: yup.string().required("Owner ID is required"),
  name: yup.string().notRequired(),
  expiresAt: yup.date().nullable().notRequired(),
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

const ApiKeyManagementTab: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateApiKeyFormValues>({
    resolver: yupResolver(createApiKeySchema),
    defaultValues: {
      expiresAt: null,
    },
  });

  useEffect(() => {
    const authData = getAuthData();
    if (!authData || authData.expiresIn <= Date.now()) {
      console.warn("Session expired, redirecting to login.");
      navigate("/login");
    } else {
      fetchApiKeys();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const fetchApiKeys = async () => {
    setError(null);
    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/admin/api-keys`,
        "GET"
      );
      if (response.ok) {
        const data: ApiKey[] = await response.json();
        setApiKeys(data);
      } else if (response.status === 401) {
        localStorage.removeItem("auth_data");
        navigate("/login");
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Failed to fetch API keys");
      }
    } catch (err: unknown) {
      console.error("Fetch API keys error:", err);
      setError("Failed to connect to the server");
    }
  };

  const handleCreateApiKey: SubmitHandler<CreateApiKeyFormValues> = async (
    data
  ) => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const finalExpiry = data.expiresAt
      ? new Date(data.expiresAt)
      : new Date(new Date().setFullYear(new Date().getFullYear() + 10)); // 10 years from now

    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/admin/api-keys`,
        "POST",
        {
          ownerId: data.ownerId,
          name: data.name,
          expiresAt: finalExpiry.toISOString(),
        }
      );

      if (response.ok) {
        setSuccess("API key created successfully!");
        fetchApiKeys();
        setOpenCreateDialog(false);
        reset();
      } else if (response.status === 401) {
        localStorage.removeItem("auth_data");
        navigate("/login");
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Failed to create API key");
      }
    } catch (err: unknown) {
      console.error("Create API key error:", err);
      setError("Failed to connect to the server");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteApiKey = async (apiKeyToDelete: string) => {
    if (
      window.confirm(
        `Are you sure you want to delete API key: ${apiKeyToDelete}?`
      )
    ) {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      try {
        const response = await authenticatedFetch(
          `${getApiBaseUrl()}/admin/api-keys/${apiKeyToDelete}`,
          "DELETE"
        );

        if (response.ok) {
          setSuccess("API key deleted successfully!");
          fetchApiKeys();
        } else if (response.status === 401) {
          localStorage.removeItem("auth_data");
          navigate("/login");
        } else if (response.status === 404) {
          setError("API key not found.");
        } else {
          const errorData = await response.json();
          setError(errorData.message || "Failed to delete API key");
        }
      } catch (err: unknown) {
        console.error("Delete API key error:", err);
        setError("Failed to connect to the server");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Container maxWidth="md">
      <Typography variant="h6" gutterBottom>
        API Key Management
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Button
        variant="contained"
        color="primary"
        startIcon={<AddIcon />}
        onClick={() => setOpenCreateDialog(true)}
        sx={{ marginBottom: 2 }}
      >
        Create New API Key
      </Button>

      <List>
        {apiKeys.map((key) => (
          <ListItem key={key.api_key}>
            <ListItemText
              primary={key.api_key}
              secondary={
                <>
                  {`Owner: ${key.owner_id}`}
                  {key.name && ` (${key.name})`}
                  <br />
                  {key.expires_at &&
                    `Expires on: ${new Date(
                      key.expires_at
                    ).toLocaleDateString()}`}
                </>
              }
            />
            <ListItemSecondaryAction>
              <IconButton
                edge="end"
                aria-label="delete"
                onClick={() => handleDeleteApiKey(key.api_key)}
                disabled={isSubmitting}
              >
                <DeleteIcon />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItem>
        ))}
        {apiKeys.length === 0 && !error && (
          <Typography variant="body2" color="textSecondary">
            No API keys found.
          </Typography>
        )}
      </List>

      <Dialog
        open={openCreateDialog}
        onClose={() => setOpenCreateDialog(false)}
      >
        <DialogTitle>Create New API Key</DialogTitle>
        <DialogContent>
          <form onSubmit={handleSubmit(handleCreateApiKey)}>
            <TextField
              label="Owner ID"
              fullWidth
              margin="normal"
              {...register("ownerId")}
              error={!!errors.ownerId}
              helperText={errors.ownerId?.message}
            />
            <TextField
              label="Name (Optional)"
              fullWidth
              margin="normal"
              {...register("name")}
              error={!!errors.name}
              helperText={errors.name?.message}
            />
            <Controller
              name="expiresAt"
              control={control}
              render={({ field }) => (
                <TextField
                  label="Expiration Date (Optional)"
                  type="date"
                  fullWidth
                  margin="normal"
                  InputLabelProps={{ shrink: true }}
                  {...field}
                  error={!!errors.expiresAt}
                  helperText={errors.expiresAt?.message}
                />
              )}
            />
            <DialogActions>
              <Button onClick={() => setOpenCreateDialog(false)}>Cancel</Button>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create"}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default ApiKeyManagementTab;
