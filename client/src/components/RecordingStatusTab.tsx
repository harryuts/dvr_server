import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import VideocamIcon from "@mui/icons-material/Videocam";
import { getApiBaseUrl } from "../utils/apiConfig";
import { authenticatedFetch } from "../utils/api";

interface RecordingStatus {
  channel: string;
  pid: number;
  isRecording: boolean;
  startTime: string;
  uptime: string;
  respawnCount: number;
  currentFile: string;
}

const RecordingStatusTab = () => {
  const [recordingData, setRecordingData] = useState<RecordingStatus[]>([]);
  const apiUrl = `${getApiBaseUrl()}/api/recording/status`;
  const [apiLoading, setApiLoading] = useState(false);

  useEffect(() => {
    const fetchRecordingStatus = async () => {
      try {
        setApiLoading(true);
        const response = await authenticatedFetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: RecordingStatus[] = await response.json();
        setApiLoading(false);
        setRecordingData(data);
      } catch (error) {
        console.error("Error fetching recording status:", error);
        // Optionally display an error message to the user
      }
    };

    fetchRecordingStatus(); // Initial fetch

    const intervalId = setInterval(fetchRecordingStatus, 5000); // Fetch every 5 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [apiUrl]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Recording Status
      </Typography>
      {recordingData.length > 0 ? (
        <TableContainer component={Paper}>
          <Table aria-label="recording status table">
            <TableHead>
              <TableRow>
                <TableCell>Channel</TableCell>
                <TableCell align="center">Recording</TableCell>
                <TableCell align="left">Start Time</TableCell>
                <TableCell align="left">Uptime</TableCell>
                <TableCell align="center">Respawns</TableCell>
                <TableCell align="left">Current File</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recordingData.map((status) => (
                <TableRow key={status.channel}>
                  <TableCell component="th" scope="row">
                    <VideocamIcon sx={{ mr: 1 }} /> {status.channel}
                  </TableCell>
                  <TableCell align="center">
                    {status.isRecording ? (
                      <FiberManualRecordIcon color="error" />
                    ) : (
                      <StopIcon color="success" />
                    )}
                  </TableCell>
                  <TableCell align="left">
                    {new Date(status.startTime).toLocaleString()}
                  </TableCell>
                  <TableCell align="left">
                    <AccessTimeIcon sx={{ mr: 1 }} /> {status.uptime}
                  </TableCell>
                  <TableCell align="center">
                    {status.respawnCount > 0 && (
                      <RestartAltIcon color="warning" sx={{ mr: 0.5 }} />
                    )}
                    {status.respawnCount}
                  </TableCell>
                  <TableCell align="left">{status.currentFile}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : apiLoading ? (
        <Typography>Loading recording status...</Typography>
      ) : (
        <Typography>Not Recording</Typography>
      )}
    </Box>
  );
};

export default RecordingStatusTab;
