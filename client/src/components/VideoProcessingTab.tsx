import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Card,
  CardContent,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  IconButton,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteIcon from "@mui/icons-material/Delete";
import InfoIcon from "@mui/icons-material/Info";
import { getApiBaseUrl } from "../utils/apiConfig";
import { authenticatedFetch } from "../utils/api";

interface LogStep {
  name: string;
  timestamp: number;
  duration: number;
  metadata?: Record<string, unknown>;
}

interface PerformanceLog {
  requestId: string;
  endpoint: string;
  params: Record<string, unknown>;
  startTime: number;
  endTime: number;
  totalDuration: number;
  status: string;
  steps: LogStep[];
  result?: Record<string, unknown>;
  startTimeFormatted: string;
  endTimeFormatted: string;
}

interface Stats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageDuration: number;
  medianDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  stepAverages: Record<string, {
    average: number;
    count: number;
    median: number;
    min: number;
    max: number;
  }>;
}

const VideoProcessingTab: React.FC = () => {
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterEndpoint, setFilterEndpoint] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<PerformanceLog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = filterEndpoint === "all" ? "" : `&endpoint=${filterEndpoint}`;
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/api/logs?limit=100${endpoint}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (err: unknown) {
      console.error("Error fetching logs:", err);
      setError("Failed to load performance logs.");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const endpoint = filterEndpoint === "all" ? "" : `?endpoint=${filterEndpoint}`;
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/api/logs/stats${endpoint}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setStats(data.stats);
    } catch (err: unknown) {
      console.error("Error fetching stats:", err);
    }
  };

  const clearLogs = async () => {
    if (!confirm("Are you sure you want to clear all performance logs?")) {
      return;
    }

    try {
      const response = await authenticatedFetch(
        `${getApiBaseUrl()}/api/logs`,
        "DELETE"
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      setLogs([]);
      setStats(null);
      alert("Performance logs cleared successfully");
    } catch (err: unknown) {
      console.error("Error clearing logs:", err);
      alert("Failed to clear performance logs");
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [filterEndpoint]);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const handleLogClick = (log: PerformanceLog) => {
    setSelectedLog(log);
    setDialogOpen(true);
  };

  const getStatusColor = (status: string) => {
    return status === "success" ? "success" : "error";
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h6" color="text.primary">
          Video Processing Performance Logs
        </Typography>
        <Box sx={{ display: "flex", gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Filter by Endpoint</InputLabel>
            <Select
              value={filterEndpoint}
              label="Filter by Endpoint"
              onChange={(e) => setFilterEndpoint(e.target.value)}
            >
              <MenuItem value="all">All Endpoints</MenuItem>
              <MenuItem value="getVideo">getVideo</MenuItem>
              <MenuItem value="getLiveVideo">getLiveVideo</MenuItem>
              <MenuItem value="getPicture">getPicture</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => { fetchLogs(); fetchStats(); }}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={clearLogs}
          >
            Clear Logs
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <>
          {/* Statistics Cards */}
          {stats && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 2, mb: 3 }}>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Total Requests
                  </Typography>
                  <Typography variant="h4">{stats.totalRequests}</Typography>
                  <Typography variant="body2" color="success.main">
                    {stats.successfulRequests} successful
                  </Typography>
                  <Typography variant="body2" color="error.main">
                    {stats.failedRequests} failed
                  </Typography>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Average Duration
                  </Typography>
                  <Typography variant="h4">
                    {formatDuration(stats.averageDuration)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Median: {formatDuration(stats.medianDuration)}
                  </Typography>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    Min / Max
                  </Typography>
                  <Typography variant="h6">
                    {formatDuration(stats.minDuration)}
                  </Typography>
                  <Typography variant="h6">
                    {formatDuration(stats.maxDuration)}
                  </Typography>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <Typography color="text.secondary" gutterBottom>
                    95th Percentile
                  </Typography>
                  <Typography variant="h4">
                    {formatDuration(stats.p95Duration)}
                  </Typography>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* Step Averages */}
          {stats && stats.stepAverages && Object.keys(stats.stepAverages).length > 0 && (
            <Accordion sx={{ mb: 3 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="h6">Step Performance Breakdown</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Step Name</TableCell>
                        <TableCell align="right">Count</TableCell>
                        <TableCell align="right">Average</TableCell>
                        <TableCell align="right">Median</TableCell>
                        <TableCell align="right">Min / Max</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(stats.stepAverages)
                        .sort((a, b) => b[1].average - a[1].average)
                        .map(([stepName, stepStats]) => (
                          <TableRow key={stepName}>
                            <TableCell>{stepName}</TableCell>
                            <TableCell align="right">{stepStats.count}</TableCell>
                            <TableCell align="right">
                              {formatDuration(stepStats.average)}
                            </TableCell>
                            <TableCell align="right">
                              {formatDuration(stepStats.median)}
                            </TableCell>
                            <TableCell align="right">
                              {formatDuration(stepStats.min)} / {formatDuration(stepStats.max)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Logs Table */}
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Endpoint</TableCell>
                  <TableCell>Channel</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Steps</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      No logs available. Start using getVideo or getLiveVideo APIs to see performance data.
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.requestId} hover>
                      <TableCell>
                        {new Date(log.startTime).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Chip label={log.endpoint} size="small" />
                      </TableCell>
                      <TableCell>
                        {String(log.params.channelNumber || "N/A")}
                      </TableCell>
                      <TableCell>
                        {formatDuration(log.totalDuration)}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={log.status}
                          color={getStatusColor(log.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{log.steps.length}</TableCell>
                      <TableCell>
                        <Tooltip title="View details">
                          <IconButton
                            size="small"
                            onClick={() => handleLogClick(log)}
                          >
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Log Details Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Request Details
          {selectedLog && (
            <Typography variant="body2" color="text.secondary">
              {selectedLog.requestId}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {selectedLog && (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                <strong>Endpoint:</strong> {selectedLog.endpoint}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Status:</strong>{" "}
                <Chip
                  label={selectedLog.status}
                  color={getStatusColor(selectedLog.status)}
                  size="small"
                />
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Total Duration:</strong> {formatDuration(selectedLog.totalDuration)}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Request Start Time:</strong>{" "}
                {new Date(selectedLog.startTime).toLocaleString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                })}
              </Typography>
              <Typography variant="body2" gutterBottom sx={{ mb: 2 }}>
                <strong>Request End Time:</strong>{" "}
                {new Date(selectedLog.endTime).toLocaleString('en-US', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                })}
              </Typography>

              <Typography variant="subtitle1" gutterBottom>
                <strong>Video Time Range Requested:</strong>
              </Typography>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" gutterBottom>
                  <strong>Video Start Time:</strong>{" "}
                  {selectedLog.params.startTime
                    ? new Date(selectedLog.params.startTime as number).toLocaleString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                      })
                    : 'N/A'}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Video End Time:</strong>{" "}
                  {selectedLog.params.endTime
                    ? new Date(selectedLog.params.endTime as number).toLocaleString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                      })
                    : 'N/A'}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Duration Requested:</strong>{" "}
                  {selectedLog.params.duration
                    ? formatDuration(selectedLog.params.duration as number)
                    : 'N/A'}
                </Typography>
              </Box>

              <Typography variant="subtitle1" gutterBottom>
                <strong>All Parameters:</strong>
              </Typography>
              <Paper sx={{ p: 2, mb: 2, bgcolor: "background.default" }}>
                <pre style={{ margin: 0, fontSize: "0.875rem" }}>
                  {JSON.stringify(selectedLog.params, null, 2)}
                </pre>
              </Paper>

              <Typography variant="subtitle1" gutterBottom>
                <strong>Processing Steps:</strong>
              </Typography>
              <TableContainer component={Paper} sx={{ mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Step</TableCell>
                      <TableCell align="right">Duration</TableCell>
                      <TableCell>Metadata</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedLog.steps.map((step, index) => (
                      <TableRow key={index}>
                        <TableCell>{step.name}</TableCell>
                        <TableCell align="right">
                          {formatDuration(step.duration)}
                        </TableCell>
                        <TableCell>
                          {step.metadata && Object.keys(step.metadata).length > 0
                            ? JSON.stringify(step.metadata)
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {selectedLog.result && Object.keys(selectedLog.result).length > 0 && (
                <>
                  <Typography variant="subtitle1" gutterBottom>
                    <strong>Result:</strong>
                  </Typography>
                  <Paper sx={{ p: 2, bgcolor: "background.default" }}>
                    <pre style={{ margin: 0, fontSize: "0.875rem" }}>
                      {JSON.stringify(selectedLog.result, null, 2)}
                    </pre>
                  </Paper>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VideoProcessingTab;

