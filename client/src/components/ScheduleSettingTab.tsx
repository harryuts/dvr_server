import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Grid,
  CircularProgress,
  Alert,
} from "@mui/material";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { getApiBaseUrl } from "../utils/apiConfig";
import { authenticatedFetch } from "../utils/api";

const ScheduleSettingsTab: React.FC = () => {
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [stopTime, setStopTime] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [timeUntilStop, setTimeUntilStop] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchedule = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await authenticatedFetch(
          `${getApiBaseUrl()}/api/schedule`
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setStartTime(
          new Date(0, 0, 0, data.startTime.hour, data.startTime.minute)
        );
        setStopTime(
          new Date(0, 0, 0, data.stopTime.hour, data.stopTime.minute)
        );
      } catch (err: unknown) {
        console.error("Error fetching schedule:", err);
        setError("Failed to load recording schedule.");
      } finally {
        setLoading(false);
      }
    };

    fetchSchedule();
  }, []);

  useEffect(() => {
    const checkRecordingStatus = () => {
      if (startTime && stopTime) {
        const now = new Date();
        const start = new Date(now);
        start.setHours(startTime.getHours());
        start.setMinutes(startTime.getMinutes());
        start.setSeconds(0);
        start.setMilliseconds(0);

        const stop = new Date(now);
        stop.setHours(stopTime.getHours());
        stop.setMinutes(stopTime.getMinutes());
        stop.setSeconds(0);
        stop.setMilliseconds(0);

        let isCurrentlyRecording = false;
        let timeRemaining: number | null = null;

        if (start < stop) {
          isCurrentlyRecording = now >= start && now < stop;
          if (isCurrentlyRecording) {
            timeRemaining = stop.getTime() - now.getTime();
          }
        } else if (start > stop) {
          // Handle cases where the recording spans across midnight
          isCurrentlyRecording = now >= start || now < stop;
          if (isCurrentlyRecording) {
            if (now >= start) {
              timeRemaining =
                new Date(now.getFullYear(), now.getMonth(), now.getDate(), stop.getHours(), stop.getMinutes(), 0, 0).getTime() -
                now.getTime();
            } else {
              timeRemaining =
                new Date(now.getFullYear(), now.getMonth(), now.getDate(), stop.getHours(), stop.getMinutes(), 0, 0).getTime() +
                (24 * 60 * 60 * 1000) -
                now.getTime();
            }
          }
        }

        setIsRecording(isCurrentlyRecording);
        if (timeRemaining !== null && timeRemaining >= 0) {
          const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
          const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
          setTimeUntilStop(`${hours} hours and ${minutes} minutes`);
        } else {
          setTimeUntilStop(null);
        }
      }
    };

    checkRecordingStatus();
    const intervalId = setInterval(checkRecordingStatus, 60000); // Check every minute

    return () => clearInterval(intervalId);
  }, [startTime, stopTime]);

  const handleStartTimeChange = (time: Date | null) => {
    setStartTime(time);
  };

  const handleStopTimeChange = (time: Date | null) => {
    setStopTime(time);
  };

  const handleSubmit = async () => {
    if (startTime && stopTime) {
      setLoading(true);
      setError(null);
      setSuccessMessage(null);

      const startTimeToSend = {
        hour: startTime.getHours(),
        minute: startTime.getMinutes(),
      };
      const stopTimeToSend = {
        hour: stopTime.getHours(),
        minute: stopTime.getMinutes(),
      };

      try {
        const response = await authenticatedFetch(
          `${getApiBaseUrl()}/api/schedule`,
          "POST",
          {
            startTime: startTimeToSend,
            stopTime: stopTimeToSend,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || `HTTP error! status: ${response.status}`
          );
        }

        setSuccessMessage("Recording schedule updated successfully!");
      } catch (err: unknown) {
        console.error("Error updating schedule:", err);
        setError("Failed to update recording schedule.");
      } finally {
        setLoading(false);
      }
    } else {
      setError("Please select both start and stop times.");
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Recording Schedule
      </Typography>
      {loading ? (
        <CircularProgress />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : successMessage ? (
        <Alert severity="success">{successMessage}</Alert>
      ) : (
        <>
          <Box mb={2}>
            <Typography variant="subtitle1">
              Current Recording Status:{" "}
              <Typography
                component="span"
                fontWeight="bold"
                color={isRecording ? "success.main" : "error.main"}
              >
                {isRecording ? "Recording" : "Not Recording"}
              </Typography>
            </Typography>
            {isRecording && timeUntilStop && (
              <Typography variant="subtitle2">
                Time until recording stops:{" "}
                <Typography component="span" fontWeight="bold">
                  {timeUntilStop}
                </Typography>
              </Typography>
            )}
          </Box>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Grid container spacing={2} alignItems="center">
              <Grid sx = {{sm: 6}}>
                <TimePicker
                  label="Start Time"
                  value={startTime}
                  onChange={handleStartTimeChange}
                  slotProps={{ textField: { fullWidth: true } }}
                  ampm={false}
                  views={["hours", "minutes"]}
                />
              </Grid>
              <Grid sx = {{sm: 6}}>
                <TimePicker
                  label="Stop Time"
                  value={stopTime}
                  onChange={handleStopTimeChange}
                  slotProps={{ textField: { fullWidth: true } }}
                  ampm={false}
                  views={["hours", "minutes"]}
                />
              </Grid>
              <Grid sx = {{sm: 6}}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  Update Schedule
                </Button>
              </Grid>
            </Grid>
          </LocalizationProvider>
        </>
      )}
    </Box>
  );
};

export default ScheduleSettingsTab;