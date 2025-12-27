import React, { useState } from "react";
import { Tabs, Tab, Box, Container, Typography } from "@mui/material";
import ApiDocumentationTab from "../components/ApiDocumentationTab";

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
      id={`pos-tabpanel-${index}`}
      aria-labelledby={`pos-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `pos-tab-${index}`,
    "aria-controls": `pos-tabpanel-${index}`,
  };
}

const POSIntegrationPage: React.FC = () => {
  const [value, setValue] = useState(0);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <Container maxWidth={false}>
      <Typography variant="h4" color="text.primary" sx={{ textAlign: "center" }} gutterBottom>
        POS Integration
      </Typography>
      <Box sx={{ width: "100%" }}>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={value} onChange={handleChange} centered aria-label="pos integration tabs">
            <Tab label="API Documentation" {...a11yProps(0)} />
          </Tabs>
        </Box>
        <TabPanel value={value} index={0}>
          <ApiDocumentationTab />
        </TabPanel>
      </Box>
    </Container>
  );
};

export default POSIntegrationPage;

