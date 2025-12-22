import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Alert, Paper } from '@mui/material';
import { authenticatedFetch } from '../utils/api';
import { getApiBaseUrl } from '../utils/apiConfig';

const StorageTab: React.FC = () => {
    const [maxStoragePercent, setMaxStoragePercent] = useState<number | string>('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const response = await authenticatedFetch(`${getApiBaseUrl()}/admin/storage-config`);
            if (response.ok) {
                const data = await response.json();
                setMaxStoragePercent(data.maxStoragePercent);
            } else {
                console.error("Failed to fetch storage config");
            }
        } catch (error) {
            console.error("Error fetching storage config:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const response = await authenticatedFetch(
                `${getApiBaseUrl()}/admin/storage-config`,
                'POST',
                { maxStoragePercent: Number(maxStoragePercent) }
            );

            if (response.ok) {
                setMessage({ type: 'success', text: 'Storage configuration updated successfully' });
            } else {
                const data = await response.json();
                setMessage({ type: 'error', text: data.message || 'Failed to update configuration' });
            }
        } catch (error) {
            console.error("Error updating storage config:", error);
            setMessage({ type: 'error', text: 'An error occurred while updating configuration' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 600, mx: 'auto' }}>
            <Paper sx={{ p: 4, mt: 4 }}>
                <Typography variant="h6" gutterBottom>
                    Storage Management
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Configure the maximum disk usage percentage. When this limit is reached, the oldest video files will be automatically deleted to free up space.
                </Typography>

                {message && (
                    <Alert severity={message.type} sx={{ mb: 3 }}>
                        {message.text}
                    </Alert>
                )}

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                        label="Max Storage Percentage"
                        type="number"
                        value={maxStoragePercent}
                        onChange={(e) => setMaxStoragePercent(e.target.value)}
                        InputProps={{ inputProps: { min: 1, max: 100 } }}
                        sx={{ flexGrow: 1 }}
                        helperText="Values between 1 and 100"
                    />
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={loading}
                        sx={{ height: 56 }}
                    >
                        {loading ? 'Saving...' : 'Save'}
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
};

export default StorageTab;
