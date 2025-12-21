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
export default router;
