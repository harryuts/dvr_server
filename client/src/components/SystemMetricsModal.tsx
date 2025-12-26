import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
    Box,
    Typography,
    CircularProgress,
    ToggleButton,
    ToggleButtonGroup,
    useTheme
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { authenticatedFetch } from '../utils/api';
import { getApiBaseUrl } from '../utils/apiConfig';

interface SystemMetric {
    id?: number; // Optional now as aggregated results might not have ID
    cpu_usage: number;
    ram_usage: number;
    cpu_temp: number;
    timestamp: number;
}

interface SystemMetricsModalProps {
    open: boolean;
    onClose: () => void;
}

const SystemMetricsModal: React.FC<SystemMetricsModalProps> = ({ open, onClose }) => {
    const [metrics, setMetrics] = useState<SystemMetric[]>([]);
    const [loading, setLoading] = useState(false);
    const [viewRange, setViewRange] = useState<'daily' | 'weekly'>('daily');
    const theme = useTheme();

    useEffect(() => {
        if (open) {
            fetchHistory(viewRange);
        }
    }, [open, viewRange]);

    const fetchHistory = async (range: string) => {
        setLoading(true);
        try {
            const response = await authenticatedFetch(`${getApiBaseUrl()}/api/metrics/history?range=${range}`);
            if (response.ok) {
                const data = await response.json();
                // Data is already ordered ASC from aggregation query, but let's ensure it maps correctly
                setMetrics(data);
            }
        } catch (error) {
            console.error('Error fetching metrics history:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRangeChange = (
        event: React.MouseEvent<HTMLElement>,
        newRange: 'daily' | 'weekly' | null,
    ) => {
        if (newRange !== null) {
            setViewRange(newRange);
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        if (viewRange === 'weekly') {
            // For weekly view, show Day and Time (e.g., "Mon 14:00")
            return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <Box sx={{ bgcolor: 'background.paper', p: 1, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {viewRange === 'weekly'
                            ? new Date(label).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : formatTime(label)
                        }
                    </Typography>
                    <Typography variant="body2" sx={{ color: payload[0].color, fontWeight: 'bold' }}>
                        {payload[0].name}: {payload[0].value.toFixed(1)}{payload[0].unit || ''}
                    </Typography>
                </Box>
            );
        }
        return null;
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: 'background.default',
                    backgroundImage: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                }
            }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <Typography variant="h6" fontWeight="bold">System Metrics History</Typography>
                <Box>
                    <ToggleButtonGroup
                        value={viewRange}
                        exclusive
                        onChange={handleRangeChange}
                        aria-label="time range"
                        size="small"
                        sx={{ mr: 2 }}
                    >
                        <ToggleButton value="daily" aria-label="daily">
                            Daily
                        </ToggleButton>
                        <ToggleButton value="weekly" aria-label="weekly">
                            Weekly
                        </ToggleButton>
                    </ToggleButtonGroup>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent sx={{ p: 3 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {/* CPU Usage Chart */}
                        <Box>
                            <Typography variant="subtitle1" sx={{ mb: 1, color: '#90caf9', fontWeight: 600 }}>CPU Usage (%)</Typography>
                            <Box sx={{ height: 200, width: '100%' }}>
                                <ResponsiveContainer>
                                    <AreaChart data={metrics}>
                                        <defs>
                                            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#2196F3" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#2196F3" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={formatTime}
                                            stroke="rgba(255,255,255,0.5)"
                                            tick={{ fontSize: 12 }}
                                            minTickGap={30}
                                        />
                                        <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 12 }} domain={[0, 100]} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area
                                            type="monotone"
                                            dataKey="cpu_usage"
                                            name="CPU"
                                            stroke="#2196F3"
                                            fillOpacity={1}
                                            fill="url(#colorCpu)"
                                            unit="%"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </Box>
                        </Box>

                        {/* RAM Usage Chart */}
                        <Box>
                            <Typography variant="subtitle1" sx={{ mb: 1, color: '#e040fb', fontWeight: 600 }}>RAM Usage (%)</Typography>
                            <Box sx={{ height: 200, width: '100%' }}>
                                <ResponsiveContainer>
                                    <AreaChart data={metrics}>
                                        <defs>
                                            <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#e040fb" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#e040fb" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={formatTime}
                                            stroke="rgba(255,255,255,0.5)"
                                            tick={{ fontSize: 12 }}
                                            minTickGap={30}
                                        />
                                        <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 12 }} domain={[0, 100]} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area
                                            type="monotone"
                                            dataKey="ram_usage"
                                            name="RAM"
                                            stroke="#e040fb"
                                            fillOpacity={1}
                                            fill="url(#colorRam)"
                                            unit="%"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </Box>
                        </Box>

                        {/* CPU Temperature Chart */}
                        <Box>
                            <Typography variant="subtitle1" sx={{ mb: 1, color: '#ff9800', fontWeight: 600 }}>CPU Temperature (°C)</Typography>
                            <Box sx={{ height: 200, width: '100%' }}>
                                <ResponsiveContainer>
                                    <LineChart data={metrics}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                        <XAxis
                                            dataKey="timestamp"
                                            tickFormatter={formatTime}
                                            stroke="rgba(255,255,255,0.5)"
                                            tick={{ fontSize: 12 }}
                                            minTickGap={30}
                                        />
                                        <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 12 }} domain={['auto', 'auto']} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line
                                            type="monotone"
                                            dataKey="cpu_temp"
                                            name="Temp"
                                            stroke="#ff9800"
                                            strokeWidth={2}
                                            dot={false}
                                            unit="°C"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Box>
                        </Box>
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default SystemMetricsModal;
