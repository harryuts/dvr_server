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

const LivePage: React.FC = () => {
    const [refreshKey, setRefreshKey] = useState(Date.now());
    const [channelData, setChannelData] = useState<ChannelInfo[]>([]);
    const [liveModalChannel, setLiveModalChannel] = useState<ChannelInfo | null>(null);
    const [frameRate, setFrameRate] = useState<number>(1);

    const handleOpenLiveModal = (channelInfo: ChannelInfo) => {
        setLiveModalChannel(channelInfo);
    };

    const handleCloseLiveModal = () => {
        setLiveModalChannel(null);
    };

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

    useEffect(() => {
        // Calculate refresh interval based on frame rate
        // 1 FPS = 1000ms, 2 FPS = 500ms, 3 FPS = ~333ms
        const refreshInterval = Math.floor(1000 / frameRate);

        const interval = setInterval(() => {
            setRefreshKey(Date.now());
        }, refreshInterval);

        return () => {
            clearInterval(interval);
        };
    }, [frameRate]);

    return (
        <Container maxWidth="lg" sx={{ py: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Typography variant="h4" color="text.primary" sx={{ fontWeight: 600 }}>
                    Live View
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>Refresh Rate:</Box>
                    {frameRate} FPS ({Math.floor(1000 / frameRate)}ms)
                </Typography>
            </Box>

            <Grid container spacing={3} sx={{ justifyContent: "center" }}>
                {channelData.map((channelInfo) => (
                    /* @ts-expect-error MUI Grid props are valid in this version */
                    <Grid item xs={12} sm={6} md={4} lg={3} key={channelInfo.channel}>
                        <Card
                            sx={{
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                cursor: "pointer",
                                transition: "all 0.3s ease-in-out",
                                borderRadius: 2,
                                overflow: "hidden",
                                "&:hover": {
                                    transform: "translateY(-4px)",
                                    boxShadow: 6,
                                },
                            }}
                            onClick={() => handleOpenLiveModal(channelInfo)}
                        >
                            <LiveFeedImage
                                src={`${getApiBaseUrl()}/api/getJpegLive?channelNumber=${channelInfo.channel}&t=${refreshKey}${getAuthData()?.token ? `&token=${getAuthData()?.token}` : ""}`}
                                alt={`Live feed - ${channelInfo.name}`}
                                sx={{
                                    height: "300px",
                                    backgroundColor: "#000",
                                    borderBottom: "2px solid",
                                    borderColor: "primary.main",
                                    objectFit: "cover"
                                }}
                            />
                            <CardContent sx={{ flexGrow: 1, p: 2, textAlign: "center" }}>
                                <Typography variant="h6" component="div" sx={{ fontWeight: 500 }}>
                                    {channelInfo.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                                    Channel {channelInfo.channel}
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
                {channelData.length === 0 && (
                    /* @ts-expect-error MUI Grid props are valid in this version */
                    <Grid item xs={12}>
                        <Box
                            sx={{
                                textAlign: "center",
                                py: 8,
                                px: 2,
                            }}
                        >
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                                No active channels found
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Please check your camera connections and configuration
                            </Typography>
                        </Box>
                    </Grid>
                )}
            </Grid>

            {/* Live View Modal */}
            <Modal
                open={!!liveModalChannel}
                onClose={handleCloseLiveModal}
                closeAfterTransition
                slots={{ backdrop: Backdrop }}
                slotProps={{
                    backdrop: {
                        timeout: 500,
                        sx: { backgroundColor: "rgba(0, 0, 0, 0.85)" },
                    },
                }}
            >
                <Box
                    sx={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: "95%",
                        maxWidth: "1400px",
                        maxHeight: "95vh",
                        bgcolor: "background.paper",
                        boxShadow: 24,
                        borderRadius: 2,
                        p: 3,
                        outline: "none",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                        <Typography variant="h5" sx={{ fontWeight: 600 }}>
                            {liveModalChannel?.name ?? "Live View"}
                        </Typography>
                        <IconButton
                            onClick={handleCloseLiveModal}
                            size="large"
                            sx={{
                                "&:hover": {
                                    backgroundColor: "action.hover",
                                },
                            }}
                        >
                            <CloseIcon />
                        </IconButton>
                    </Box>
                    {liveModalChannel && (
                        <LiveFeedImage
                            src={`${getApiBaseUrl()}/api/getJpegLive?channelNumber=${liveModalChannel.channel}&t=${refreshKey}${getAuthData()?.token ? `&token=${getAuthData()?.token}` : ""}`}
                            alt={`Live feed - ${liveModalChannel.name}`}
                            sx={{
                                width: "100%",
                                height: "auto",
                                maxHeight: "calc(95vh - 100px)",
                                objectFit: "contain",
                                backgroundColor: "#000",
                                borderRadius: 1,
                            }}
                        />
                    )}
                </Box>
            </Modal>
        </Container>
    );
};

export default LivePage;
