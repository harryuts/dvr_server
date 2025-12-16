import express from "express";
import { authenticateApiKey } from "../authentication.js";
import { getVideo } from "../processVideo.js";
import { getPicture, getJpegIot, getJpegLive } from "../processPicture.js";

const router = express.Router();

router.get("/getVideo", authenticateApiKey, getVideo);
router.get("/getPicture", authenticateApiKey, getPicture);
router.get("/getJpegIot", authenticateApiKey, getJpegIot);
router.get("/getJpegLive", authenticateApiKey, getJpegLive);

export default router;
