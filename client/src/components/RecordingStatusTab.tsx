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
  Tabs,
  Tab,
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

interface OtherProcess {
  pid: number;
  command: string;
}

interface TerminationLog {
  timestamp: string;
  code: number | null;
  signal: string | null;
  uptime: string;
  reason: string;
}

interface RecordingStatusResponse {
  recordingStatus: RecordingStatus[];
  otherProcesses: OtherProcess[];
}

const RecordingStatusTab = () => {
  const [recordingData, setRecordingData] = useState<RecordingStatus[]>([]);
  const [otherProcesses, setOtherProcesses] = useState<OtherProcess[]>([]);
  const apiUrl = `${getApiBaseUrl()}/api/recording/status`;
  const [apiLoading, setApiLoading] = useState(false);

  // Modal State
  const [openModal, setOpenModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [terminationLogs, setTerminationLogs] = useState<TerminationLog[]>([]);
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
        const data: RecordingStatusResponse = await response.json();
        setApiLoading(false);
        // Handle both new and old format just in case
        if (Array.isArray(data)) {
          setRecordingData(data); // Legacy fallback
          setOtherProcesses([]);
        } else {
          setRecordingData(data.recordingStatus || []);
          setOtherProcesses(data.otherProcesses || []);
        }
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

  const fetchTerminationLogs = async (channel: string) => {
    try {
      const response = await authenticatedFetch(`${getApiBaseUrl()}/api/channels/logs/termination/${channel}`);
      if (response.ok) {
        const data = await response.json();
        setTerminationLogs(data);
      }
    } catch (e) {
      console.error("Error fetching termination logs", e);
    }
  };

  const handleRowClick = (channel: string) => {
    setSelectedChannel(channel);
    setOpenModal(true);
    setLogs([]); // Clear previous logs
    setTerminationLogs([]);
    setActiveTab(0); // Default to Live Logs

    fetchLogs(channel);
    startPolling(channel, 0);
  };

  const startPolling = (channel: string, tabIndex: number) => {
    if (logIntervalRef.current) clearInterval(logIntervalRef.current);

    if (tabIndex === 0) {
      fetchLogs(channel);
      logIntervalRef.current = setInterval(() => fetchLogs(channel), 2000);
    } else {
      fetchTerminationLogs(channel);
      logIntervalRef.current = setInterval(() => fetchTerminationLogs(channel), 5000);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    if (selectedChannel) {
      startPolling(selectedChannel, newValue);
    }
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
    if (openModal && activeTab === 0 && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, openModal, activeTab]);


  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" color="text.primary" gutterBottom>
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

      {/* Other FFmpeg Processes Section */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" color="text.primary" gutterBottom>
          Other FFmpeg Processes (Unassociated)
        </Typography>
        {otherProcesses.length > 0 ? (
          <TableContainer component={Paper}>
            <Table aria-label="other ffmpeg processes table">
              <TableHead>
                <TableRow>
                  <TableCell width="10%">PID</TableCell>
                  <TableCell width="90%">Command</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {otherProcesses.map((proc) => (
                  <TableRow key={proc.pid}>
                    <TableCell>{proc.pid}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {proc.command}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No unassociated ffmpeg processes found.
          </Typography>
        )}
      </Box>

      {/* Log Viewer Modal */}
      <Dialog
        open={openModal}
        onClose={handleCloseModal}
        fullWidth
        maxWidth="md"
        aria-labelledby="log-dialog-title"
      >
        <DialogTitle id="log-dialog-title">
          Channel Status - {selectedChannel}
        </DialogTitle>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="log tabs">
            <Tab label="Live Logs" />
            <Tab label="Termination Events" />
          </Tabs>
        </Box>
        <DialogContent dividers>
          {activeTab === 0 && (
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
          )}

          {activeTab === 1 && (
            <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {terminationLogs.length === 0 ? (
                <Typography sx={{ p: 2 }} color="text.secondary">No termination events recorded.</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>Code</TableCell>
                        <TableCell>Signal</TableCell>
                        <TableCell>Reason</TableCell>
                        <TableCell>Uptime Before Exit</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {terminationLogs.map((log, index) => (
                        <TableRow key={index}>
                          <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                          <TableCell>{log.code ?? 'N/A'}</TableCell>
                          <TableCell>{log.signal ?? 'N/A'}</TableCell>
                          <TableCell>{log.reason}</TableCell>
                          <TableCell>{log.uptime}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}
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
