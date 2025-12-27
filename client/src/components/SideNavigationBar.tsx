import React, { useState, useEffect } from "react";
import {
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Paper,
    Typography,
    Divider
} from "@mui/material";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";
import SettingsIcon from "@mui/icons-material/Settings";
import VideocamIcon from "@mui/icons-material/Videocam";
import IntegrationInstructionsIcon from "@mui/icons-material/IntegrationInstructions";
import { useNavigate, useLocation } from "react-router-dom";
import SystemStatsWidget from "./SystemStatsWidget";
import { authenticatedFetch } from "../utils/api";
import { getAuthData } from "../utils/auth";

const SideNavigationBar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [activePath, setActivePath] = useState("live");
    const [authAppId, setAuthAppId] = useState<string>("");
    const [username, setUsername] = useState<string>("");

    // Sync the active tab with the current route
    useEffect(() => {
        const path = location.pathname.substring(1); // Remove leading slash
        if (path === "status" || path === "playback" || path === "settings" || path === "live" || path === "pos-integration") {
            setActivePath(path);
        }
    }, [location.pathname]);

    // Fetch authAppId and username on mount
    useEffect(() => {
        const fetchAuthInfo = async () => {
            try {
                const response = await authenticatedFetch("/admin/auth-app-id-config");
                if (response.ok) {
                    const data = await response.json();
                    setAuthAppId(data.authAppId);
                }
            } catch (error) {
                console.error("Error fetching auth app ID:", error);
            }
        };

        const authData = getAuthData();
        console.log('[Sidebar] Auth data:', authData); // Debug log
        if (authData?.user) {
            // Try multiple possible username fields
            const possibleUsername = authData.user.userId ||
                authData.user.username ||
                authData.user.name ||
                authData.user.email;
            console.log('[Sidebar] Username extracted:', possibleUsername); // Debug log
            if (possibleUsername) {
                setUsername(String(possibleUsername));
            }
        }

        fetchAuthInfo();
    }, []);

    const handleNavigate = (path: string) => {
        setActivePath(path);
        navigate(`/${path}`);
    };

    const navItems = [
        { label: "Live", path: "live", icon: <VideocamIcon /> },
        { label: "Playback", path: "playback", icon: <PlayCircleOutlineIcon /> },
        { label: "Status", path: "status", icon: <WifiTetheringIcon /> },
        { label: "Settings", path: "settings", icon: <SettingsIcon /> },
        { label: "POS Integration", path: "pos-integration", icon: <IntegrationInstructionsIcon /> },
    ];

    return (
        <Paper
            elevation={3}
            sx={{
                width: 240,
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                borderRadius: 0,
                bgcolor: 'background.paper',
                borderRight: '1px solid rgba(255, 255, 255, 0.12)', // Subtle divider
                flexShrink: 0
            }}
        >
            <Box
                sx={{
                    p: 3,
                    bgcolor: 'background.paper',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    borderBottom: '4px solid #f44336',
                }}
            >
                <Box sx={{ textAlign: 'center', width: '100%' }}>
                    <Typography
                        variant="h5"
                        component="div"
                        sx={{
                            fontWeight: 'bold',
                            color: 'text.primary',
                            letterSpacing: '0.5px',
                            mb: 1.5
                        }}
                    >
                        DVR Server
                    </Typography>
                    {authAppId && (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 0.5,
                                mb: 0.5
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: 'rgba(255,255,255,0.95)',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    backgroundColor: 'rgba(255,255,255,0.15)',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    backdropFilter: 'blur(10px)',
                                }}
                            >
                                🔐 {authAppId}
                            </Typography>
                        </Box>
                    )}
                    {username && (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 0.5
                            }}
                        >
                            <Typography
                                variant="caption"
                                sx={{
                                    color: 'text.secondary',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                }}
                            >
                                👤 {username}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>
            <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)' }} />
            <List component="nav" sx={{ flex: 1 }}>
                {navItems.map((item) => (
                    <ListItem key={item.path} disablePadding>
                        <ListItemButton
                            selected={activePath === item.path}
                            onClick={() => handleNavigate(item.path)}
                            sx={{
                                '&.Mui-selected': {
                                    bgcolor: 'rgba(255, 255, 255, 0.08)',
                                    borderLeft: '4px solid',
                                    borderColor: 'primary.main',
                                    '&:hover': {
                                        bgcolor: 'rgba(255, 255, 255, 0.12)',
                                    }
                                },
                                py: 1.5
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 40, color: activePath === item.path ? 'primary.main' : 'inherit' }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText
                                primary={item.label}
                                primaryTypographyProps={{
                                    fontWeight: activePath === item.path ? 'bold' : 'regular'
                                }}
                            />
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>
            <SystemStatsWidget />
        </Paper>
    );
};

export default SideNavigationBar;
