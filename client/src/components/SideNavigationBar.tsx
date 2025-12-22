/* eslint-disable @typescript-eslint/no-empty-object-type */
import React, { useState, useEffect } from "react";
import {
    Box,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Paper,
    Typography
} from "@mui/material";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";
import SettingsIcon from "@mui/icons-material/Settings";
import VideocamIcon from "@mui/icons-material/Videocam";
import { useNavigate, useLocation } from "react-router-dom";
import SystemStatsWidget from "./SystemStatsWidget";

const SideNavigationBar: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [activePath, setActivePath] = useState("live");

    // Sync the active tab with the current route
    useEffect(() => {
        const path = location.pathname.substring(1); // Remove leading slash
        if (path === "status" || path === "playback" || path === "settings" || path === "live") {
            setActivePath(path);
        }
    }, [location.pathname]);

    const handleNavigate = (path: string) => {
        setActivePath(path);
        navigate(`/${path}`);
    };

    const navItems = [
        { label: "Live", path: "live", icon: <VideocamIcon /> },
        { label: "Playback", path: "playback", icon: <PlayCircleOutlineIcon /> },
        { label: "Status", path: "status", icon: <WifiTetheringIcon /> },
        { label: "Settings", path: "settings", icon: <SettingsIcon /> },
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
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
                    DVR Server
                </Typography>
            </Box>
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
