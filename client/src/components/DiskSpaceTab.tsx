import React, { useState, useEffect } from "react";
import { Box, Typography, CircularProgress, Grid } from "@mui/material";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import { getApiBaseUrl } from "../utils/apiConfig";
import { authenticatedFetch } from "../utils/api";

const DiskSpaceTab: React.FC = () => {
  const [diskUsage, setDiskUsage] = useState<number | null>(null);
  const apiUrl = `${getApiBaseUrl()}/api/disk/usage`;
  useEffect(() => {
    const fetchDiskUsage = async () => {
      try {
        const response = await authenticatedFetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: number = await response.json();
        setDiskUsage(data);
      } catch (error) {
        console.error("Error fetching disk usage:", error);
        setDiskUsage(null); // Indicate an error
        // Optionally display an error message to the user
      }
    };

    fetchDiskUsage(); // Initial fetch

    const intervalId = setInterval(fetchDiskUsage, 5000); // Fetch every 5 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [apiUrl]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Disk Space Usage
      </Typography>
      <Grid container justifyContent="center" alignItems="center" spacing={2}>
        <Grid>
          <Box
            sx={{ position: "relative", width: 200, height: 200, mx: "auto" }}
          >
            {diskUsage !== null ? (
              <CircularProgressbar
                value={diskUsage} // Percentage
                text={`${diskUsage.toFixed(1)}%`}
                styles={buildStyles({
                  textColor: "#3f51b5",
                  pathColor: "#3f51b5",
                  trailColor: "#d3d3d3",
                })}
              />
            ) : (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  width: "100%",
                  height: "100%",
                }}
              >
                {diskUsage === null ? (
                  <Typography color="error">
                    Error loading disk usage
                  </Typography>
                ) : (
                  <CircularProgress />
                )}
              </Box>
            )}
            <Box
              sx={{
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                position: "absolute",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            ></Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default DiskSpaceTab;
