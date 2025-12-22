import React, { useState } from "react";
import { Tabs, Tab, Box, Container, Typography } from "@mui/material";
import RecordingStatusTab from "../components/RecordingStatusTab";
import ChannelInfoTab from "../components/ChannelInfoTab";
import DiskSpaceTab from "../components/DiskSpaceTab";

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
      {value === index && (
        <Box
          sx={{
            pt: 3,
            display: "flex",
            justifyContent: "center",
            width: "100%",
          }}
        >
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `simple-tab-${index}`,
    "aria-controls": `simple-tabpanel-${index}`,
  };
}

const StatusPage: React.FC = () => {
  const [value, setValue] = useState(0); // Initial tab index

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Container>
      <Typography variant="h4" color="text.primary" sx={{ textAlign: "center" }} gutterBottom>
        NVR Status
      </Typography>
      <Box sx={{ width: "100%" }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={value} onChange={handleChange} centered aria-label="status tabs">
            <Tab label="Recording Status" {...a11yProps(0)} />
            <Tab label="Channel Info" {...a11yProps(1)} />
            <Tab label="Disk Space" {...a11yProps(2)} />
          </Tabs>
        </Box>
        <TabPanel value={value} index={0}>
          <RecordingStatusTab />
        </TabPanel>
        <TabPanel value={value} index={1}>
          <ChannelInfoTab />
        </TabPanel>
        <TabPanel value={value} index={2}>
          <DiskSpaceTab />
        </TabPanel>
      </Box>
    </Container>
  );
};

export default StatusPage;
