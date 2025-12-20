import { useState, useEffect, useRef } from "react";
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
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

  // Modal State
  const [openModal, setOpenModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

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
      }
    };

    fetchRecordingStatus();
    const intervalId = setInterval(fetchRecordingStatus, 5000);
    return () => clearInterval(intervalId);
  }, [apiUrl]);

  const fetchLogs = async (channel: string) => {
    try {
      const response = await authenticatedFetch(`${getApiBaseUrl()}/api/channels/logs/${channel}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (e) {
      console.error("Error fetching logs", e);
    }
  };

  const handleRowClick = (channel: string) => {
    setSelectedChannel(channel);
    setOpenModal(true);
    setLogs([]); // Clear previous logs
    fetchLogs(channel);

    // Start polling logs
    if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    logIntervalRef.current = setInterval(() => fetchLogs(channel), 2000);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setSelectedChannel(null);
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  };

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (openModal && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, openModal]);


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
                <TableRow
                  key={status.channel}
                  hover
                  onClick={() => handleRowClick(status.channel)}
                  sx={{ cursor: 'pointer' }}
                >
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

      {/* Log Viewer Modal */}
      <Dialog
        open={openModal}
        onClose={handleCloseModal}
        fullWidth
        maxWidth="md"
        aria-labelledby="log-dialog-title"
      >
        <DialogTitle id="log-dialog-title">
          Live Capture Status - {selectedChannel}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{
            bgcolor: '#000',
            color: '#0f0',
            p: 2,
            borderRadius: 1,
            fontFamily: 'monospace',
            maxHeight: '60vh',
            overflowY: 'auto'
          }}>
            {logs.length === 0 ? (
              <Typography variant="body2" color="gray">No logs available...</Typography>
            ) : (
              logs.map((line, index) => (
                <div key={index}>{line}</div>
              ))
            )}
            <div ref={logsEndRef} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseModal} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
export default RecordingStatusTab;
