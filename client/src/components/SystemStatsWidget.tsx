import React, { useState, useEffect } from 'react';
import { Box, Typography, LinearProgress, Paper } from '@mui/material';
import { authenticatedFetch } from '../utils/api';
import { getApiBaseUrl } from '../utils/apiConfig';

interface SystemStats {
    cpu: number;
    cpuCount: number;
    cpuTemp?: number;
    ram: number;
    totalMem: number;
    usedMem: number;
}

const SystemStatsWidget: React.FC = () => {
    const [stats, setStats] = useState<SystemStats | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await authenticatedFetch(`${getApiBaseUrl()}/admin/system-stats`);
                if (response.ok) {
                    const data = await response.json();
                    setStats(data);
                }
            } catch (error) {
                console.error("Error fetching system stats:", error);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 2000); // Update every 2 seconds

        return () => clearInterval(interval);
    }, []);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    if (!stats) return null;

    return (
        <Box sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.12)' }}>
            <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: '#b0bec5', fontWeight: 600 }}>CPU</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: '#b0bec5' }}>{stats.cpuCount} Cores</Typography>
                        {stats.cpuTemp && (
                            <Typography variant="caption" sx={{
                                color: stats.cpuTemp > 80 ? '#f44336' : stats.cpuTemp > 60 ? '#ff9800' : '#4caf50',
                                fontWeight: 600
                            }}>
                                {stats.cpuTemp}°C
                            </Typography>
                        )}
                        <Typography variant="caption" sx={{ color: '#ffffff', fontWeight: 600 }}>{stats.cpu}%</Typography>
                    </Box>
                </Box>
                <LinearProgress
                    variant="determinate"
                    value={stats.cpu}
                    sx={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        '& .MuiLinearProgress-bar': {
                            backgroundColor: stats.cpu > 80 ? '#f44336' : '#2196F3'
                        }
                    }}
                />
            </Box>
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ color: '#b0bec5', fontWeight: 600 }}>RAM</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: '#b0bec5' }}>{formatBytes(stats.totalMem)}</Typography>
                        <Typography variant="caption" sx={{ color: '#ffffff', fontWeight: 600 }}>{stats.ram}%</Typography>
                    </Box>
                </Box>
                <LinearProgress
                    variant="determinate"
                    value={stats.ram}
                    sx={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        '& .MuiLinearProgress-bar': {
                            backgroundColor: stats.ram > 80 ? '#f44336' : '#2196F3'
                        }
                    }}
                />
            </Box>
        </Box>
    );
};

export default SystemStatsWidget;
