import React, { useEffect, useState } from "react";
import {
    Grid,
    Container,
    Typography,
    Box,
    Card,
    CardContent,
    Modal,
    Backdrop,
    IconButton,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { getApiBaseUrl } from "../utils/apiConfig";
import { authenticatedFetch } from "../utils/api";
import { getAuthData } from "../utils/auth";
import LiveFeedImage from "../components/LiveFeedImage";

interface ChannelInfo {
    channel: string;
    name: string;
    earliest: {
        timestamp: number;
        formatted: string;
    };
    latest: {
        timestamp: number;
        formatted: string;
    };
}

// LiveChannelCard removed as it is no longer used in the single-view layout

const LiveModalContent: React.FC<{
    channelInfo: ChannelInfo;
    frameRate: number;
}> = ({ channelInfo, frameRate }) => {
    const [refreshTimestamp, setRefreshTimestamp] = useState(Date.now());
    const [isMounted, setIsMounted] = useState(true);

    useEffect(() => {
        setIsMounted(true);
        return () => { setIsMounted(false); };
    }, []);

    const handleLoadComplete = () => {
        if (!isMounted) return;
        const delay = Math.floor(1000 / frameRate);
        setTimeout(() => {
            if (isMounted) {
                setRefreshTimestamp(Date.now());
            }
        }, delay);
    };

    return (
        <LiveFeedImage
            src={`${getApiBaseUrl()}/api/getJpegLive?channelNumber=${channelInfo.channel}&t=${refreshTimestamp}${getAuthData()?.token ? `&token=${getAuthData()?.token}` : ""}`}
            alt={`Live feed - ${channelInfo.name}`}
            onLoadComplete={handleLoadComplete}
            sx={{
                width: "100%",
                height: "100%", // Fixed to ensure spinner is visible even when no image
                mx: "auto", // Center the image horizontally
                display: "block",
                maxHeight: "calc(95vh - 100px)",
                objectFit: "contain",
                backgroundColor: "#000",
                borderRadius: 1,
            }}
        />
    );
};

const LivePage: React.FC = () => {
    const [channelData, setChannelData] = useState<ChannelInfo[]>([]);
    const [frameRate, setFrameRate] = useState<number>(1);
    const [selectedChannelId, setSelectedChannelId] = useState<string>("");

    const handleChannelChange = (event: any) => {
        setSelectedChannelId(event.target.value as string);
    };

    const selectedChannel = channelData.find(c => c.channel === selectedChannelId);

    useEffect(() => {
        if (channelData.length > 0 && !selectedChannelId) {
            setSelectedChannelId(channelData[0].channel);
        }
    }, [channelData, selectedChannelId]);

    // Handlers removed as modal is no longer used

    useEffect(() => {
        const apiUrl = `${getApiBaseUrl()}/api/channels/timeframe`;
        const fetchChannelInfo = async () => {
            try {
                const response = await authenticatedFetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data: ChannelInfo[] = await response.json();
                setChannelData(data);
            } catch (error) {
                console.error("Error fetching channel info:", error);
            }
        };

        const fetchFrameRate = async () => {
            try {
                const response = await authenticatedFetch(`${getApiBaseUrl()}/admin/live-capture-config`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setFrameRate(data.liveCaptureFrameRate || 1);
            } catch (error) {
                console.error("Error fetching frame rate config:", error);
                // Use default of 1 FPS if fetch fails
                setFrameRate(1);
            }
        };

        fetchChannelInfo();
        fetchFrameRate();
    }, []);

    // Cleaned up duplicate logic

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Typography variant="h4" color="text.primary" sx={{ fontWeight: 600 }}>
                    Live View
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <FormControl size="small" sx={{ minWidth: 250 }}>
                        <InputLabel id="channel-select-label">Select Channel</InputLabel>
                        <Select
                            labelId="channel-select-label"
                            id="channel-select"
                            value={selectedChannelId}
                            label="Select Channel"
                            onChange={handleChannelChange}
                        >
                            {channelData.map((channel) => (
                                <MenuItem key={channel.channel} value={channel.channel}>
                                    {channel.name} (Channel {channel.channel})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>Refresh Rate:</Box>
                        {frameRate} FPS
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ width: "90%", mx: "auto" }}>
                {selectedChannel ? (
                    <Card
                        sx={{
                            borderRadius: 2,
                            overflow: "hidden",
                            boxShadow: 3,
                        }}
                    >
                        <Box sx={{ height: '600px', bgcolor: 'black' }}>
                            <LiveModalContent
                                key={selectedChannel.channel}
                                channelInfo={selectedChannel}
                                frameRate={frameRate}
                            />
                        </Box>

                    </Card>
                ) : (
                    channelData.length === 0 ? (
                        <Box
                            sx={{
                                textAlign: "center",
                                py: 8,
                                px: 2,
                                bgcolor: "background.paper",
                                borderRadius: 2
                            }}
                        >
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                                No active channels found
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Please check your camera connections and configuration
                            </Typography>
                        </Box>
                    ) : (
                        <Box sx={{ textAlign: "center", py: 4 }}>
                            <Typography>Select a channel to view live feed</Typography>
                        </Box>
                    )
                )}
            </Box>
        </Container>
    );
};

export default LivePage;
