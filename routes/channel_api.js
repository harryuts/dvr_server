import express from "express";
import configManager from "../configManager.js";
import { authenticateSession } from "../authentication.js";
import { fetchTimeframeByChannel } from "../dbFunctions.js";

const router = express.Router();

// GET endpoint to fetch all recording configurations
router.get("/config", authenticateSession, async (req, res) => {
  try {
    const configurations = await configManager.getRecordingConfigurations();
    res.json(configurations);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch recording configurations" });
  }
});

// PUT endpoint to update an existing channel configuration
router.put("/config", authenticateSession, async (req, res) => {
  const updatedConfig = req.body;
  if (!updatedConfig || !updatedConfig.channel || !updatedConfig.recordUrl) {
    return res
      .status(400)
      .json({ message: "Invalid channel configuration data provided" });
  }
  try {
    const success = await configManager.updateRecordingConfiguration(
      updatedConfig
    );
    if (success) {
      res.json({ message: "Channel configuration updated successfully" });
    } else {
      res
        .status(404)
        .json({ message: `Channel "${updatedConfig.channel}" not found` });
    }
  } catch (error) {
    res.status(500).json({ message: "Failed to update channel configuration" });
  }
});

// POST endpoint to add a new channel configuration
router.post("/config", authenticateSession, async (req, res) => {
  const newConfig = req.body;
  if (!newConfig || !newConfig.channel || !newConfig.recordUrl) {
    return res
      .status(400)
      .json({ message: "Invalid new channel configuration data provided" });
  }
  try {
    // Check for duplicate channel ID or name
    const existingConfigs = await configManager.getRecordingConfigurations();

    // Check for duplicate channel ID
    const duplicateChannel = existingConfigs.find(
      (config) => config.channel === newConfig.channel
    );
    if (duplicateChannel) {
      return res.status(409).json({
        message: `A channel with ID "${newConfig.channel}" already exists`,
      });
    }

    // Check for duplicate name (case-insensitive)
    if (newConfig.name) {
      const duplicateName = existingConfigs.find(
        (config) =>
          config.name &&
          config.name.toLowerCase() === newConfig.name.toLowerCase()
      );
      if (duplicateName) {
        return res.status(409).json({
          message: `A channel with name "${newConfig.name}" already exists`,
        });
      }
    }

    await configManager.addRecordingConfiguration(newConfig);
    res
      .status(201)
      .json({ message: "New channel configuration added successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to add new channel configuration" });
  }
});

// DELETE endpoint to delete a channel configuration
router.delete("/config/:channel", authenticateSession, async (req, res) => {
  const channelToDelete = req.params.channel;
  if (!channelToDelete) {
    return res.status(400).json({ message: "Channel to delete not specified" });
  }
  try {
    const success = await configManager.deleteRecordingConfiguration(
      channelToDelete
    );
    if (success) {
      res.json({
        message: `Channel "${channelToDelete}" deleted successfully`,
      });
    } else {
      res
        .status(404)
        .json({ message: `Channel "${channelToDelete}" not found` });
    }
  } catch (error) {
    res.status(500).json({ message: "Failed to delete channel configuration" });
  }
});

// Get channel timeframe information from database
router.get("/timeframe", authenticateSession, async (req, res) => {
  try {
    const timeframeDataByChannel = await fetchTimeframeByChannel();
    res.json(timeframeDataByChannel);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Failed to query the database" });
  }
});

export default router;
