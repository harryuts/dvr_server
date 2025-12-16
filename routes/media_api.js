import express from "express";
import { authenticateSession } from "../authentication.js";
import { getVideo } from "../processVideo.js";
import { getPicture } from "../processPicture.js";

const router = express.Router();

router.get("/getVideo", authenticateSession, getVideo);
router.get("/getPicture", authenticateSession, getPicture);
export default router;
