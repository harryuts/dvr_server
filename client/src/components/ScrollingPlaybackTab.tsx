import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, TextField, MenuItem, Paper, Alert, Button, ButtonGroup, Select, FormControl, InputLabel, ListItemText, CircularProgress } from '@mui/material';
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
    const [loadingVideo, setLoadingVideo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [playingUrl, setPlayingUrl] = useState<string | null>(null);
    const [tooltipData, setTooltipData] = useState<{ x: number, y: number, timeStr: string } | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineContainerRef = useRef<HTMLDivElement>(null);
    
    // Zoom state: hours to display (24 = full day, 12 = half day, etc.)
    const [zoomHours, setZoomHours] = useState<number>(24);
    // Pan offset: hours from start of day (0 = start at midnight)
    const [panOffsetHours, setPanOffsetHours] = useState<number>(0);
    // Track calculated canvas width for styling
    const [canvasWidth, setCanvasWidth] = useState<number>(2520); // 2400 + 120 padding
    
    // Track current playback time for auto-continuation
    const [currentEndTime, setCurrentEndTime] = useState<number | null>(null);
    const [currentStartTime, setCurrentStartTime] = useState<number | null>(null); // Track when current video started
    
    // Track cursor position (red line) in hours from start of day
    const [cursorPositionHours, setCursorPositionHours] = useState<number | null>(null);
    const cursorPositionRef = useRef<number | null>(null);
    
    // Track current playback position for display
    const [currentPlaybackTime, setCurrentPlaybackTime] = useState<number | null>(null);
    
    // Track dates with recordings for the selected channel
    const [datesWithRecordings, setDatesWithRecordings] = useState<Set<string>>(new Set());
    
    // Track previous values to detect what changed
    const prevDateRef = useRef<string | null>(null);
    const prevChannelRef = useRef<string | null>(null);
    
    // Flag to prevent timeupdate from overwriting manual cursor positions
    const isManualCursorUpdate = useRef<boolean>(false);
    // Flag to prevent multiple simultaneous clicks
    const isProcessingClick = useRef<boolean>(false);
    // AbortController to cancel pending requests
    const abortControllerRef = useRef<AbortController | null>(null);
    // Debounce timer for rapid clicks
    const clickDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Track current expected playing URL to prevent stale video updates
    const currentPlayingUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!selectedChannel || !selectedDate) return;

        const dateChanged = prevDateRef.current !== null && prevDateRef.current !== selectedDate;
        const channelChanged = prevChannelRef.current !== null && prevChannelRef.current !== selectedChannel;
        const isInitialLoad = prevDateRef.current === null && prevChannelRef.current === null;
        
        // Capture values for use in async function
        const shouldAutoPlay = channelChanged && !dateChanged;
        const savedCursorPosition = cursorPositionRef.current;
        
        // Update refs
        prevDateRef.current = selectedDate;
        prevChannelRef.current = selectedChannel;

        // If date changed, reset everything including cursor and stop video
        if (dateChanged || isInitialLoad) {
            setCursorPositionHours(null);
            cursorPositionRef.current = null;
            setZoomHours(24); // Reset to full day view
            setPanOffsetHours(0); // Reset to start of day
            
            // Stop any currently playing video
            setPlayingUrl(null);
            currentPlayingUrlRef.current = null; // Clear tracked URL
            setCurrentEndTime(null);
            setCurrentStartTime(null);
            setCurrentPlaybackTime(null);
            setLoadingVideo(false);
            isProcessingClick.current = false;
            isManualCursorUpdate.current = false;
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            }
        } else if (channelChanged) {
            // Only channel changed - preserve cursor position and zoom/pan
            // Don't reset cursor or zoom/pan
            // Stop current video but will auto-play at cursor position after segments load
            setPlayingUrl(null);
            setCurrentEndTime(null);
            setCurrentStartTime(null);
            setCurrentPlaybackTime(null);
            setLoadingVideo(false);
            isProcessingClick.current = false;
            isManualCursorUpdate.current = false;
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            }
        }

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
                    
                    // If only channel changed and cursor position exists, auto-play at that position
                    if (shouldAutoPlay && savedCursorPosition !== null) {
                        const cursorHours = savedCursorPosition;
                        const clickedTimestamp = dayStart + (cursorHours * 60 * 60 * 1000);
                        const endTime = clickedTimestamp + 60000; // 60 seconds play duration
                        
                        // Small delay to ensure segments are processed
                        setTimeout(async () => {
                            setLoadingVideo(true);
                            try {
                                const videoResponse = await authenticatedFetch(
                                    `${getApiBaseUrl()}/api/getVideo?channelNumber=${selectedChannel}&startTime=${clickedTimestamp}&endTime=${endTime}`
                                );
                                
                                if (videoResponse.ok) {
                                    const videoData = await videoResponse.json();
                                    if (videoData.outputFile) {
                                        const videoUrl = `${getApiBaseUrl()}/cctv/${videoData.outputFile}`;
                                        console.log(`[ChannelChange] Auto-playing at cursor position: ${videoUrl}`);
                                        setPlayingUrl(videoUrl);
                                        setCurrentEndTime(endTime);
                                        setLoadingVideo(false);
                                        
                                        // Auto-play the video
                                        setTimeout(() => {
                                            if (videoRef.current) {
                                                videoRef.current.play().catch((err) => {
                                                    console.warn("[ChannelChange] Autoplay failed:", err);
                                                });
                                            }
                                        }, 100);
                                    } else {
                                        setLoadingVideo(false);
                                    }
                                } else {
                                    setLoadingVideo(false);
                                }
                            } catch (e) {
                                console.error("Error auto-playing video on channel change:", e);
                                setLoadingVideo(false);
                            }
                        }, 200);
                    }
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

    // Fetch dates with recordings when channel changes
    useEffect(() => {
        if (!selectedChannel) return;

        const fetchDatesWithRecordings = async () => {
            try {
                const response = await authenticatedFetch(
                    `${getApiBaseUrl()}/api/dates-with-recordings?channel=${selectedChannel}`
                );
                if (response.ok) {
                    const data = await response.json();
                    setDatesWithRecordings(new Set(data.dates || []));
                }
            } catch (err) {
                console.error("Error fetching dates with recordings:", err);
            }
        };

        fetchDatesWithRecordings();
    }, [selectedChannel]);

    // Auto-refresh segments when viewing today's date to show current recording progress
    useEffect(() => {
        if (!selectedDate || !selectedChannel) return;

        // Check if selected date is today
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const isToday = selectedDate === todayStr;

        if (!isToday) return; // Only auto-refresh for today

        // Refresh segments every 5 seconds to update current recording segment
        const refreshInterval = setInterval(() => {
            const [year, month, day] = selectedDate.split('-').map(Number);
            const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
            const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

            authenticatedFetch(
                `${getApiBaseUrl()}/api/video-segments?channel=${selectedChannel}&startTime=${dayStart}&endTime=${dayEnd}`
            )
                .then(response => {
                    if (response.ok) {
                        return response.json();
                    }
                    throw new Error('Failed to refresh segments');
                })
                .then(data => {
                    setSegments(data);
                    console.log('[Timeline] Auto-refreshed segments for current recording');
                })
                .catch(err => {
                    console.error('[Timeline] Error auto-refreshing segments:', err);
                });
        }, 5000); // Refresh every 5 seconds

        return () => {
            clearInterval(refreshInterval);
        };
    }, [selectedChannel, selectedDate]);

    useEffect(() => {
        drawTimeline();
    }, [segments, zoomHours, panOffsetHours, cursorPositionHours, selectedDate]); // Redraw when segments, zoom, pan, cursor, or date changes

    // Update cursor position when video URL changes (for continuation)
    useEffect(() => {
        if (playingUrl && currentStartTime) {
            // Track the new playing URL to prevent stale video updates
            currentPlayingUrlRef.current = playingUrl;
            
            // Initialize cursor position when new video segment starts
            const [year, month, day] = selectedDate.split('-').map(Number);
            const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
            const playbackHours = (currentStartTime - dayStart) / (60 * 60 * 1000);
            
            cursorPositionRef.current = playbackHours;
            setCursorPositionHours(playbackHours);
            setCurrentPlaybackTime(currentStartTime);
            
            // Redraw timeline to show updated cursor
            requestAnimationFrame(() => {
                drawTimeline();
            });
        } else if (!playingUrl) {
            // Clear tracked URL when video stops
            currentPlayingUrlRef.current = null;
        }
    }, [playingUrl, currentStartTime, selectedDate]);

    // Scroll container to show cursor position after zoom/pan changes
    useEffect(() => {
        if (cursorPositionRef.current !== null && timelineContainerRef.current && canvasRef.current) {
            // Wait for canvas to be redrawn before scrolling
            requestAnimationFrame(() => {
                const cursorHours = cursorPositionRef.current;
                if (cursorHours === null) return;
                
                const canvas = canvasRef.current;
                const container = timelineContainerRef.current;
                if (!canvas || !container) return;
                
                // Use actual canvas width (which includes padding)
                const canvasWidth = canvas.width;
                const horizontalPadding = 60;
                const drawableWidth = canvasWidth - (horizontalPadding * 2);
                
                // Calculate cursor position relative to pan offset
                const cursorOffset = cursorHours - panOffsetHours;
                
                // Only scroll if cursor is within visible window
                if (cursorOffset >= 0 && cursorOffset <= zoomHours) {
                    // Calculate pixel position of cursor on canvas
                    const cursorRatio = cursorOffset / zoomHours;
                    const cursorPixelPos = horizontalPadding + (cursorRatio * drawableWidth);
                    
                    // Calculate scroll position to center cursor in viewport
                    const containerWidth = container.clientWidth;
                    const scrollPosition = cursorPixelPos - (containerWidth / 2);
                    
                    console.log(`[ScrollEffect] Cursor: ${cursorHours}h, Offset: ${cursorOffset}h, Pixel: ${cursorPixelPos}px, Scroll: ${scrollPosition}px`);
                    
                    // Scroll smoothly to position
                    container.scrollTo({
                        left: Math.max(0, scrollPosition),
                        behavior: 'smooth'
                    });
                }
            });
        }
    }, [zoomHours, panOffsetHours]); // Scroll when zoom or pan changes

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

        // Calculate dynamic canvas width based on zoom level
        // When zoomed in (smaller zoomHours), use wider canvas for more detail
        // Base width: 2400px for 24 hours, scale proportionally
        const baseWidth = 2400;
        const zoomFactor = 24 / zoomHours; // Higher factor = more zoomed in
        
        // Add padding on left and right for time labels (60px each side)
        const horizontalPadding = 60;
        
        let dynamicWidth: number;
        
        // If showing full day (24 hours), make canvas fit container width
        if (zoomHours === 24 && timelineContainerRef.current) {
            const container = timelineContainerRef.current;
            const containerWidth = container.clientWidth;
            if (containerWidth > horizontalPadding * 2) {
                // Use container width minus padding to fit exactly
                dynamicWidth = containerWidth - (horizontalPadding * 2);
            } else {
                // Fallback to base calculation if container too small
                dynamicWidth = baseWidth;
            }
        } else {
            // When zoomed in, use wider canvas for more detail
            dynamicWidth = Math.max(baseWidth, Math.floor(baseWidth * zoomFactor));
        }
        
        const totalWidth = dynamicWidth + (horizontalPadding * 2);
        
        // Update canvas dimensions if needed
        if (canvas.width !== totalWidth) {
            canvas.width = totalWidth;
        }
        
        // Update state for styling
        setCanvasWidth(totalWidth);
        
        const width = canvas.width;
        const height = canvas.height;
        const drawableWidth = width - (horizontalPadding * 2);

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

                const x = horizontalPadding + (startRatio * drawableWidth);
                const w = (endRatio - startRatio) * drawableWidth;

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
            
            const x = horizontalPadding + (hourOffset / zoomHours) * drawableWidth;

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

        // Draw red cursor line if cursor position is set and within visible window
        // Use ref to get the latest cursor position value (avoids stale closure issues)
        const currentCursorPosition = cursorPositionRef.current;
        if (currentCursorPosition !== null && currentCursorPosition >= 0 && currentCursorPosition <= 24) {
            const cursorTime = currentCursorPosition;
            if (cursorTime >= panOffsetHours && cursorTime <= panOffsetHours + zoomHours) {
                const cursorOffset = cursorTime - panOffsetHours;
                const cursorX = horizontalPadding + (cursorOffset / zoomHours) * drawableWidth;
                ctx.fillStyle = 'red';
                ctx.fillRect(cursorX, 0, 2, height);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const horizontalPadding = 60;
        
        // Adjust for padding - map mouse position to drawable area
        const drawableWidth = width - (horizontalPadding * 2);
        const adjustedX = Math.max(0, Math.min(drawableWidth, x - horizontalPadding));
        const ratio = adjustedX / drawableWidth;

        // Calculate timestamp based on visible window
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
    const handleVideoTimeUpdate = () => {
        if (!videoRef.current || !currentStartTime || !playingUrl) return;
        
        // Don't update cursor if manual update is in progress
        if (isManualCursorUpdate.current) return;
        
        // Verify this video element matches the current expected playing URL
        // This prevents stale video elements from updating the cursor
        if (currentPlayingUrlRef.current !== playingUrl) {
            // Video URL doesn't match - this is a stale video element
            console.log("[handleVideoTimeUpdate] Ignoring update from stale video element");
            return;
        }
        
        const video = videoRef.current;
        const currentVideoTime = video.currentTime; // Time in seconds from video start
        const actualTimestamp = currentStartTime + (currentVideoTime * 1000); // Convert to milliseconds
        
        setCurrentPlaybackTime(actualTimestamp);
        
        // Update cursor position based on playback time
        const [year, month, day] = selectedDate.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        const playbackHours = (actualTimestamp - dayStart) / (60 * 60 * 1000);
        
        // Update cursor position if it's different
        if (cursorPositionRef.current !== playbackHours) {
            cursorPositionRef.current = playbackHours;
            setCursorPositionHours(playbackHours);
            
            // Redraw timeline to show updated cursor position
            requestAnimationFrame(() => {
                drawTimeline();
            });
        }
    };

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

        setLoadingVideo(true);
        try {
            const response = await authenticatedFetch(
                `${getApiBaseUrl()}/api/getVideo?channelNumber=${selectedChannel}&startTime=${currentEndTime}&endTime=${nextEndTime}`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.outputFile) {
                    const videoUrl = `${getApiBaseUrl()}/cctv/${data.outputFile}`;
                    console.log(`[ScrollingPlaybackTab] Continuing playback: ${videoUrl}`);
                    setPlayingUrl(videoUrl);
                    setCurrentStartTime(currentEndTime); // Update start time for continuation
                    setCurrentEndTime(nextEndTime);
                    setCurrentPlaybackTime(currentEndTime); // Initialize playback time for new segment
                    setLoadingVideo(false);
                    
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
                    setLoadingVideo(false);
                }
            } else {
                console.log("Failed to fetch continuation video");
                setLoadingVideo(false);
            }
        } catch (e) {
            console.error("Error fetching continuation video:", e);
            setLoadingVideo(false);
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
        
        // Center on cursor position if available, otherwise center on current view
        // Use ref to get the latest cursor position value
        const currentCursorPosition = cursorPositionRef.current;
        let targetCenter: number;
        if (currentCursorPosition !== null && currentCursorPosition >= 0 && currentCursorPosition <= 24) {
            // Center on the cursor (red line) position
            targetCenter = currentCursorPosition;
            console.log(`[handleZoomIn] Centering on cursor position: ${targetCenter} hours`);
        } else {
            // Center on current view center
            targetCenter = panOffsetHours + (zoomHours / 2);
            console.log(`[handleZoomIn] No cursor position, centering on view center: ${targetCenter} hours`);
        }
        
        // Calculate new pan offset to center on target
        // The pan offset should position the view so that targetCenter is in the middle
        const newPan = Math.max(0, Math.min(24 - newZoom, targetCenter - (newZoom / 2)));
        
        console.log(`[handleZoomIn] Zoom: ${zoomHours} -> ${newZoom}, Pan: ${panOffsetHours} -> ${newPan}, Target: ${targetCenter}`);
        
        setZoomHours(newZoom);
        setPanOffsetHours(newPan);
    };

    const handleZoomOut = () => {
        const newZoom = Math.min(24, zoomHours * 2); // Maximum 24 hours
        
        // Center on cursor position if available, otherwise center on current view
        const currentCursorPosition = cursorPositionRef.current;
        let targetCenter: number;
        if (currentCursorPosition !== null && currentCursorPosition >= 0 && currentCursorPosition <= 24) {
            targetCenter = currentCursorPosition;
        } else {
            targetCenter = panOffsetHours + (zoomHours / 2);
        }
        
        // Calculate new pan offset to center on target
        const newPan = Math.max(0, Math.min(24 - newZoom, targetCenter - (newZoom / 2)));
        
        setZoomHours(newZoom);
        setPanOffsetHours(newPan);
    };

    const handleResetZoom = () => {
        setZoomHours(24);
        setPanOffsetHours(0);
        // Don't clear cursor position on reset - keep it so user can zoom back in on it
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
        e.preventDefault(); // Prevent any default behavior
        e.stopPropagation(); // Stop event propagation
        
        // Clear any existing debounce timer
        if (clickDebounceTimerRef.current) {
            clearTimeout(clickDebounceTimerRef.current);
            clickDebounceTimerRef.current = null;
        }
        
        // Cancel any pending request
        if (abortControllerRef.current) {
            console.log("[handleTimelineClick] Cancelling previous request");
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        
        // Prevent multiple simultaneous clicks
        if (isProcessingClick.current) {
            console.log("[handleTimelineClick] Click already being processed, ignoring");
            return;
        }
        
        const canvas = canvasRef.current;
        if (!canvas) {
            console.warn("[handleTimelineClick] Canvas not available");
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width; // Use displayed width, not internal canvas width
        const horizontalPadding = 60;
        
        // Adjust for padding - map click position to drawable area
        const drawableWidth = width - (horizontalPadding * 2);
        const adjustedX = Math.max(0, Math.min(drawableWidth, x - horizontalPadding));
        const ratio = adjustedX / drawableWidth;

        // Calculate timestamp based on visible window
        const [year, month, day] = selectedDate.split('-').map(Number);
        const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
        const windowStart = dayStart + (panOffsetHours * 60 * 60 * 1000);
        const windowDuration = zoomHours * 60 * 60 * 1000;
        const clickedTimestamp = Math.floor(windowStart + (ratio * windowDuration));

        // Calculate cursor position in hours from start of day
        const clickedHours = (clickedTimestamp - dayStart) / (60 * 60 * 1000);
        console.log(`[handleTimelineClick] Click detected - Setting cursor position: ${clickedHours} hours (timestamp: ${clickedTimestamp})`);
        
        // IMMEDIATELY set flags to prevent onTimeUpdate from interfering
        // This must happen BEFORE updating cursor position to prevent race conditions
        isManualCursorUpdate.current = true;
        
        // Immediately stop current video to prevent onTimeUpdate from updating cursor
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
        
        // Immediately update cursor position (no debounce for visual feedback)
        setCursorPositionHours(clickedHours);
        cursorPositionRef.current = clickedHours;
        
        // Redraw timeline immediately to show cursor
        requestAnimationFrame(() => {
            drawTimeline();
        });

        // Debounce the actual API call to prevent rapid-fire requests
        // This allows cursor movement to be instant while throttling API calls
        clickDebounceTimerRef.current = setTimeout(async () => {
            // Double-check we're not already processing (in case of rapid clicks)
            if (isProcessingClick.current) {
                console.log("[handleTimelineClick] Already processing, skipping debounced call");
                return;
            }
            
            // Set processing flag
            isProcessingClick.current = true;
            
            // Show loading indicator
            setLoadingVideo(true);
            
            // Create new AbortController for this request
            const abortController = new AbortController();
            abortControllerRef.current = abortController;

            console.log(`[ScrollingPlaybackTab] Generating stream URL for channel ${selectedChannel} at ${clickedTimestamp}`);
            const endTime = clickedTimestamp + 60000; // 60 seconds play duration

            try {
                const response = await authenticatedFetch(
                    `${getApiBaseUrl()}/api/getVideo?channelNumber=${selectedChannel}&startTime=${clickedTimestamp}&endTime=${endTime}`,
                    "GET",
                    null,
                    {},
                    abortController.signal // Pass abort signal to cancel request
                );
                
                // Check if request was aborted
                if (abortController.signal.aborted) {
                    console.log("[handleTimelineClick] Request was aborted");
                    isProcessingClick.current = false;
                    isManualCursorUpdate.current = false;
                    setLoadingVideo(false);
                    return;
                }

                if (response.ok) {
                    const data = await response.json();
                    if (data.outputFile) {
                        // Start valid video playback
                        const videoUrl = `${getApiBaseUrl()}/cctv/${data.outputFile}`;
                        console.log(`[ScrollingPlaybackTab] Playing video: ${videoUrl}`);
                        setError(null); // Clear any previous errors
                        setPlayingUrl(videoUrl);
                        currentPlayingUrlRef.current = videoUrl; // Track the new URL
                        setCurrentStartTime(clickedTimestamp); // Store start time for playback tracking
                        setCurrentEndTime(endTime); // Track end time for auto-continuation
                        setCurrentPlaybackTime(clickedTimestamp); // Initialize playback time
                        setLoadingVideo(false); // Hide loading spinner
                        
                        // Allow timeupdate to take over cursor updates after video starts playing
                        // Use a longer delay to ensure the new video has fully loaded and started
                        setTimeout(() => {
                            // Double-check that we're still on the same video before clearing the flag
                            if (currentPlayingUrlRef.current === videoUrl) {
                                isManualCursorUpdate.current = false;
                            }
                            isProcessingClick.current = false;
                        }, 1000); // Longer delay to ensure video has fully started and old video is gone
                        
                        // Redraw timeline (which will include the cursor line)
                        requestAnimationFrame(() => {
                            drawTimeline();
                        });
                    } else {
                        console.error("No outputFile in response");
                        setError("Failed to start playback: No output file returned");
                        isProcessingClick.current = false;
                        isManualCursorUpdate.current = false;
                        setLoadingVideo(false);
                    }
                } else {
                    console.error("Failed to fetch video details");
                    setError("Failed to start playback");
                    isProcessingClick.current = false;
                    isManualCursorUpdate.current = false;
                    setLoadingVideo(false);
                }
            } catch (e: any) {
                // Check if error is due to abort
                if (e.name === 'AbortError' || abortController.signal.aborted) {
                    console.log("[handleTimelineClick] Request was aborted");
                    setLoadingVideo(false);
                    return; // Don't set error or clear flags if aborted
                }
                console.error("Error starting playback:", e);
                setError("Error starting playback");
                isProcessingClick.current = false;
                isManualCursorUpdate.current = false;
                setLoadingVideo(false);
            } finally {
                // Clear abort controller reference if this request completed
                if (abortControllerRef.current === abortController) {
                    abortControllerRef.current = null;
                }
            }
        }, 300); // 300ms debounce - cursor updates immediately, API call is delayed
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

                <FormControl sx={{ minWidth: 200 }}>
                    <InputLabel id="date-select-label">Date</InputLabel>
                    <Select
                        labelId="date-select-label"
                        label="Date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 400 } } }}
                    >
                        {/* Only show dates with recordings */}
                        {Array.from({ length: 90 }, (_, i) => {
                            const date = new Date();
                            date.setDate(date.getDate() - i);
                            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                            const hasRecording = datesWithRecordings.has(dateStr);
                            
                            // Only render dates with recordings
                            if (!hasRecording) return null;
                            
                            const isToday = i === 0;
                            const displayDate = isToday ? 'Today' : date.toLocaleDateString('en-US', { 
                                weekday: 'short', 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric' 
                            });
                            
                            return (
                                <MenuItem key={dateStr} value={dateStr}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                                        <Box
                                            sx={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: '50%',
                                                backgroundColor: 'error.main',
                                                flexShrink: 0
                                            }}
                                        />
                                        <ListItemText primary={displayDate} />
                                    </Box>
                                </MenuItem>
                            );
                        })}
                    </Select>
                </FormControl>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="subtitle1">Timeline (Click to Play)</Typography>
                        {currentPlaybackTime && (
                            <Typography 
                                variant="body2" 
                                sx={{ 
                                    color: 'primary.main', 
                                    fontWeight: 'bold',
                                    backgroundColor: 'rgba(25, 118, 210, 0.1)',
                                    padding: '2px 8px',
                                    borderRadius: '4px'
                                }}
                            >
                                Playing: {new Date(currentPlaybackTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </Typography>
                        )}
                    </Box>
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
            <Paper sx={{ p: 1, backgroundColor: '#122444', mb: 3, position: 'relative' }}>
                <Box
                    ref={timelineContainerRef}
                    sx={{ overflowX: 'auto', position: 'relative' }}
                >
                    <canvas
                    ref={canvasRef}
                    width={2400}
                    height={120}
                    style={{ 
                        width: zoomHours === 24 ? '100%' : 'auto',
                        minWidth: zoomHours === 24 
                            ? '100%' // Fit container when showing full day
                            : `${canvasWidth}px`, // Use calculated width when zoomed in
                        cursor: 'pointer', 
                        display: 'block' 
                    }}
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
                </Box>
            </Paper>

            {(playingUrl || loadingVideo) && (
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
                                currentPlayingUrlRef.current = null; // Clear tracked URL
                                setCurrentEndTime(null);
                                setCurrentStartTime(null);
                                setCurrentPlaybackTime(null);
                                setLoadingVideo(false);
                                isProcessingClick.current = false;
                                isManualCursorUpdate.current = false;
                                if (videoRef.current) {
                                    videoRef.current.pause();
                                }
                            }}
                        >
                            Stop
                        </Button>
                    </Box>
                    {loadingVideo ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 8, minHeight: 300 }}>
                            <CircularProgress size={60} sx={{ mb: 2 }} />
                            <Typography variant="body1" color="text.secondary">
                                Processing video...
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                                This may take a few moments
                            </Typography>
                        </Box>
                    ) : playingUrl && (
                        /* Stream returns video/mp4, so use video tag */
                        <video
                            ref={videoRef}
                            key={playingUrl}
                            src={playingUrl}
                            controls
                            autoPlay
                            onTimeUpdate={handleVideoTimeUpdate}
                            onEnded={handleVideoEnded}
                            style={{ width: '100%', height: 'auto' }}
                        />
                    )}
                </Box>
            )}
        </Box>
    );
};

export default ScrollingPlaybackTab;
