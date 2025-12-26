import React, { useState, useEffect } from 'react';
import { 
    Box, 
    Typography, 
    TextField, 
    Button, 
    Alert, 
    Paper, 
    LinearProgress, 
    Grid,
    Card, 
    CardContent,
    Divider
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import FolderIcon from '@mui/icons-material/Folder';
import { authenticatedFetch } from '../utils/api';
import { getApiBaseUrl } from '../utils/apiConfig';

interface DiskInfo {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
    mount: string;
    filesystem: string;
}

interface StorageUtilization {
    baseDirectory: string;
    recording: DiskInfo;
    system?: DiskInfo;
}

const StorageTab: React.FC = () => {
    const [maxStoragePercent, setMaxStoragePercent] = useState<number | string>('');
    const [baseVideoDirectory, setBaseVideoDirectory] = useState<string>('');
    const [storageUtil, setStorageUtil] = useState<StorageUtilization | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetchConfig();
        fetchStorageUtilization();
        
        // Refresh storage utilization every 30 seconds
        const interval = setInterval(fetchStorageUtilization, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const response = await authenticatedFetch(`${getApiBaseUrl()}/admin/storage-config`);
            if (response.ok) {
                const data = await response.json();
                setMaxStoragePercent(data.maxStoragePercent);
                setBaseVideoDirectory(data.baseVideoDirectory || '');
            } else {
                console.error("Failed to fetch storage config");
            }
        } catch (error) {
            console.error("Error fetching storage config:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStorageUtilization = async () => {
        try {
            const response = await authenticatedFetch(`${getApiBaseUrl()}/admin/storage-utilization`);
            if (response.ok) {
                const data = await response.json();
                setStorageUtil(data);
            } else {
                console.error("Failed to fetch storage utilization");
            }
        } catch (error) {
            console.error("Error fetching storage utilization:", error);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const response = await authenticatedFetch(
                `${getApiBaseUrl()}/admin/storage-config`,
                'POST',
                { 
                    maxStoragePercent: Number(maxStoragePercent),
                    baseVideoDirectory: baseVideoDirectory.trim()
                }
            );

            if (response.ok) {
                setMessage({ type: 'success', text: 'Storage configuration updated successfully' });
                // Refresh storage utilization after config change
                setTimeout(fetchStorageUtilization, 1000);
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

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    const getStorageColor = (percent: number): 'success' | 'warning' | 'error' => {
        if (percent >= 90) return 'error';
        if (percent >= 75) return 'warning';
        return 'success';
    };

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', p: 2 }}>
            {/* Storage Utilization Display */}
            {storageUtil && (
                <>
                    {/* Recording Mount Point */}
                    <Paper sx={{ p: 3, mb: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <StorageIcon sx={{ mr: 1, fontSize: 28, color: 'primary.main' }} />
                            <Typography variant="h6">
                                Recording Storage
                            </Typography>
                        </Box>

                        <Grid container spacing={2} sx={{ mb: 3 }}>
                            {/* @ts-ignore */}
                            <Grid item xs={12} md={4}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography color="text.secondary" variant="body2">
                                            Total Capacity
                                        </Typography>
                                        <Typography variant="h5">
                                            {formatBytes(storageUtil.recording.totalBytes)}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            {/* @ts-ignore */}
                            <Grid item xs={12} md={4}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography color="text.secondary" variant="body2">
                                            Used
                                        </Typography>
                                        <Typography variant="h5">
                                            {formatBytes(storageUtil.recording.usedBytes)}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            {/* @ts-ignore */}
                            <Grid item xs={12} md={4}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography color="text.secondary" variant="body2">
                                            Available
                                        </Typography>
                                        <Typography variant="h5">
                                            {formatBytes(storageUtil.recording.availableBytes)}
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>

                        <Box sx={{ mb: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">
                                    Disk Usage
                                </Typography>
                                <Typography variant="body2" fontWeight="bold">
                                    {storageUtil.recording.usedPercent.toFixed(1)}%
                                </Typography>
                            </Box>
                            <LinearProgress 
                                variant="determinate" 
                                value={storageUtil.recording.usedPercent} 
                                color={getStorageColor(storageUtil.recording.usedPercent)}
                                sx={{ height: 10, borderRadius: 5 }}
                            />
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <FolderIcon sx={{ mr: 1, fontSize: 18, color: 'text.secondary' }} />
                                <Typography variant="body2" color="text.secondary">
                                    Video Directory: <strong>{storageUtil.baseDirectory}</strong>
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                Mount Point: {storageUtil.recording.mount} ({storageUtil.recording.filesystem})
                            </Typography>
                        </Box>
                    </Paper>

                    {/* System Mount Point (if different) */}
                    {storageUtil.system && (
                        <Paper sx={{ p: 3, mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <StorageIcon sx={{ mr: 1, fontSize: 28, color: 'secondary.main' }} />
                                <Typography variant="h6">
                                    System Storage
                                </Typography>
                            </Box>

                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                {/* @ts-ignore */}
                                <Grid item xs={12} md={4}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography color="text.secondary" variant="body2">
                                                Total Capacity
                                            </Typography>
                                            <Typography variant="h5">
                                                {formatBytes(storageUtil.system.totalBytes)}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                {/* @ts-ignore */}
                                <Grid item xs={12} md={4}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography color="text.secondary" variant="body2">
                                                Used
                                            </Typography>
                                            <Typography variant="h5">
                                                {formatBytes(storageUtil.system.usedBytes)}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                {/* @ts-ignore */}
                                <Grid item xs={12} md={4}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography color="text.secondary" variant="body2">
                                                Available
                                            </Typography>
                                            <Typography variant="h5">
                                                {formatBytes(storageUtil.system.availableBytes)}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>

                            <Box sx={{ mb: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2" color="text.secondary">
                                        Disk Usage
                                    </Typography>
                                    <Typography variant="body2" fontWeight="bold">
                                        {storageUtil.system.usedPercent.toFixed(1)}%
                                    </Typography>
                                </Box>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={storageUtil.system.usedPercent} 
                                    color={getStorageColor(storageUtil.system.usedPercent)}
                                    sx={{ height: 10, borderRadius: 5 }}
                                />
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                    Mount Point: {storageUtil.system.mount} ({storageUtil.system.filesystem})
                                </Typography>
                            </Box>
                        </Paper>
                    )}
                </>
            )}

            {/* Configuration Panel */}
            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Storage Configuration
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Configure storage settings. When the maximum storage limit is reached, the oldest video files will be automatically deleted to free up space.
                </Typography>

                {message && (
                    <Alert severity={message.type} sx={{ mb: 3 }}>
                        {message.text}
                    </Alert>
                )}

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <TextField
                        label="Base Video Directory"
                        value={baseVideoDirectory}
                        onChange={(e) => setBaseVideoDirectory(e.target.value)}
                        fullWidth
                        helperText="Absolute path where video files are stored"
                        placeholder="/mnt/m2nvme"
                    />

                    <TextField
                        label="Max Storage Percentage"
                        type="number"
                        value={maxStoragePercent}
                        onChange={(e) => setMaxStoragePercent(e.target.value)}
                        InputProps={{ inputProps: { min: 1, max: 100 } }}
                        helperText="Trigger automatic cleanup when disk usage exceeds this percentage (1-100)"
                    />

                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={loading}
                        size="large"
                    >
                        {loading ? 'Saving...' : 'Save Configuration'}
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
};

export default StorageTab;
