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
    Box,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions
} from "@mui/material";
import { Edit, Save, Cancel } from "@mui/icons-material";
import { authenticatedFetch } from "../utils/api";

const SystemTab: React.FC = () => {
    const [configContent, setConfigContent] = useState<string>("");
    const [editedContent, setEditedContent] = useState<string>("");
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [confirmDialogOpen, setConfirmDialogOpen] = useState<boolean>(false);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await authenticatedFetch("/admin/system-config");
            if (response.ok) {
                const data = await response.json();
                const formatted = JSON.stringify(data.config, null, 2);
                setConfigContent(formatted);
                setEditedContent(formatted);
            } else {
                setError('Failed to load system configuration');
            }
        } catch (err) {
            console.error("Error fetching system config:", err);
            setError('Error loading configuration');
        } finally {
            setLoading(false);
        }
    };

    const validateJSON = (jsonString: string): boolean => {
        try {
            JSON.parse(jsonString);
            setValidationError(null);
            return true;
        } catch (err) {
            setValidationError(`Invalid JSON: ${(err as Error).message}`);
            return false;
        }
    };

    const handleEdit = () => {
        setIsEditing(true);
        setSuccessMessage(null);
        setError(null);
    };

    const handleCancel = () => {
        setEditedContent(configContent);
        setIsEditing(false);
        setValidationError(null);
    };

    const handleSaveClick = () => {
        if (validateJSON(editedContent)) {
            setConfirmDialogOpen(true);
        }
    };

    const handleConfirmSave = async () => {
        setConfirmDialogOpen(false);

        try {
            setSaving(true);
            setError(null);
            setSuccessMessage(null);

            const configObject = JSON.parse(editedContent);
            const response = await authenticatedFetch(
                "/admin/system-config",
                "PUT",
                { config: configObject }
            );

            if (response.ok) {
                setConfigContent(editedContent);
                setIsEditing(false);
                setSuccessMessage('System configuration updated successfully');
                setValidationError(null);
            } else {
                const errorData = await response.json();
                setError(errorData.message || 'Failed to update system configuration');
            }
        } catch (err) {
            console.error("Error saving system config:", err);
            setError('Error saving configuration');
        } finally {
            setSaving(false);
        }
    };

    const handleCancelDialog = () => {
        setConfirmDialogOpen(false);
    };

    return (
        <Container maxWidth="md">
            <Card elevation={2}>
                <CardContent>
                    <Stack spacing={2}>
                        <Typography variant="h6">
                            System Configuration (config.json)
                        </Typography>

                        <Alert severity="warning">
                            <strong>Advanced Configuration:</strong> Editing this file directly can break the application if invalid JSON or incorrect values are provided. Please ensure you understand the configuration structure before making changes.
                        </Alert>

                        {loading ? (
                            <Box display="flex" justifyContent="center" py={4}>
                                <CircularProgress />
                            </Box>
                        ) : (
                            <>
                                {!isEditing ? (
                                    /* View Mode */
                                    <Box>
                                        <Box
                                            component="pre"
                                            sx={{
                                                backgroundColor: '#f5f5f5',
                                                color: '#000',
                                                padding: 2,
                                                borderRadius: 1,
                                                overflow: 'auto',
                                                maxHeight: '500px',
                                                fontFamily: 'monospace',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            <code>{configContent}</code>
                                        </Box>
                                        <Box mt={2}>
                                            <Button
                                                variant="contained"
                                                startIcon={<Edit />}
                                                onClick={handleEdit}
                                                fullWidth
                                            >
                                                Edit Configuration
                                            </Button>
                                        </Box>
                                    </Box>
                                ) : (
                                    /* Edit Mode */
                                    <Box>
                                        <TextField
                                            multiline
                                            rows={20}
                                            value={editedContent}
                                            onChange={(e) => {
                                                setEditedContent(e.target.value);
                                                validateJSON(e.target.value);
                                            }}
                                            fullWidth
                                            variant="outlined"
                                            sx={{
                                                fontFamily: 'monospace',
                                                '& textarea': {
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.875rem',
                                                }
                                            }}
                                        />

                                        {validationError && (
                                            <Alert severity="error" sx={{ mt: 1 }}>
                                                {validationError}
                                            </Alert>
                                        )}

                                        <Stack direction="row" spacing={2} mt={2}>
                                            <Button
                                                variant="contained"
                                                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
                                                onClick={handleSaveClick}
                                                disabled={saving || !!validationError || editedContent === configContent}
                                                fullWidth
                                            >
                                                {saving ? 'Saving...' : 'Save Changes'}
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                startIcon={<Cancel />}
                                                onClick={handleCancel}
                                                disabled={saving}
                                                fullWidth
                                            >
                                                Cancel
                                            </Button>
                                        </Stack>
                                    </Box>
                                )}

                                {successMessage && (
                                    <Alert severity="success">
                                        {successMessage}
                                    </Alert>
                                )}

                                {error && (
                                    <Alert severity="error">
                                        {error}
                                    </Alert>
                                )}
                            </>
                        )}
                    </Stack>
                </CardContent>
            </Card>

            {/* Confirmation Dialog */}
            <Dialog
                open={confirmDialogOpen}
                onClose={handleCancelDialog}
            >
                <DialogTitle>Confirm Configuration Update</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to update the system configuration?
                        This will modify the config.json file and may affect the application's behavior.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCancelDialog} color="primary">
                        Cancel
                    </Button>
                    <Button onClick={handleConfirmSave} color="primary" variant="contained">
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default SystemTab;
