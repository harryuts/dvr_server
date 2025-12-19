import express from "express";
import {
  loginWithPin,
  changePin,
  authenticateSession,
} from "../authentication.js";

const router = express.Router();

// API endpoint for login
router.post("/login", loginWithPin);
router.post("/change-pin", authenticateSession, changePin);

export default router;