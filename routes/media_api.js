import express from "express";
import { authenticateSession } from "../authentication.js";
import { getVideo } from "../processVideo.js";
import { getPicture, getJpegLive } from "../processPicture.js";

const router = express.Router();

router.get("/getVideo", authenticateSession, getVideo);
router.get("/getPicture", authenticateSession, getPicture);
router.get("/getJpegLive", authenticateSession, getJpegLive);
export default router;
