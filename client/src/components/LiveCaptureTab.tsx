import React, { useState, useEffect } from "react";
import {
    Box,
    Typography,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    CircularProgress,
    Alert,
    SelectChangeEvent,
} from "@mui/material";
import { getApiBaseUrl } from "../utils/apiConfig";
import { authenticatedFetch } from "../utils/api";

const LiveCaptureTab: React.FC = () => {
    const [frameRate, setFrameRate] = useState<number>(1);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    useEffect(() => {
        const fetchConfig = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await authenticatedFetch(
                    `${getApiBaseUrl()}/admin/live-capture-config`
                );
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setFrameRate(data.liveCaptureFrameRate || 1);
            } catch (err: unknown) {
                console.error("Error fetching live capture config:", err);
                setError("Failed to load live capture configuration.");
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, []);

    const handleFrameRateChange = (event: SelectChangeEvent<number>) => {
        setFrameRate(Number(event.target.value));
    };

    const handleSubmit = async () => {
        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const response = await authenticatedFetch(
                `${getApiBaseUrl()}/admin/live-capture-config`,
                "POST",
                { liveCaptureFrameRate: frameRate }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    errorData.message || `HTTP error! status: ${response.status}`
                );
            }

            setSuccessMessage(
                "Live capture frame rate updated successfully! Recordings have been restarted."
            );
        } catch (err: unknown) {
            console.error("Error updating live capture config:", err);
            setError("Failed to update live capture configuration.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h6" color="text.primary" gutterBottom>
                Live Capture Settings
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Configure the frame rate for live JPEG capture. Higher frame rates provide smoother live view but use more system resources.
            </Typography>

            {loading ? (
                <CircularProgress />
            ) : error ? (
                <Alert severity="error">{error}</Alert>
            ) : successMessage ? (
                <Alert severity="success">{successMessage}</Alert>
            ) : null}

            {!loading && (
                <Box sx={{ mt: 3 }}>
                    <FormControl fullWidth sx={{ mb: 3 }}>
                        <InputLabel id="frame-rate-label">Frame Rate</InputLabel>
                        <Select
                            labelId="frame-rate-label"
                            id="frame-rate-select"
                            value={frameRate}
                            label="Frame Rate"
                            onChange={handleFrameRateChange}
                        >
                            <MenuItem value={1}>1 FPS (Default)</MenuItem>
                            <MenuItem value={2}>2 FPS</MenuItem>
                            <MenuItem value={3}>3 FPS</MenuItem>
                        </Select>
                    </FormControl>

                    <Alert severity="warning" sx={{ mb: 3 }}>
                        <Typography variant="body2">
                            <strong>Note:</strong> Changing the frame rate will automatically restart all active recording processes. This may cause a brief (1-2 second) interruption in recording.
                        </Typography>
                    </Alert>

                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleSubmit}
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save Configuration"}
                    </Button>
                </Box>
            )}
        </Box>
    );
};

export default LiveCaptureTab;
