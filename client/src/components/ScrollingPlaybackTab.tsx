import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, TextField, MenuItem, Paper, Alert, Button, ButtonGroup } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
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
    const videoRef = useRef<HTMLVideoElement>(null);
    
    // Zoom state: hours to display (24 = full day, 12 = half day, etc.)
    const [zoomHours, setZoomHours] = useState<number>(24);
    // Pan offset: hours from start of day (0 = start at midnight)
    const [panOffsetHours, setPanOffsetHours] = useState<number>(0);
    
    // Track current playback time for auto-continuation
    const [currentEndTime, setCurrentEndTime] = useState<number | null>(null);

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
    }, [segments, zoomHours, panOffsetHours]); // Redraw when segments or zoom changes

    // Keyboard shortcuts for zoom and pan
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle if no input elements are focused
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key) {
                case '+':
                case '=':
                    e.preventDefault();
                    handleZoomIn();
                    break;
                case '-':
                case '_':
                    e.preventDefault();
                    handleZoomOut();
                    break;
                case 'ArrowLeft':
                    if (e.shiftKey) {
                        e.preventDefault();
                        handlePanLeft();
                    }
                    break;
                case 'ArrowRight':
                    if (e.shiftKey) {
                        e.preventDefault();
                        handlePanRight();
                    }
                    break;
                case '0':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        handleResetZoom();
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [zoomHours, panOffsetHours]);

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

        // Calculate the visible time window based on zoom
        const [year, month, day] = selectedDate.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        const windowStart = dayStart + (panOffsetHours * 60 * 60 * 1000);
        const windowEnd = windowStart + (zoomHours * 60 * 60 * 1000);
        const windowDuration = windowEnd - windowStart;

        segments.forEach(segment => {
            // Only draw segments that overlap with the visible window
            const start = Math.max(segment.start_time, windowStart);
            const end = Math.min(segment.end_time, windowEnd);

            if (start < end) {
                const startRatio = (start - windowStart) / windowDuration;
                const endRatio = (end - windowStart) / windowDuration;

                const x = startRatio * width;
                const w = (endRatio - startRatio) * width;

                // Create gap: Draw bar only in top portion (e.g., top 70%)
                // Height is 120. Text is at bottom ~20px. 
                // Let's use height - 40 for the bar height, starting at 10.
                ctx.fillRect(x, 10, w, height - 50);
            }
        });

        // Draw hour markers - adapt based on zoom level
        ctx.fillStyle = '#b0bec5';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';

        // Determine marker interval based on zoom
        let markerInterval = 1; // hours
        if (zoomHours <= 2) markerInterval = 0.25; // 15 min intervals
        else if (zoomHours <= 6) markerInterval = 0.5; // 30 min intervals
        else if (zoomHours <= 12) markerInterval = 1; // 1 hour intervals
        else markerInterval = 2; // 2 hour intervals for wider views

        const totalMarkers = Math.ceil(zoomHours / markerInterval) + 1;
        
        for (let i = 0; i < totalMarkers; i++) {
            const hourOffset = i * markerInterval;
            const absoluteHour = panOffsetHours + hourOffset;
            
            if (absoluteHour > 24) break; // Don't draw beyond 24 hours
            
            const x = (hourOffset / zoomHours) * width;

            // Draw marker line
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(x, 0, 1, height - 30);

            // Draw time label
            ctx.fillStyle = '#b0bec5';
            const hours = Math.floor(absoluteHour);
            const minutes = Math.round((absoluteHour - hours) * 60);
            const timeLabel = minutes === 0 ? `${hours}:00` : `${hours}:${minutes.toString().padStart(2, '0')}`;
            ctx.fillText(timeLabel, x, height - 5);
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;

        // Calculate timestamp based on visible window
        const ratio = x / width;
        const [year, month, day] = selectedDate.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        const windowStart = dayStart + (panOffsetHours * 60 * 60 * 1000);
        const windowDuration = zoomHours * 60 * 60 * 1000;
        const timestamp = Math.floor(windowStart + (ratio * windowDuration));

        const date = new Date(timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        setTooltipData({ x: e.clientX, y: e.clientY, timeStr });
    };

    const handleMouseLeave = () => {
        setTooltipData(null);
    };

    // Auto-continue playback when video ends
    const handleVideoEnded = async () => {
        if (!currentEndTime || !selectedChannel) return;

        console.log(`[ScrollingPlaybackTab] Video ended. Fetching continuation from ${new Date(currentEndTime).toLocaleTimeString()}`);
        
        const now = Date.now();
        const nextEndTime = currentEndTime + 60000; // Next 60 seconds

        // Don't continue if we're past "now"
        if (currentEndTime >= now) {
            console.log(`[ScrollingPlaybackTab] Reached live time, stopping auto-continue`);
            return;
        }

        try {
            const response = await authenticatedFetch(
                `${getApiBaseUrl()}/api/getLiveVideo?channelNumber=${selectedChannel}&startTime=${currentEndTime}&endTime=${nextEndTime}`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.streamUrl) {
                    const token = getAuthData()?.token;
                    const streamUrlWithAuth = `${getApiBaseUrl()}${data.streamUrl}&token=${token}`;
                    console.log(`[ScrollingPlaybackTab] Continuing playback: ${streamUrlWithAuth}`);
                    setPlayingUrl(streamUrlWithAuth);
                    setCurrentEndTime(nextEndTime);
                    
                    // Auto-play the continuation
                    setTimeout(() => {
                        if (videoRef.current) {
                            videoRef.current.play().catch((err) => {
                                console.warn("[ScrollingPlaybackTab] Autoplay continuation failed:", err);
                            });
                        }
                    }, 100);
                } else {
                    console.log("No more video available for continuation");
                }
            } else {
                console.log("Failed to fetch continuation video");
            }
        } catch (e) {
            console.error("Error fetching continuation video:", e);
        }
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        // Use wheel for panning when zoomed in
        if (zoomHours < 24) {
            e.preventDefault();
            const panAmount = zoomHours * 0.1; // Pan by 10% of visible window
            if (e.deltaY < 0) {
                // Scroll up = pan left
                setPanOffsetHours(Math.max(0, panOffsetHours - panAmount));
            } else {
                // Scroll down = pan right
                setPanOffsetHours(Math.min(24 - zoomHours, panOffsetHours + panAmount));
            }
        }
    };

    // Zoom control functions
    const handleZoomIn = () => {
        const newZoom = Math.max(0.5, zoomHours / 2); // Minimum 30 minutes
        setZoomHours(newZoom);
        
        // Adjust pan to keep view centered
        const centerTime = panOffsetHours + (zoomHours / 2);
        const newPan = Math.max(0, Math.min(24 - newZoom, centerTime - (newZoom / 2)));
        setPanOffsetHours(newPan);
    };

    const handleZoomOut = () => {
        const newZoom = Math.min(24, zoomHours * 2); // Maximum 24 hours
        setZoomHours(newZoom);
        
        // Adjust pan to keep view centered
        const centerTime = panOffsetHours + (zoomHours / 2);
        const newPan = Math.max(0, Math.min(24 - newZoom, centerTime - (newZoom / 2)));
        setPanOffsetHours(newPan);
    };

    const handleResetZoom = () => {
        setZoomHours(24);
        setPanOffsetHours(0);
    };

    const handlePanLeft = () => {
        const panAmount = zoomHours * 0.25; // Pan by 25% of visible window
        setPanOffsetHours(Math.max(0, panOffsetHours - panAmount));
    };

    const handlePanRight = () => {
        const panAmount = zoomHours * 0.25; // Pan by 25% of visible window
        setPanOffsetHours(Math.min(24 - zoomHours, panOffsetHours + panAmount));
    };

    const handleTimelineClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width; // Use displayed width, not internal canvas width
        const ratio = x / width;

        // Calculate timestamp based on visible window
        const [year, month, day] = selectedDate.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        const windowStart = dayStart + (panOffsetHours * 60 * 60 * 1000);
        const windowDuration = zoomHours * 60 * 60 * 1000;
        const clickedTimestamp = Math.floor(windowStart + (ratio * windowDuration));

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
                    setError(null); // Clear any previous errors
                    setPlayingUrl(streamUrlWithAuth);
                    setCurrentEndTime(endTime); // Track end time for auto-continuation
                    
                    // Draw red line cursor asynchronously to not block video loading
                    requestAnimationFrame(() => {
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            // Redraw entire timeline first
                            drawTimeline();
                            // Then draw the red cursor line on top
                            const canvasX = ratio * canvas.width; // Scale ratio to canvas internal width
                            ctx.fillStyle = 'red';
                            ctx.fillRect(canvasX, 0, 2, canvas.height);
                        }
                    });
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

            <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="subtitle1">Timeline (Click to Play)</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            {zoomHours === 24 ? 'Full Day' : `${zoomHours < 1 ? `${Math.round(zoomHours * 60)}min` : `${zoomHours}h`} view`}
                        </Typography>
                        <ButtonGroup variant="outlined" size="small">
                            <Button onClick={handlePanLeft} disabled={panOffsetHours <= 0} title="Pan Left (Shift + ←)">
                                <ArrowBackIcon />
                            </Button>
                            <Button onClick={handlePanRight} disabled={panOffsetHours >= 24 - zoomHours} title="Pan Right (Shift + →)">
                                <ArrowForwardIcon />
                            </Button>
                        </ButtonGroup>
                        <ButtonGroup variant="outlined" size="small">
                            <Button onClick={handleZoomIn} disabled={zoomHours <= 0.5} title="Zoom In (+)">
                                <ZoomInIcon />
                            </Button>
                            <Button onClick={handleZoomOut} disabled={zoomHours >= 24} title="Zoom Out (-)">
                                <ZoomOutIcon />
                            </Button>
                            <Button onClick={handleResetZoom} disabled={zoomHours === 24 && panOffsetHours === 0} title="Reset View (Ctrl+0)">
                                <RestartAltIcon />
                            </Button>
                        </ButtonGroup>
                    </Box>
                </Box>
                {zoomHours < 24 && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        Viewing {Math.floor(panOffsetHours)}:00 to {Math.floor(panOffsetHours + zoomHours)}:00 • Scroll wheel to pan • Shift+Arrow keys to navigate
                    </Typography>
                )}
            </Box>
            <Paper sx={{ p: 1, backgroundColor: '#122444', overflowX: 'auto', mb: 3, position: 'relative' }}>
                <canvas
                    ref={canvasRef}
                    width={2400}
                    height={120} // Increased height
                    style={{ minWidth: '2400px', cursor: 'pointer', display: 'block' }}
                    onClick={handleTimelineClick}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onWheel={handleWheel}
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Box>
                            <Typography variant="h6">
                                Playback
                                {currentEndTime && (
                                    <Typography component="span" variant="caption" color="success.main" sx={{ ml: 2 }}>
                                        • Auto-continues
                                    </Typography>
                                )}
                            </Typography>
                            {currentEndTime && (
                                <Typography variant="caption" color="text.secondary">
                                    Playing until: {new Date(currentEndTime).toLocaleTimeString()}
                                </Typography>
                            )}
                        </Box>
                        <Button 
                            variant="outlined" 
                            size="small" 
                            color="error"
                            onClick={() => {
                                setPlayingUrl(null);
                                setCurrentEndTime(null);
                                if (videoRef.current) {
                                    videoRef.current.pause();
                                }
                            }}
                        >
                            Stop
                        </Button>
                    </Box>
                    {/* Stream returns video/mp4, so use video tag */}
                    <video
                        ref={videoRef}
                        key={playingUrl}
                        src={playingUrl}
                        controls
                        autoPlay
                        onEnded={handleVideoEnded}
                        style={{ width: '100%', height: 'auto' }}
                    />
                </Box>
            )}
        </Box>
    );
};

export default ScrollingPlaybackTab;
