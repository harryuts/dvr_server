import React, { useState, useEffect, useRef } from "react";
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
  Snackbar,
  Alert,
} from "@mui/material";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import VideocamIcon from "@mui/icons-material/Videocam";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { getApiBaseUrl } from "../utils/apiConfig";
import { authenticatedFetch } from "../utils/api";

interface RecordingStatus {
  channel: string;
  pid: number | null;
  isRecording: boolean;
  startTime: string | null;
  uptime: string;
  respawnCount: number;
  currentFile: string;
  type?: string; // Channel type (e.g., 'dahua', 'standard')
}

interface OtherProcess {
  pid: number;
  command: string;
  context: string;
  startTime: string;
  uptime: string;
}

interface TerminationLog {
  timestamp: string;
  pid: number | null;
  code: number | null;
  signal: string | null;
  uptime: string;
  reason: string;
  lastStderr: string[];
  restartAction: string;
  restartDelayMs: number | null;
  manualStop: boolean;
  wasInRecordingWindow: boolean;
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
  const [selectedChannelIsRecording, setSelectedChannelIsRecording] = useState(false);
  const [selectedChannelType, setSelectedChannelType] = useState<string>('standard');
  const [activeTab, setActiveTab] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [terminationLogs, setTerminationLogs] = useState<TerminationLog[]>([]);
  const logIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // New state for Unassociated Process Logs
  const [selectedProcessPid, setSelectedProcessPid] = useState<number | null>(null);
  const [processLogs, setProcessLogs] = useState<string[]>([]);
  const processLogsEndRef = useRef<HTMLDivElement>(null);

  // Control State
  const [controlLoading, setControlLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info';
  }>({ open: false, message: '', severity: 'info' });

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

  const fetchProcessLogs = async (pid: number) => {
    try {
      const response = await authenticatedFetch(`${getApiBaseUrl()}/api/processes/logs/${pid}`);
      if (response.ok) {
        const data = await response.json();
        setProcessLogs(data);
      }
    } catch (e) {
      console.error(`Error fetching logs for process ${pid}`, e);
    }
  };

  const handleRowClick = (channel: string) => {
    setSelectedChannel(channel);
    setSelectedProcessPid(null); // Clear process selection
    setOpenModal(true);
    setLogs([]); // Clear previous logs
    setTerminationLogs([]);
    setActiveTab(0); // Default to Live Logs

    // Set the recording status and type for the selected channel
    const channelStatus = recordingData.find(r => r.channel === channel);
    setSelectedChannelIsRecording(channelStatus?.isRecording ?? false);
    setSelectedChannelType(channelStatus?.type || 'standard');

    fetchLogs(channel);
    startPolling(channel, 0);
  };

  const handleProcessRowClick = (pid: number) => {
    setSelectedProcessPid(pid);
    setSelectedChannel(null); // Clear channel selection
    setOpenModal(true);
    setProcessLogs([]);

    // Start polling for this process
    if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    fetchProcessLogs(pid);
    logIntervalRef.current = setInterval(() => fetchProcessLogs(pid), 2000);
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
    setSelectedProcessPid(null);
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  };

  const handleStartRecording = async () => {
    if (!selectedChannel) return;

    setControlLoading(true);
    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/api/channels/start/${selectedChannel}`,
        "POST"
      );
      const data = await response.json();

      if (response.ok && data.success) {
        setSnackbar({
          open: true,
          message: data.message || 'Recording started successfully',
          severity: 'success'
        });
        setSelectedChannelIsRecording(true);
      } else {
        setSnackbar({
          open: true,
          message: data.message || 'Failed to start recording',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      setSnackbar({
        open: true,
        message: 'Error starting recording',
        severity: 'error'
      });
    } finally {
      setControlLoading(false);
    }
  };

  const handleStopRecording = async () => {
    if (!selectedChannel) return;

    setControlLoading(true);
    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/api/channels/stop/${selectedChannel}`,
        "POST"
      );
      const data = await response.json();

      if (response.ok && data.success) {
        setSnackbar({
          open: true,
          message: data.message || 'Recording stopped successfully',
          severity: 'success'
        });
        setSelectedChannelIsRecording(false);
      } else {
        setSnackbar({
          open: true,
          message: data.message || 'Failed to stop recording',
          severity: 'error'
        });
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      setSnackbar({
        open: true,
        message: 'Error stopping recording',
        severity: 'error'
      });
    } finally {
      setControlLoading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
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
                      <Box
                        sx={{
                          display: 'inline-flex',
                          '@keyframes pulse': {
                            '0%': { transform: 'scale(1)', opacity: 1 },
                            '50%': { transform: 'scale(1.3)', opacity: 0.7 },
                            '100%': { transform: 'scale(1)', opacity: 1 },
                          },
                          animation: 'pulse 1.5s ease-in-out infinite',
                        }}
                      >
                        <FiberManualRecordIcon color="error" />
                      </Box>
                    ) : (
                      <StopIcon color="success" />
                    )}
                  </TableCell>
                  <TableCell align="left">
                    {status.startTime ? new Date(status.startTime).toLocaleString() : '-'}
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
                  <TableCell width="8%">PID</TableCell>
                  <TableCell width="12%">Context</TableCell>
                  <TableCell width="18%">Start Time</TableCell>
                  <TableCell width="12%">Uptime</TableCell>
                  <TableCell width="50%">Command</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {otherProcesses.map((proc) => (
                  <TableRow
                    key={proc.pid}
                    hover
                    onClick={() => handleProcessRowClick(proc.pid)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{proc.pid}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{
                        bgcolor: 'action.hover',
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                        display: 'inline-block',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        {proc.context || 'Unknown'}
                      </Typography>
                    </TableCell>
                    <TableCell>{proc.startTime ? new Date(proc.startTime).toLocaleString() : '-'}</TableCell>
                    <TableCell>{proc.uptime || '-'}</TableCell>
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
          {selectedChannel ? `Channel Status - ${selectedChannel}` : `Process Logs - PID ${selectedProcessPid}`}
        </DialogTitle>

        {selectedChannel && (
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={activeTab} onChange={handleTabChange} aria-label="log tabs">
              <Tab label="Live Logs" />
              <Tab label="Termination Events" />
            </Tabs>
          </Box>
        )}

        <DialogContent dividers>
          {/* Channel Live Logs */}
          {selectedChannel && activeTab === 0 && (
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

          {/* Process Logs (Read Only) */}
          {selectedProcessPid && (
            <Box sx={{
              bgcolor: '#000',
              color: '#0f0', // Maybe different color for process logs? sticking to green for now
              p: 2,
              borderRadius: 1,
              fontFamily: 'monospace',
              maxHeight: '60vh',
              overflowY: 'auto'
            }}>
              {processLogs.length === 0 ? (
                <Typography variant="body2" color="gray">No logs available...</Typography>
              ) : (
                processLogs.map((line, index) => (
                  <div key={index}>{line}</div>
                ))
              )}
              <div ref={processLogsEndRef} />
            </Box>
          )}

          {selectedChannel && activeTab === 1 && (
            <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {terminationLogs.length === 0 ? (
                <Typography sx={{ p: 2 }} color="text.secondary">No termination events recorded.</Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Time</TableCell>
                        <TableCell>PID</TableCell>
                        <TableCell>Code</TableCell>
                        <TableCell>Signal</TableCell>
                        <TableCell>Reason</TableCell>
                        <TableCell>Uptime</TableCell>
                        <TableCell>Restart Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {terminationLogs.map((log, index) => (
                        <React.Fragment key={index}>
                          <TableRow>
                            <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                            <TableCell>{log.pid ?? 'N/A'}</TableCell>
                            <TableCell>{log.code ?? 'N/A'}</TableCell>
                            <TableCell>{log.signal ?? 'N/A'}</TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{
                                  color: log.reason.includes('Graceful') ? 'success.main' :
                                    log.reason.includes('Crash') || log.reason.includes('SIGKILL') || log.reason.includes('SIGSEGV') ? 'error.main' :
                                      log.reason.includes('Error') ? 'warning.main' : 'text.primary'
                                }}
                              >
                                {log.reason}
                              </Typography>
                            </TableCell>
                            <TableCell>{log.uptime}</TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{
                                  color: log.restartAction?.includes('restart') ? 'info.main' : 'text.secondary',
                                  fontSize: '0.75rem'
                                }}
                              >
                                {log.restartAction || 'N/A'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                          {log.lastStderr && log.lastStderr.length > 0 && (
                            <TableRow>
                              <TableCell colSpan={7} sx={{ py: 0.5 }}>
                                <Box
                                  sx={{
                                    bgcolor: 'grey.900',
                                    color: 'error.light',
                                    p: 1,
                                    borderRadius: 1,
                                    fontFamily: 'monospace',
                                    fontSize: '0.7rem',
                                    maxHeight: '80px',
                                    overflowY: 'auto',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all'
                                  }}
                                >
                                  <Typography variant="caption" sx={{ color: 'grey.500', display: 'block', mb: 0.5 }}>
                                    Last stderr output:
                                  </Typography>
                                  {log.lastStderr.slice(-5).join('\n')}
                                </Box>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {selectedChannel && selectedChannelType !== 'dahua' && (
            selectedChannelIsRecording ? (
              <Button
                onClick={handleStopRecording}
                color="error"
                variant="contained"
                startIcon={<StopIcon />}
                disabled={controlLoading}
              >
                {controlLoading ? 'Stopping...' : 'Stop Recording'}
              </Button>
            ) : (
              <Button
                onClick={handleStartRecording}
                color="success"
                variant="contained"
                startIcon={<PlayArrowIcon />}
                disabled={controlLoading}
              >
                {controlLoading ? 'Starting...' : 'Start Recording'}
              </Button>
            )
          )}
          <Button onClick={handleCloseModal} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for user feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box >
  );
};
export default RecordingStatusTab;
