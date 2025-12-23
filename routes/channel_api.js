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
router.put("/config/:originalChannelId", authenticateSession, async (req, res) => {
  const originalChannelId = req.params.originalChannelId;
  const updatedConfig = req.body;
  if (!updatedConfig || !updatedConfig.channel || !updatedConfig.recordUrl) {
    return res
      .status(400)
      .json({ message: "Invalid channel configuration data provided" });
  }
  try {
    const success = await configManager.updateRecordingConfiguration(
      originalChannelId,
      updatedConfig
    );
    if (success) {
      // Restart the recording process for the updated channel
      console.log(`Restarting recording for channel: ${originalChannelId}`);
      const { stopRecordingForChannel, startRecordingForChannel } = await import(
        "../scheduleRecording.js"
      );

      await stopRecordingForChannel(originalChannelId);

      const result = await startRecordingForChannel(
        req.app.locals.db,
        req.app.locals.spawnedProcesses,
        updatedConfig
      );

      if (result.success) {
        console.log(`Recording restarted for channel: ${updatedConfig.channel}`);
      } else {
        console.log(
          `Recording not restarted for ${updatedConfig.channel}: ${result.reason}`
        );
      }

      res.json({ message: "Channel configuration updated successfully" });
    } else {
      res
        .status(404)
        .json({ message: `Channel "${originalChannelId}" not found` });
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

    // Try to start recording if in recording window
    const { startRecordingForChannel } = await import(
      "../scheduleRecording.js"
    );
    const result = await startRecordingForChannel(
      req.app.locals.db,
      req.app.locals.spawnedProcesses,
      newConfig
    );

    if (result.success) {
      console.log(`Recording started for new channel: ${newConfig.channel}`);
    } else {
      console.log(
        `Recording not started for ${newConfig.channel}: ${result.reason}`
      );
    }

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
      // Stop the recording process for the deleted channel
      const { stopRecordingForChannel } = await import(
        "../scheduleRecording.js"
      );
      await stopRecordingForChannel(channelToDelete);

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

// Get logs for a specific channel
router.get("/logs/:channel", authenticateSession, async (req, res) => {
  const channel = req.params.channel;
  try {
    const { getChannelLogs } = await import("../recording.js");
    const logs = getChannelLogs(channel);
    res.json(logs);
  } catch (error) {
    console.error(`Error fetching logs for channel ${channel}:`, error);
    res.status(500).json({ error: "Failed to fetch logs" });
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
