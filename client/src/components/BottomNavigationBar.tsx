/* eslint-disable @typescript-eslint/no-empty-object-type */
import React, { useState, useEffect } from "react";
import { BottomNavigation, BottomNavigationAction, Paper } from "@mui/material";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";
import SettingsIcon from "@mui/icons-material/Settings";
import VideocamIcon from "@mui/icons-material/Videocam";
import { useNavigate, useLocation } from "react-router-dom";

interface BottomNavigationBarProps {
  value?: string;
  onChange?: (event: React.ChangeEvent<{}>, newValue: string) => void;
}

const BottomNavigationBar: React.FC<BottomNavigationBarProps> = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState("live");

  // Sync the active tab with the current route
  useEffect(() => {
    const path = location.pathname.substring(1); // Remove leading slash
    if (path === "status" || path === "playback" || path === "settings" || path === "live") {
      setValue(path);
    }
  }, [location.pathname]);

  const handleChange = (_event: React.ChangeEvent<{}>, newValue: string) => {
    setValue(newValue);
    navigate(`/${newValue}`);
  };

  return (
    <Paper
      sx={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        borderRadius: 0,
      }}
      elevation={3}
    >
      <BottomNavigation value={value} onChange={handleChange} showLabels>
        <BottomNavigationAction
          label="Live"
          value="live"
          icon={<VideocamIcon />}
        />
        <BottomNavigationAction
          label="Playback"
          value="playback"
          icon={<PlayCircleOutlineIcon />}
        />
        <BottomNavigationAction
          label="Status"
          value="status"
          icon={<WifiTetheringIcon />}
        />
        <BottomNavigationAction
          label="Settings"
          value="settings"
          icon={<SettingsIcon />}
        />
      </BottomNavigation>
    </Paper>
  );
};

export default BottomNavigationBar;
