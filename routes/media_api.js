import express from "express";
import { authenticateSession } from "../authentication.js";
import { getVideo, streamVideo, getLiveVideo } from "../processVideo.js";
import { getPicture, getJpegLive } from "../processPicture.js";

const router = express.Router();

router.get("/getVideo", authenticateSession, getVideo);
router.get("/getLiveVideo", authenticateSession, getLiveVideo);
router.get("/stream", authenticateSession, streamVideo);
router.get("/getPicture", authenticateSession, getPicture);
router.get("/getJpegLive", authenticateSession, getJpegLive);

// New endpoint for fetching video segments for timeline
router.get("/video-segments", authenticateSession, async (req, res) => {
    try {
        const { channel, startTime, endTime } = req.query;

        if (!channel || !startTime || !endTime) {
            return res.status(400).json({ error: "Missing required parameters: channel, startTime, endTime" });
        }

        const startTimeInt = parseInt(startTime);
        const endTimeInt = parseInt(endTime);

        const { getVideoSegmentsForTimeframe } = await import("../dbFunctions.js");
        const segments = await getVideoSegmentsForTimeframe(channel, startTimeInt, endTimeInt);

        // Check if there's a currently recording segment that overlaps with the requested timeframe
        const { getRecordingStatus } = await import("../recording.js");
        const recordingStatus = getRecordingStatus(channel);
        
        if (recordingStatus.isRecording && recordingStatus.currentSegmentStartTime) {
            const currentSegmentStart = recordingStatus.currentSegmentStartTime;
            const currentSegmentEnd = Date.now(); // Current time (segment is still being recorded)
            
            // Check if current segment overlaps with requested timeframe
            // Overlap condition: currentSegmentStart < endTimeInt AND currentSegmentEnd > startTimeInt
            if (currentSegmentStart < endTimeInt && currentSegmentEnd > startTimeInt) {
                // Add the current recording segment to the results
                segments.push({
                    start_time: currentSegmentStart,
                    end_time: currentSegmentEnd
                });
                
                // Sort segments by start_time to maintain order
                segments.sort((a, b) => a.start_time - b.start_time);
                
                console.log(`[video-segments] Added current recording segment for channel ${channel}: ${new Date(currentSegmentStart).toISOString()} - ${new Date(currentSegmentEnd).toISOString()}`);
            }
        }

        res.json(segments);
    } catch (error) {
        console.error("Error fetching video segments:", error);
        res.status(500).json({ error: "Failed to fetch video segments" });
    }
});

// Endpoint to get dates with recordings for a channel
router.get("/dates-with-recordings", authenticateSession, async (req, res) => {
    try {
        const { channel } = req.query;

        if (!channel) {
            return res.status(400).json({ error: "Missing required parameter: channel" });
        }

        const { getDatesWithRecordings } = await import("../dbFunctions.js");
        const { getRecordingStatus } = await import("../recording.js");
        
        const dates = await getDatesWithRecordings(channel);
        
        // Also check if currently recording (today might have recordings but not in DB yet)
        const recordingStatus = getRecordingStatus(channel);
        if (recordingStatus.isRecording && recordingStatus.currentSegmentStartTime) {
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            if (!dates.includes(todayStr)) {
                dates.unshift(todayStr); // Add today at the beginning if not already present
            }
        }

        res.json({ dates });
    } catch (error) {
        console.error("Error fetching dates with recordings:", error);
        res.status(500).json({ error: "Failed to fetch dates with recordings" });
    }
});

export default router;
