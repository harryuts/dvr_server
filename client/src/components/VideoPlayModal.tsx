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
  const lastVideoUrlRef = useRef<string | null>(null);
  const hasUserInteractedRef = useRef<boolean>(false);
  const initialSeekAppliedRef = useRef<boolean>(false);
  const isSeekingRef = useRef<boolean>(false);
  const seekTargetTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      hasUserInteractedRef.current = false;
    }
  }, [isOpen]);

  // Reset latency when new video loads
  useEffect(() => {
    setLatency(null);
  }, [videoData.outputFile, videoData.streamUrl]);

  // Auto-play when new video is loaded - start from seekOffset or beginning
  // Only auto-seek when video URL changes, not on user interactions
  useEffect(() => {
    const currentVideoUrl = videoData.outputFile || videoData.streamUrl;
    if (currentVideoUrl && videoRef.current) {
      const videoUrlChanged = lastVideoUrlRef.current !== currentVideoUrl;
      
      if (videoUrlChanged) {
        // New video loaded - reset flags
        hasUserInteractedRef.current = false;
        initialSeekAppliedRef.current = false;
        lastVideoUrlRef.current = currentVideoUrl;
        
        console.log(`[VideoPlayModal] New video loaded: ${currentVideoUrl}, will seek to: ${seekOffset}s`);
        
        // Wait for video metadata to load before seeking
        const handleLoadedMetadata = () => {
          if (videoRef.current && !hasUserInteractedRef.current && !initialSeekAppliedRef.current) {
            if (seekOffset > 0) {
              videoRef.current.currentTime = seekOffset;
              initialSeekAppliedRef.current = true;
            }
            videoRef.current.play().catch((err) => {
              console.warn("[VideoPlayModal] Autoplay blocked or failed:", err);
            });
          }
          videoRef.current?.removeEventListener('loadedmetadata', handleLoadedMetadata);
        };
        
        // Only call load() if video URL actually changed - this allows normal seeking
        videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);
        videoRef.current.load();
      }
      // Don't interfere if video URL hasn't changed - let user seek normally
    }
  }, [videoData.outputFile, videoData.streamUrl]);

  // Track user interactions with video controls (seeking, clicking timeline, etc.)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleSeeking = (e: Event) => {
      // User is actively seeking - mark this and store the target time
      isSeekingRef.current = true;
      hasUserInteractedRef.current = true;
      const target = (e.target as HTMLVideoElement).currentTime;
      seekTargetTimeRef.current = target;
      console.log(`[VideoPlayModal] User seeking to: ${target}s`);
    };

    const handleSeeked = (e: Event) => {
      // Seek completed - ensure the video stays at the seeked position
      isSeekingRef.current = false;
      hasUserInteractedRef.current = true;
      const finalTime = (e.target as HTMLVideoElement).currentTime;
      seekTargetTimeRef.current = finalTime;
      console.log(`[VideoPlayModal] Seek completed at: ${finalTime}s`);
      
      // Ensure the video stays at the seeked position
      if (video.currentTime !== finalTime) {
        console.log(`[VideoPlayModal] Correcting currentTime from ${video.currentTime} to ${finalTime}`);
        video.currentTime = finalTime;
      }
    };

    const handleUserInteraction = () => {
      hasUserInteractedRef.current = true;
    };

    // Listen for seeking events (when user drags timeline)
    video.addEventListener('seeking', handleSeeking);
    // Listen for seeked events (when seek completes)
    video.addEventListener('seeked', handleSeeked);
    // Listen for clicks
    video.addEventListener('click', handleUserInteraction);

    return () => {
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('click', handleUserInteraction);
    };
  }, [videoData.outputFile, videoData.streamUrl]);

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
            style={{ width: "100%", height: "auto", pointerEvents: "auto" }}
          >
            <video
              key={videoData.outputFile || videoData.streamUrl}
              ref={videoRef}
              controls
              controlsList="nodownload" // Allow all controls except download
              onEnded={handleVideoEnded}
              onPlaying={handlePlaying}
              onPlay={(e) => {
                // When play starts, ensure we're at the seeked position if user was seeking
                const video = e.currentTarget;
                if (seekTargetTimeRef.current !== null && !isSeekingRef.current) {
                  const timeDiff = Math.abs(video.currentTime - seekTargetTimeRef.current);
                  if (timeDiff > 0.5) {
                    console.log(`[VideoPlayModal] Play event - correcting time from ${video.currentTime} to ${seekTargetTimeRef.current} (diff: ${timeDiff})`);
                    video.currentTime = seekTargetTimeRef.current;
                  }
                }
              }}
              onLoadedMetadata={(e) => {
                // When metadata loads, if user has manually seeked, maintain that position
                const video = e.currentTarget;
                if (seekTargetTimeRef.current !== null && hasUserInteractedRef.current && !isSeekingRef.current) {
                  console.log(`[VideoPlayModal] Metadata loaded - maintaining seeked position: ${seekTargetTimeRef.current}`);
                  // Use setTimeout to ensure this happens after any other handlers
                  setTimeout(() => {
                    if (video && seekTargetTimeRef.current !== null) {
                      video.currentTime = seekTargetTimeRef.current;
                    }
                  }, 100);
                }
              }}
              style={{ width: "100%", height: "auto", objectFit: "contain", pointerEvents: "auto" }}
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
