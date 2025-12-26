
import React, { useState, useEffect } from "react";
import {
    Button,
    Container,
    Typography,
    Card,
    CardContent,
    Stack,
    Alert,
    TextField,
    CircularProgress,
    Box
} from "@mui/material";
import { Logout, Save } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { getAuthData, clearAuthData } from "../utils/auth";
import { authenticatedFetch } from "../utils/api";
import { getApiBaseUrl } from "../utils/apiConfig";

const SecurityTab: React.FC = () => {
    const navigate = useNavigate();
    const [expiresAt, setExpiresAt] = useState<Date | null>(null);

    // Auth App ID state
    const [authAppId, setAuthAppId] = useState<string>("");
    const [editedAuthAppId, setEditedAuthAppId] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        const authData = getAuthData();
        if (authData && authData.expiresIn) {
            setExpiresAt(new Date(authData.expiresIn));
        }

        // Fetch current authAppId
        fetchAuthAppId();
    }, []);

    const fetchAuthAppId = async () => {
        try {
            setLoading(true);
            const response = await authenticatedFetch(`${getApiBaseUrl()}/admin/auth-app-id-config`);
            if (response.ok) {
                const data = await response.json();
                setAuthAppId(data.authAppId);
                setEditedAuthAppId(data.authAppId);
            } else {
                setMessage({ type: 'error', text: 'Failed to load auth app ID configuration' });
            }
        } catch (error) {
            console.error("Error fetching auth app ID:", error);
            setMessage({ type: 'error', text: 'Error loading configuration' });
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAuthAppId = async () => {
        if (!editedAuthAppId.trim()) {
            setMessage({ type: 'error', text: 'Auth App ID cannot be empty' });
            return;
        }

        try {
            setSaving(true);
            setMessage(null);
            const response = await authenticatedFetch(
                `${getApiBaseUrl()}/admin/auth-app-id-config`,
                "POST",
                { authAppId: editedAuthAppId.trim() }
            );

            if (response.ok) {
                setAuthAppId(editedAuthAppId.trim());
                setMessage({ type: 'success', text: 'Auth App ID updated successfully' });
            } else {
                const errorData = await response.json();
                setMessage({ type: 'error', text: errorData.message || 'Failed to update auth app ID' });
            }
        } catch (error) {
            console.error("Error saving auth app ID:", error);
            setMessage({ type: 'error', text: 'Error saving configuration' });
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        clearAuthData();
        navigate("/login");
    };

    return (
        <Container maxWidth="sm">
            <Stack spacing={3}>
                {/* OTP Authentication Configuration */}
                <Card elevation={2}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            OTP Authentication Configuration
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
                            Configure the application ID used for OTP authentication requests.
                        </Typography>

                        {loading ? (
                            <Box display="flex" justifyContent="center" py={2}>
                                <CircularProgress size={24} />
                            </Box>
                        ) : (
                            <Stack spacing={2}>
                                <TextField
                                    label="Auth App ID"
                                    value={editedAuthAppId}
                                    onChange={(e) => setEditedAuthAppId(e.target.value)}
                                    fullWidth
                                    size="small"
                                    helperText="The target application ID for OTP authentication"
                                />

                                <Button
                                    variant="contained"
                                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
                                    onClick={handleSaveAuthAppId}
                                    disabled={saving || editedAuthAppId === authAppId}
                                    fullWidth
                                >
                                    {saving ? 'Saving...' : 'Save'}
                                </Button>

                                {message && (
                                    <Alert severity={message.type}>
                                        {message.text}
                                    </Alert>
                                )}
                            </Stack>
                        )}
                    </CardContent>
                </Card>

                {/* Session Information */}
                <Card elevation={2}>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            Session Information
                        </Typography>

                        <Stack spacing={2}>
                            {expiresAt ? (
                                <Alert severity="info">
                                    Your session expires on: <strong>{expiresAt.toLocaleString()}</strong>
                                </Alert>
                            ) : (
                                <Alert severity="warning">
                                    Could not determine session expiration.
                                </Alert>
                            )}

                            <Button
                                variant="contained"
                                color="error"
                                startIcon={<Logout />}
                                onClick={handleLogout}
                                fullWidth
                            >
                                Log Out
                            </Button>
                        </Stack>
                    </CardContent>
                </Card>
            </Stack>
        </Container>
    );
};

export default SecurityTab;
