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
router.get("/getJpegLive", authenticateSession, getJpegLive);

// New endpoint for fetching video segments for timeline
router.get("/video-segments", authenticateSession, async (req, res) => {
    try {
        const { channel, startTime, endTime } = req.query;

        if (!channel || !startTime || !endTime) {
            return res.status(400).json({ error: "Missing required parameters: channel, startTime, endTime" });
        }

        const { getVideoSegmentsForTimeframe } = await import("../dbFunctions.js");
        const segments = await getVideoSegmentsForTimeframe(channel, parseInt(startTime), parseInt(endTime));

        res.json(segments);
    } catch (error) {
        console.error("Error fetching video segments:", error);
        res.status(500).json({ error: "Failed to fetch video segments" });
    }
});

export default router;
