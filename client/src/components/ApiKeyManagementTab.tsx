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
import EditIcon from "@mui/icons-material/Edit";
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

interface EditApiKeyFormValues {
  name?: string;
  expiresAt?: string | null;
  isActive?: boolean;
  newApiKey?: string;
}

const editApiKeySchema = yup.object({
  name: yup.string().nullable().notRequired(),
  expiresAt: yup.date().nullable().notRequired(),
  newApiKey: yup.string().required("API Key is required"),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

const ApiKeyManagementTab: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [editingApiKey, setEditingApiKey] = useState<ApiKey | null>(null);
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

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    control: controlEdit,
    formState: { errors: errorsEdit },
    setValue: setEditValue,
  } = useForm<EditApiKeyFormValues>({
    resolver: yupResolver(editApiKeySchema),
    defaultValues: {
      expiresAt: null,
      isActive: true,
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

  const handleEditClick = (apiKey: ApiKey) => {
    setEditingApiKey(apiKey);
    setEditValue("name", apiKey.name || "");
    setEditValue("newApiKey", apiKey.api_key);
    // Format date for input if exists
    if (apiKey.expires_at) {
      const date = new Date(apiKey.expires_at);
      setEditValue("expiresAt", date.toISOString().split("T")[0]);
    } else {
      setEditValue("expiresAt", null);
    }
    setEditValue("isActive", apiKey.is_active === 1);
    setOpenEditDialog(true);
  };

  const handleUpdateApiKey: SubmitHandler<EditApiKeyFormValues> = async (
    data
  ) => {
    if (!editingApiKey) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    if (data.newApiKey !== undefined && data.newApiKey !== editingApiKey.api_key) {
      updates.newApiKey = data.newApiKey;
    }

    if (data.expiresAt) {
      updates.expiresAt = new Date(data.expiresAt).toISOString();
    } else {
      // If cleared, send null to remove expiration? 
      // The form input[type=date] might return empty string if cleared.
      // Requires careful handling. For now assume if provided it's valid.
      // If user clears it, we might want to set to null.
      if (data.expiresAt === "") updates.expiresAt = null;
      else if (data.expiresAt === null) updates.expiresAt = null;
    }


    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/admin/api-keys/${editingApiKey.api_key}`,
        "PUT",
        updates
      );

      if (response.ok) {
        setSuccess("API key updated successfully!");
        fetchApiKeys();
        setOpenEditDialog(false);
        setEditingApiKey(null);
        resetEdit();
      } else if (response.status === 401) {
        localStorage.removeItem("auth_data");
        navigate("/login");
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Failed to update API key");
      }
    } catch (err: unknown) {
      console.error("Update API key error:", err);
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
                aria-label="delete"
                onClick={() => handleEditClick(key)}
                disabled={isSubmitting}
                sx={{ marginRight: 1 }}
              >
                <EditIcon />
              </IconButton>
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

      <Dialog
        open={openEditDialog}
        onClose={() => setOpenEditDialog(false)}
      >
        <DialogTitle>Edit API Key</DialogTitle>
        <DialogContent>
          <form onSubmit={handleSubmitEdit(handleUpdateApiKey)}>
            <Typography variant="subtitle2" gutterBottom>
              Original Key: {editingApiKey?.api_key}
            </Typography>
            <TextField
              label="API Key"
              fullWidth
              margin="normal"
              {...registerEdit("newApiKey")}
              error={!!errorsEdit.newApiKey}
              helperText={errorsEdit.newApiKey?.message}
            />
            <TextField
              label="Name (Optional)"
              fullWidth
              margin="normal"
              {...registerEdit("name")}
              error={!!errorsEdit.name}
              helperText={errorsEdit.name?.message}
            />
            <Controller
              name="expiresAt"
              control={controlEdit}
              render={({ field }) => (
                <TextField
                  label="Expiration Date (Optional)"
                  type="date"
                  fullWidth
                  margin="normal"
                  InputLabelProps={{ shrink: true }}
                  {...field}
                  value={field.value || ""}
                  error={!!errorsEdit.expiresAt}
                  helperText={errorsEdit.expiresAt?.message}
                />
              )}
            />
            <DialogActions>
              <Button onClick={() => setOpenEditDialog(false)}>Cancel</Button>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Updating..." : "Update"}
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default ApiKeyManagementTab;
