import React, {useRef } from "react";
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
  videoData: { outputFile?: string; error?: string };
  loading: boolean;
  apiError: string | null;
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
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isOpen]);

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
              ref={videoRef}
              controls
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