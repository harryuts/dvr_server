/* eslint-disable @typescript-eslint/no-empty-object-type */
import React, { useState } from "react";
import { BottomNavigation, BottomNavigationAction, Paper } from "@mui/material";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import WifiTetheringIcon from "@mui/icons-material/WifiTethering";
import SettingsIcon from "@mui/icons-material/Settings";
import { useNavigate } from "react-router-dom"; // Assuming you're using React Router

interface BottomNavigationBarProps {
  value?: string;
  onChange?: (event: React.ChangeEvent<{}>, newValue: string) => void;
}

const BottomNavigationBar: React.FC<BottomNavigationBarProps> = () => {
  const [value, setValue] = useState("playback"); // Default selected value
  const navigate = useNavigate();

  const handleChange = (_event: React.ChangeEvent<{}>, newValue: string) => {
    setValue(newValue);
    navigate(`/${newValue}`); // Navigate to the corresponding route
  };

  return (
    <Paper
      sx={{ position: "fixed", bottom: 0, left: 0, right: 0 }}
      elevation={3}
    >
      <BottomNavigation value={value} onChange={handleChange} showLabels>
        <BottomNavigationAction
          label="Status"
          value="status"
          icon={<WifiTetheringIcon />}
        />
        <BottomNavigationAction
          label="Playback"
          value="playback"
          icon={<PlayCircleOutlineIcon />}
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
