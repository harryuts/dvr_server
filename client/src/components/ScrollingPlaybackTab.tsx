import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, TextField, MenuItem, Paper, Alert } from '@mui/material';
import { authenticatedFetch } from '../utils/api';
import { getApiBaseUrl } from '../utils/apiConfig';
import { getAuthData } from '../utils/auth';

interface Channel {
    channel: string;
    name: string;
}

interface VideoSegment {
    start_time: number;
    end_time: number;
}

interface ScrollingPlaybackTabProps {
    channelData: Channel[];
}

const ScrollingPlaybackTab: React.FC<ScrollingPlaybackTabProps> = ({ channelData }) => {
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedChannel, setSelectedChannel] = useState<string>(channelData.length > 0 ? channelData[0].channel : '');
    const [segments, setSegments] = useState<VideoSegment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [playingUrl, setPlayingUrl] = useState<string | null>(null);
    const [tooltipData, setTooltipData] = useState<{ x: number, y: number, timeStr: string } | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!selectedChannel || !selectedDate) return;

        const fetchSegments = async () => {
            setLoading(true);
            setError(null);
            try {
                // Parse date string (YYYY-MM-DD) into local time components
                const [year, month, day] = selectedDate.split('-').map(Number);
                const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
                const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

                const response = await authenticatedFetch(
                    `${getApiBaseUrl()}/api/video-segments?channel=${selectedChannel}&startTime=${dayStart}&endTime=${dayEnd}`
                );

                if (response.ok) {
                    const data = await response.json();
                    setSegments(data);
                } else {
                    setError('Failed to fetch video segments');
                }
            } catch (err) {
                console.error("Error fetching segments:", err);
                setError('An error occurred while fetching segments');
            } finally {
                setLoading(false);
            }
        };

        fetchSegments();
    }, [selectedChannel, selectedDate]);

    useEffect(() => {
        drawTimeline();
    }, [segments]); // Redraw when segments change

    const drawTimeline = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Draw background
        ctx.fillStyle = '#1b2d4c'; // Dark blue
        ctx.fillRect(0, 0, width, height);

        // Draw segments
        ctx.fillStyle = '#4caf50'; // Green for available video

        // Use consistent local day start
        const [year, month, day] = selectedDate.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
        const dayDuration = dayEnd - dayStart;

        segments.forEach(segment => {
            // Calculate relative position based on 24h day
            // Clamp start and end to the current day
            const start = Math.max(segment.start_time, dayStart);
            const end = Math.min(segment.end_time, dayEnd);

            if (start < end) {
                const startRatio = (start - dayStart) / dayDuration;
                const endRatio = (end - dayStart) / dayDuration;

                const x = startRatio * width;
                const w = (endRatio - startRatio) * width;

                // Create gap: Draw bar only in top portion (e.g., top 70%)
                // Height is 120. Text is at bottom ~20px. 
                // Let's use height - 40 for the bar height, starting at 10.
                ctx.fillRect(x, 10, w, height - 50);
            }
        });

        // Draw hour markers
        ctx.fillStyle = '#b0bec5';
        ctx.font = '14px Arial'; // Larger font
        ctx.textAlign = 'center'; // Center align text

        for (let i = 0; i <= 24; i += 1) { // Every 1 hour
            const x = (i / 24) * width;

            // Draw marker line
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(x, 0, 1, height - 30); // Stop before text area

            // Draw time label
            ctx.fillStyle = '#b0bec5';
            // Offset text slightly to avoid overlapping with the very edge if needed, 
            // but centered on the line is usually best.
            // Adjust y position to be at the bottom
            ctx.fillText(`${i}:00`, x, height - 5);
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;

        // Calculate timestamp
        const ratio = x / width;
        const [year, month, day] = selectedDate.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        const dayDuration = 24 * 60 * 60 * 1000;
        const timestamp = Math.floor(dayStart + (ratio * dayDuration));

        const date = new Date(timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        setTooltipData({ x: e.clientX, y: e.clientY, timeStr });
    };

    const handleMouseLeave = () => {
        setTooltipData(null);
    };

    const handleTimelineClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width; // Use displayed width, not internal canvas width
        const ratio = x / width;

        // Use consistent local day start
        const [year, month, day] = selectedDate.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        const dayDuration = 24 * 60 * 60 * 1000;
        const clickedTimestamp = Math.floor(dayStart + (ratio * dayDuration));

        console.log(`[ScrollingPlaybackTab] Generating stream URL for channel ${selectedChannel} at ${clickedTimestamp}`);
        const endTime = clickedTimestamp + 60000; // 60 seconds play duration

        try {
            const response = await authenticatedFetch(
                `${getApiBaseUrl()}/api/getLiveVideo?channelNumber=${selectedChannel}&startTime=${clickedTimestamp}&endTime=${endTime}`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.streamUrl) {
                    // Start valid stream
                    // Authenticaton for the video player (img tag) requires token in query param
                    const token = getAuthData()?.token;
                    const streamUrlWithAuth = `${getApiBaseUrl()}${data.streamUrl}&token=${token}`;
                    console.log(`[ScrollingPlaybackTab] Playing stream: ${streamUrlWithAuth}`);
                    setPlayingUrl(streamUrlWithAuth);
                } else {
                    console.error("No streamUrl in response");
                    setError("Failed to start playback: No stream URL returned");
                }
            } else {
                console.error("Failed to fetch live video details");
                setError("Failed to start playback");
            }
        } catch (e) {
            console.error("Error starting playback:", e);
            setError("Error starting playback");
        }

        // Also draw a red line cursor
        drawTimeline(); // Redraw base
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const canvasX = ratio * canvas.width; // Scale ratio to canvas internal width
            ctx.fillStyle = 'red';
            ctx.fillRect(canvasX, 0, 2, canvas.height);
        }
    };

    return (
        <Box sx={{ p: 3, color: 'text.primary' }}>
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <TextField
                    select
                    label="Channel"
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    sx={{ width: 200 }}
                    SelectProps={{
                        MenuProps: { PaperProps: { sx: { maxHeight: 300 } } }
                    }}
                >
                    {channelData.map((channel) => (
                        <MenuItem key={channel.channel} value={channel.channel}>
                            {channel.channel} - {channel.name}
                        </MenuItem>
                    ))}
                </TextField>

                <TextField
                    type="date"
                    label="Date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{
                        '& input::-webkit-calendar-picker-indicator': {
                            filter: 'invert(1)',
                            cursor: 'pointer'
                        }
                    }}
                />
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Typography variant="subtitle1" gutterBottom>Timeline (Click to Play)</Typography>
            <Paper sx={{ p: 1, backgroundColor: '#122444', overflowX: 'auto', mb: 3, position: 'relative' }}>
                <canvas
                    ref={canvasRef}
                    width={2400}
                    height={120} // Increased height
                    style={{ minWidth: '2400px', cursor: 'pointer', display: 'block' }}
                    onClick={handleTimelineClick}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                />
                {tooltipData && (
                    <div
                        style={{
                            position: 'fixed',
                            top: tooltipData.y - 40,
                            left: tooltipData.x + 10,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            pointerEvents: 'none',
                            zIndex: 1000,
                            whiteSpace: 'nowrap',
                            fontSize: '12px'
                        }}
                    >
                        {tooltipData.timeStr}
                    </div>
                )}
            </Paper>

            {playingUrl && (
                <Box sx={{ width: '100%', maxWidth: 800, margin: '0 auto', border: '1px solid #333' }}>
                    <Typography variant="h6" gutterBottom>Playback</Typography>
                    {/* Stream returns video/mp4, so use video tag */}
                    <video
                        src={playingUrl}
                        controls
                        autoPlay
                        style={{ width: '100%', height: 'auto' }}
                    />
                </Box>
            )}
        </Box>
    );
};

export default ScrollingPlaybackTab;
