import React, { useState } from "react";
import { Tabs, Tab, Typography, Box, Container } from "@mui/material";
import ScheduleSettingsTab from "../components/ScheduleSettingTab";
import ChannelSettingsTab from "../components/ChannelSettingTab";
import ChangePinTab from "../components/ChangePinTab";
import ApiKeyManagementTab from "../components/ApiKeyManagementTab";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `simple-tab-${index}`,
    "aria-controls": `simple-tabpanel-${index}`,
  };
}

const SettingsPage: React.FC = () => {
  const [value, setValue] = useState(0); // Initial tab index

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Container>
      <Typography variant="h4" sx={{ textAlign: "center" }} gutterBottom>
        Settings
      </Typography>
      <Box sx={{ width: "100%" }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs
            value={value}
            onChange={handleChange}
            aria-label="settings tabs"
            centered // Add this prop to center the tabs
          >
            <Tab label="Channel" {...a11yProps(0)} />
            <Tab label="Schedule" {...a11yProps(1)} />
            <Tab label="Security" {...a11yProps(2)} />
            <Tab label="API Key" {...a11yProps(3)} />
          </Tabs>
        </Box>
        <TabPanel value={value} index={0}>
          <ChannelSettingsTab />
        </TabPanel>
        <TabPanel value={value} index={1}>
          <ScheduleSettingsTab />
        </TabPanel>
        <TabPanel value={value} index={2}>
          <ChangePinTab />
        </TabPanel>
        <TabPanel value={value} index={3}>
          <ApiKeyManagementTab />
        </TabPanel>
      </Box>
    </Container>
  );
};

export default SettingsPage;
