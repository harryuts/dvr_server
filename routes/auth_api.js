import express from "express";
import {
  getRemoteUsers,
  requestAuthorization,
  checkAuthorizationStatus,
  authenticateSession,
} from "../authentication.js";

const router = express.Router();

// API endpoints for authorization approval flow
router.get("/users", getRemoteUsers);
router.post("/authorize/request", requestAuthorization);
router.get("/authorize/status", checkAuthorizationStatus);

export default router;