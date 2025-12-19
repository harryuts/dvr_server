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
  Box,
} from "@mui/material";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import "video.js/dist/video-js.css";
import { getApiBaseUrl } from "../utils/apiConfig";
import VideoPlayModal from "../components/VideoPlayModal";
import { authenticatedFetch } from "../utils/api";
import { getAuthData } from "../utils/auth";

interface VideoData {
  outputFile?: string;
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

  const [selectedDate, setSelectedDate] = useState<Date | null>(now);
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

  const handleChannelChange = (event: SelectChangeEvent) => {
    setSelectedChannel(event.target.value);
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
  };

  const handleStartTimeChange = (time: Date | null) => {
    setStartTime(time);
  };

  const handleEndTimeChange = (time: Date | null) => {
    setEndTime(time);
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

  const handleSubmit = async () => {
    if (selectedDate && startTime && endTime && selectedChannel) {
      const startDateTime = new Date(selectedDate);
      startDateTime.setHours(startTime.getHours(), startTime.getMinutes(), startTime.getSeconds());
      const endDateTime = new Date(selectedDate);
      endDateTime.setHours(endTime.getHours(), endTime.getMinutes(), endTime.getSeconds());

      const startTimeEpoch = startDateTime.getTime();
      const endTimeEpoch = endDateTime.getTime();

      setLoading(true);
      setApiError(null);
      setVideoData({});
      setIsVideoOpen(true);

      const apiUrl = `${getApiBaseUrl()}/api/getVideo?channelNumber=${selectedChannel}&startTime=${startTimeEpoch}&endTime=${endTimeEpoch}`;

      try {
        const response = await authenticatedFetch(apiUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
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

    const apiUrl = `${getApiBaseUrl()}/api/getVideo?channelNumber=${selectedChannel}&startTime=${lastEndTime}&endTime=${now}`;

    try {
      const response = await authenticatedFetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <Container maxWidth="md">
      <Typography variant="h4" gutterBottom>
        Video Playback
      </Typography>

      <Container maxWidth="sm">
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {/* @ts-expect-error MUI Grid props are valid in this version */}
            <Grid item xs={12}>
              <DatePicker
                label="Select Date"
                value={selectedDate}
                onChange={handleDateChange}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            {/* @ts-expect-error MUI Grid props are valid in this version */}
            <Grid item xs={6}>
              <TimePicker
                label="Start Time"
                value={startTime}
                onChange={handleStartTimeChange}
                slotProps={{ textField: { fullWidth: true } }}
                ampm={false}
                views={["hours", "minutes"]}
              />
            </Grid>
            {/* @ts-expect-error MUI Grid props are valid in this version */}
            <Grid item xs={6}>
              <TimePicker
                label="End Time"
                value={endTime}
                onChange={handleEndTimeChange}
                slotProps={{ textField: { fullWidth: true } }}
                ampm={false}
                views={["hours", "minutes"]}
              />
            </Grid>
            {/* @ts-expect-error MUI Grid props are valid in this version */}
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
            {/* @ts-expect-error MUI Grid props are valid in this version */}
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

      <VideoPlayModal
        isOpen={isVideoOpen}
        onClose={handleCloseVideoModal}
        channelName={(channelData.find((e) => e.channel === selectedChannel))?.name ?? ""}
        videoData={videoData}
        loading={loading}
        apiError={apiError}
        onVideoEnded={handleVideoEnded}
      />
    </Container>
  );
};

export default PlaybackPage;
