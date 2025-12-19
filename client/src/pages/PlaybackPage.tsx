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
  Card,
  CardMedia,
  CardContent,
  Modal,
  Backdrop,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const PlaybackPage: React.FC = () => {
  const [tabIndex, setTabIndex] = useState(0);
  const [refreshKey, setRefreshKey] = useState(Date.now());

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (tabIndex === 1) {
      interval = setInterval(() => {
        setRefreshKey(Date.now());
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [tabIndex]);

  const now = new Date();
  const sixMinutesFromNow = new Date(now.getTime() - 6 * 60 * 1000);
  const oneMinuteFromNow = new Date(now.getTime() - 1 * 60 * 1000);

  const [selectedDate, setSelectedDate] = useState<Date | null>(now);
  const [startTime, setStartTime] = useState<Date | null>(sixMinutesFromNow);
  const [endTime, setEndTime] = useState<Date | null>(oneMinuteFromNow);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [videoData, setVideoData] = useState<VideoData>({});
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [channelData, setChannelData] = useState<ChannelInfo[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>("");
  const [liveModalChannel, setLiveModalChannel] = useState<ChannelInfo | null>(null);

  const handleOpenLiveModal = (channelInfo: ChannelInfo) => {
    setLiveModalChannel(channelInfo);
  };

  const handleCloseLiveModal = () => {
    setLiveModalChannel(null);
  };

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
        CCTV Viewer
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs value={tabIndex} onChange={handleTabChange} aria-label="cctv viewer tabs">
          <Tab label="Playback" />
          <Tab label="Live" />
        </Tabs>
      </Box>

      <CustomTabPanel value={tabIndex} index={0}>
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
      </CustomTabPanel>

      <CustomTabPanel value={tabIndex} index={1}>
        <Grid container spacing={2}>
          {channelData.map((channelInfo) => (
            /* @ts-expect-error MUI Grid props are valid in this version */
            <Grid item xs={12} sm={6} md={4} key={channelInfo.channel}>
              <Card
                sx={{ height: "100%", display: "flex", flexDirection: "column", cursor: "pointer" }}
                onClick={() => handleOpenLiveModal(channelInfo)}
              >
                <CardMedia
                  component="img"
                  height="180"
                  image={`${getApiBaseUrl()}/api/getJpegLive?channelNumber=${channelInfo.channel}&t=${refreshKey}${getAuthData()?.token ? `&token=${getAuthData()?.token}` : ""}`}
                  alt={`Live feed - ${channelInfo.name}`}
                  sx={{ objectFit: "cover", backgroundColor: "#000" }}
                />
                <CardContent sx={{ flexGrow: 1, p: 1.5 }}>
                  <Typography variant="subtitle1" component="div" align="center">
                    {channelInfo.name}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
          {channelData.length === 0 && (
            /* @ts-expect-error MUI Grid props are valid in this version */
            <Grid item xs={12}>
              <Typography align="center" color="textSecondary">
                No active channels found.
              </Typography>
            </Grid>
          )}
        </Grid>
      </CustomTabPanel>

      <VideoPlayModal
        isOpen={isVideoOpen}
        onClose={handleCloseVideoModal}
        channelName={(channelData.find((e) => e.channel === selectedChannel))?.name ?? ""}
        videoData={videoData}
        loading={loading}
        apiError={apiError}
      />

      {/* Live View Modal */}
      <Modal
        open={!!liveModalChannel}
        onClose={handleCloseLiveModal}
        closeAfterTransition
        slots={{ backdrop: Backdrop }}
        slotProps={{
          backdrop: {
            timeout: 500,
          },
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "100%",
            maxWidth: "100vw",
            maxHeight: "100vh",
            bgcolor: "background.paper",
            boxShadow: 24,
            p: 2,
            outline: "none",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="h6">
              {liveModalChannel?.name ?? "Live View"}
            </Typography>
            <IconButton onClick={handleCloseLiveModal} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          {liveModalChannel && (
            <Box
              component="img"
              src={`${getApiBaseUrl()}/api/getJpegLive?channelNumber=${liveModalChannel.channel}&t=${refreshKey}${getAuthData()?.token ? `&token=${getAuthData()?.token}` : ""}`}
              alt={`Live feed - ${liveModalChannel.name}`}
              sx={{
                width: "100%",
                height: "auto",
                maxHeight: "calc(100vh - 80px)",
                objectFit: "contain",
                backgroundColor: "#000",
              }}
            />
          )}
        </Box>
      </Modal>
    </Container>
  );
};

export default PlaybackPage;
