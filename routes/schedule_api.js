import express from "express";
import configManager from "../configManager.js";
import { authenticateSession } from "../authentication.js";

const router = express.Router();

// GET endpoint to fetch the recording schedule
router.get("", authenticateSession, async (req, res) => {
  try {
    const schedule = await configManager.getSchedule();
    res.json(schedule);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Failed to fetch recording schedule" });
  }
});

// POST endpoint to update the recording schedule
router.post("", authenticateSession, async (req, res) => {
  const { startTime, stopTime } = req.body;

  if (
    !startTime ||
    !stopTime ||
    !startTime.hour ||
    !startTime.minute ||
    !stopTime.hour ||
    !stopTime.minute
  ) {
    return res.status(400).json({ message: "Invalid schedule data provided" });
  }

  try {
    await configManager.updateSchedule(startTime, stopTime);
    res.json({ message: "Recording schedule updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to update recording schedule" });
  }
});

export default router;
