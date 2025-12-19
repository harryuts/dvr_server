import React, { useRef, useEffect } from "react";
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
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isOpen]);

  // Auto-play when new video is loaded - start from seekOffset or beginning
  useEffect(() => {
    if (videoData.outputFile && videoRef.current) {
      console.log(`[VideoPlayModal] New video loaded: ${videoData.outputFile}, seeking to: ${seekOffset}s`);
      videoRef.current.currentTime = seekOffset;
      videoRef.current.load();
      videoRef.current.play().catch((err) => {
        console.warn("[VideoPlayModal] Autoplay blocked or failed:", err);
      });
    }
  }, [videoData.outputFile, seekOffset]);

  const handleVideoEnded = () => {
    console.log(`[VideoPlayModal] Video ended event triggered. Prop onVideoEnded exists: ${!!onVideoEnded}`);
    if (onVideoEnded) {
      onVideoEnded();
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
        {videoData.outputFile && (
          <div
            className="video-container"
            style={{ width: "100%", height: "auto" }}
          >
            <video
              key={videoData.outputFile}
              ref={videoRef}
              controls
              onEnded={handleVideoEnded}
              style={{ width: "100%", height: "auto", objectFit: "contain" }}
            >
              <source
                src={`${getApiBaseUrl()}/cctv/${videoData.outputFile}`}
                type="video/mp4"
              />
              Your browser does not support the video tag.
            </video>
          </div>
        )}
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
