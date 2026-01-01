import React, { useEffect, useState, useRef } from "react";
import {
  Button,
  Grid,
  Container,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Tabs,
  Tab,
  Box,
  ListItemText,
} from "@mui/material";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import "video.js/dist/video-js.css";
import { getApiBaseUrl } from "../utils/apiConfig";
import VideoPlayModal from "../components/VideoPlayModal";
import { authenticatedFetch } from "../utils/api";
import { getAuthData } from "../utils/auth";
import ScrollingPlaybackTab from "../components/ScrollingPlaybackTab";

interface VideoData {
  outputFile?: string;
  streamUrl?: string;
  error?: string;
  from?: string;
  to?: string;
  fromEpoch?: number;
  toEpoch?: number;
}


interface ChannelInfo {
  channel: string;
  name: string;
  earliest: {
    timestamp: number;
    formatted: string;
  };
  latest: {
    timestamp: number;
    formatted: string;
  };
}

const PlaybackPage: React.FC = () => {
  const now = new Date();
  const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);

  const [selectedDate, setSelectedDate] = useState<string>(now.toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState<Date | null>(thirtySecondsAgo);
  const [endTime, setEndTime] = useState<Date | null>(now);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [videoData, setVideoData] = useState<VideoData>({});
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [channelData, setChannelData] = useState<ChannelInfo[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [seekOffset, setSeekOffset] = useState<number>(0);
  const [currentTab, setCurrentTab] = useState(0); // 0 = Scrolling, 1 = Legacy, 2 = Streaming
  const [requestStartTime, setRequestStartTime] = useState<number | null>(null);
  const [datesWithRecordings, setDatesWithRecordings] = useState<Set<string>>(new Set());

  const handleChannelChange = (event: SelectChangeEvent) => {
    setSelectedChannel(event.target.value);
  };

  const handleDateChange = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  const handleStartTimeChange = (time: Date | null) => {
    setStartTime(time);
    // Automatically set end time to 5 minutes after start time
    if (time) {
      const newEndTime = new Date(time.getTime() + 5 * 60 * 1000); // Add 5 minutes
      setEndTime(newEndTime);
    }
  };

  const handleEndTimeChange = (time: Date | null) => {
    if (time && startTime) {
      // Enforce maximum 1 hour duration
      const maxEndTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour from start
      if (time > maxEndTime) {
        setEndTime(maxEndTime);
        alert("End time cannot be more than 1 hour after start time. Adjusted to maximum allowed.");
      } else {
        setEndTime(time);
      }
    } else {
      setEndTime(time);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  useEffect(() => {
    const apiUrl = `${getApiBaseUrl()}/api/channels/timeframe`;
    const fetchChannelInfo = async () => {
      try {
        const response = await authenticatedFetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: ChannelInfo[] = await response.json();
        setChannelData(data);
        if (data.length > 0 && !selectedChannel) {
          setSelectedChannel(data[0].channel);
        }
      } catch (error) {
        console.error("Error fetching channel info:", error);
      }
    };

    fetchChannelInfo();
  }, [selectedChannel]);

  // Fetch dates with recordings when channel changes
  useEffect(() => {
    if (!selectedChannel) return;

    const fetchDatesWithRecordings = async () => {
      try {
        const response = await authenticatedFetch(
          `${getApiBaseUrl()}/api/dates-with-recordings?channel=${selectedChannel}`
        );
        if (response.ok) {
          const data = await response.json();
          setDatesWithRecordings(new Set(data.dates || []));
          
          // If current selected date doesn't have recordings, select the first available date
          if (data.dates && data.dates.length > 0) {
            const currentDateStr = selectedDate;
            if (!data.dates.includes(currentDateStr)) {
              setSelectedDate(data.dates[0]);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching dates with recordings:", err);
      }
    };

    fetchDatesWithRecordings();
  }, [selectedChannel]);

  const handleSubmit = async () => {
    if (selectedDate && startTime && endTime && selectedChannel) {
      // Parse date string (YYYY-MM-DD) and combine with time
      const [year, month, day] = selectedDate.split('-').map(Number);
      const startDateTime = new Date(year, month - 1, day, startTime.getHours(), startTime.getMinutes(), startTime.getSeconds());
      const endDateTime = new Date(year, month - 1, day, endTime.getHours(), endTime.getMinutes(), endTime.getSeconds());

      const startTimeEpoch = startDateTime.getTime();
      const endTimeEpoch = endDateTime.getTime();

      setLoading(true);
      setApiError(null);
      setVideoData({});
      setIsVideoOpen(true);

      const reqStart = Date.now();
      setRequestStartTime(reqStart);

      // Determine API endpoint based on tab
      const endpoint = currentTab === 2 ? "/api/getLiveVideo" : "/api/getVideo"; // 2 is Streaming, 1 is Legacy
      // currentTab === 0 is Scrolling (uses different component)
      // currentTab === 1 is Legacy/Standard, uses getVideo
      // currentTab === 2 is New/Streaming, uses getLiveVideo

      const apiUrl = `${getApiBaseUrl()}${endpoint}?channelNumber=${selectedChannel}&startTime=${startTimeEpoch}&endTime=${endTimeEpoch}`;

      try {
        const response = await authenticatedFetch(apiUrl);
        if (!response.ok) {
          const errorText = await response.text();
          setApiError(errorText || "Failed to fetch video data.");
          setVideoData({ error: "Failed to load video." });
          return;
        }
        const data = await response.json();
        setVideoData(data);
      } catch (error: unknown) {
        console.error("Error fetching video:", error);
        setApiError("Failed to fetch video data.");
        setVideoData({ error: "Failed to load video." });
      } finally {
        setLoading(false);
      }
    } else {
      alert("Please select a date, start time, end time, and channel.");
    }
  };

  // Handler for when video playback ends - fetches more video from the server
  const handleVideoEnded = async () => {
    if (!selectedChannel) return;

    const now = Date.now();
    const lastEndTime = videoData.toEpoch || (videoData.to ? new Date(videoData.to).getTime() : endTime?.getTime() || now);

    console.log(`[PlaybackPage] handleVideoEnded. now: ${now}, lastEndTime: ${lastEndTime}, diff: ${now - lastEndTime}ms`);

    console.log(`[PlaybackPage] Continuation triggered. Fetching from ${new Date(lastEndTime).toLocaleTimeString()} to now`);

    setLoading(true);
    setApiError(null);

    // Continuation always uses the same method as original request?
    // Or default to something? Let's use currentTab.
    const endpoint = currentTab === 2 ? "/api/getLiveVideo" : "/api/getVideo";
    const apiUrl = `${getApiBaseUrl()}${endpoint}?channelNumber=${selectedChannel}&startTime=${lastEndTime}&endTime=${now}`;

    try {
      const response = await authenticatedFetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text();
        setApiError(errorText || "Failed to fetch video continuation.");
        return;
      }
      const data = await response.json();
      // Calculate seek offset: position in new video where we should resume
      // The new video starts at `data.fromEpoch`, we want to start at `lastEndTime`
      if (data.fromEpoch) {
        const newVideoStartTime = data.fromEpoch;
        const offsetMs = lastEndTime - newVideoStartTime;
        const offsetSeconds = Math.max(0, offsetMs / 1000);
        console.log(`Seeking to ${offsetSeconds}s in continuation video (New video start: ${new Date(newVideoStartTime).toLocaleTimeString()})`);
        setSeekOffset(offsetSeconds);
      } else {
        setSeekOffset(0);
      }
      setVideoData(data);
    } catch (error: unknown) {
      console.error("Error fetching continuation video:", error);
      setApiError("Failed to fetch video continuation.");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseVideoModal = () => {
    setIsVideoOpen(false);
    setVideoData({});
    setApiError(null);
    setRequestStartTime(null);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <Container maxWidth={false}>
      <Typography variant="h4" color="text.primary" gutterBottom>
        Video Playback
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={currentTab} onChange={handleTabChange} aria-label="playback mode tabs">
          <Tab label="Scrolling (Timeline)" />
          <Tab label="Legacy Download (Wait)" />
          <Tab label="Direct Streaming (Instant)" />
        </Tabs>
      </Box>

      {currentTab === 0 ? (
        <ScrollingPlaybackTab channelData={channelData} />
      ) : (
        <Container maxWidth="sm">
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              {/* @ts-ignore */}
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel id="date-select-label">Select Date</InputLabel>
                  <Select
                    labelId="date-select-label"
                    label="Select Date"
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { maxHeight: 400 } } }}
                  >
                    {/* Only show dates with recordings */}
                    {Array.from({ length: 90 }, (_, i) => {
                      const date = new Date();
                      date.setDate(date.getDate() - i);
                      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                      const hasRecording = datesWithRecordings.has(dateStr);
                      
                      // Only render dates with recordings
                      if (!hasRecording) return null;
                      
                      const isToday = i === 0;
                      const displayDate = isToday ? 'Today' : date.toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      });
                      
                      return (
                        <MenuItem key={dateStr} value={dateStr}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: 'error.main',
                                flexShrink: 0
                              }}
                            />
                            <ListItemText primary={displayDate} />
                          </Box>
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </Grid>
              {/* @ts-ignore */}
              <Grid item xs={6}>
                <TimePicker
                  label="Start Time"
                  value={startTime}
                  onChange={handleStartTimeChange}
                  slotProps={{ textField: { fullWidth: true } }}
                  ampm={false}
                  views={["hours", "minutes"]}
                  timeSteps={{ minutes: 1 }}
                />
              </Grid>
              {/* @ts-ignore */}
              <Grid item xs={6}>
                <TimePicker
                  label="End Time"
                  value={endTime}
                  onChange={handleEndTimeChange}
                  slotProps={{ textField: { fullWidth: true } }}
                  ampm={false}
                  views={["hours", "minutes"]}
                  timeSteps={{ minutes: 1 }}
                />
              </Grid>
              {/* @ts-ignore */}
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel id="channel-select-label">Channel</InputLabel>
                  <Select
                    labelId="channel-select-label"
                    id="channel-select"
                    value={selectedChannel}
                    label="Channel"
                    onChange={handleChannelChange}
                  >
                    {channelData.map((channelInfo) => (
                      <MenuItem key={channelInfo.channel} value={channelInfo.channel}>
                        {`${channelInfo.name} (${channelInfo.channel})`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              {/* @ts-ignore */}
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSubmit}
                  fullWidth
                  disabled={loading}
                >
                  Submit
                </Button>
              </Grid>
            </Grid>
          </LocalizationProvider>
        </Container>
      )}

      <VideoPlayModal
        isOpen={isVideoOpen}
        onClose={handleCloseVideoModal}
        channelName={(channelData.find((e) => e.channel === selectedChannel))?.name ?? ""}
        videoData={videoData}
        loading={loading}
        apiError={apiError}
        onVideoEnded={handleVideoEnded}
        requestStartTime={requestStartTime}
      />
    </Container>
  );
};

export default PlaybackPage;
