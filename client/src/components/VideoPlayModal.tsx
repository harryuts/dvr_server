import React, { useRef, useEffect } from "react";
import { getAuthData } from "../utils/auth";
import {
  Box,
  Modal,
  Backdrop,
  Typography,
  CircularProgress,
  Button,
} from "@mui/material";
import "video.js/dist/video-js.css";
import { getApiBaseUrl } from "../utils/apiConfig";

interface VideoPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelName: string;
  videoData: {
    outputFile?: string;
    streamUrl?: string;
    error?: string;
    from?: string;
    to?: string;
    fromEpoch?: number;
    toEpoch?: number;
  };
  loading: boolean;
  apiError: string | null;
  onVideoEnded?: () => void;
  seekOffset?: number;
  requestStartTime?: number | null;
}


const modalStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "90%",
  maxWidth: 800,
  bgcolor: "background.paper",
  border: "2px solid #000",
  boxShadow: 24,
  p: 4,
};

const VideoPlayModal: React.FC<VideoPlayModalProps> = ({
  isOpen,
  onClose,
  channelName,
  videoData,
  loading,
  apiError,
  onVideoEnded,
  seekOffset = 0,
  requestStartTime,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [latency, setLatency] = React.useState<number | null>(null);

  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isOpen]);

  // Reset latency when new video loads
  useEffect(() => {
    setLatency(null);
  }, [videoData.outputFile, videoData.streamUrl]);


  // Auto-play when new video is loaded - start from seekOffset or beginning
  useEffect(() => {
    if ((videoData.outputFile || videoData.streamUrl) && videoRef.current) {
      console.log(`[VideoPlayModal] New video loaded: ${videoData.outputFile || videoData.streamUrl}, seeking to: ${seekOffset}s`);
      videoRef.current.currentTime = seekOffset;
      videoRef.current.load();
      videoRef.current.play().catch((err) => {
        console.warn("[VideoPlayModal] Autoplay blocked or failed:", err);
      });
    }
  }, [videoData.outputFile, videoData.streamUrl, seekOffset]);

  const handleVideoEnded = () => {
    console.log(`[VideoPlayModal] Video ended event triggered. Prop onVideoEnded exists: ${!!onVideoEnded}`);
    if (onVideoEnded) {
      onVideoEnded();
    }
  };

  const handlePlaying = () => {
    if (requestStartTime && latency === null) {
      const diff = (Date.now() - requestStartTime) / 1000;
      setLatency(diff);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      aria-labelledby="video-modal-title"
      aria-describedby="video-modal-description"
      closeAfterTransition
      slots={{ backdrop: Backdrop }}
      slotProps={{
        backdrop: {
          timeout: 500,
        },
      }}
    >
      <Box sx={modalStyle}>
        <Typography
          id="video-modal-title"
          variant="h6"
          component="h2"
          gutterBottom
        >
          {`CCTV Video - ${channelName}`}
          {videoData.from && videoData.to && (
            <span style={{ fontSize: "0.8em", marginLeft: "10px", color: "gray" }}>
              - {videoData.from} to {videoData.to}
            </span>
          )}
        </Typography>
        {latency !== null && (
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Time to start playback: {latency.toFixed(2)}s
          </Typography>
        )}
        {loading && (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            minHeight={200}
          >
            <CircularProgress />
          </Box>
        )}
        {apiError && (
          <Typography color="error" mb={2}>
            {apiError}
          </Typography>
        )}
        {videoData.outputFile || videoData.streamUrl ? (
          <div
            className="video-container"
            style={{ width: "100%", height: "auto" }}
          >
            <video
              key={videoData.outputFile || videoData.streamUrl}
              ref={videoRef}
              controls
              onEnded={handleVideoEnded}
              onPlaying={handlePlaying}
              style={{ width: "100%", height: "auto", objectFit: "contain" }}
            >
              <source
                src={
                  videoData.streamUrl
                    ? `${getApiBaseUrl()}${videoData.streamUrl}&token=${getAuthData()?.token}`
                    : `${getApiBaseUrl()}/cctv/${videoData.outputFile}`
                }
                type="video/mp4"
              />
              Your browser does not support the video tag.
            </video>
          </div>
        ) : null}
        {videoData.error && !apiError && (
          <Typography color="error" mb={2}>
            {videoData.error}
          </Typography>
        )}
        <Button onClick={onClose} variant="contained" sx={{ mt: 2 }}>
          Close
        </Button>
      </Box>
    </Modal>
  );
};

export default VideoPlayModal;
