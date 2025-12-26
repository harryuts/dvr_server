import express from "express";
import crypto from "crypto";
import bodyParser from "body-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import cors from "cors";
import https from "https";
import configManager from "./configManager.js";
import { authenticateSession } from "./authentication.js";
import authRoutes from "./routes/auth_api.js";
import channelRoutes from "./routes/channel_api.js";
import adminRoutes from "./routes/admin_api.js";
import scheduleRoutes from "./routes/schedule_api.js";
import mediaRoutes from "./routes/media_api.js";
import posRoutes from "./routes/pos_api.js";
import { recordingControls } from "./scheduleRecording.js";
import storageManager from "./storage-management.js";
import { getSystemMetrics } from "./dbFunctions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = 3006;
// Access baseVideoDirectory dynamically from configManager

app.use(
  cors({
    origin: "*",
  })
);
app.use(bodyParser.json());

// Function to generate a secure random API key
const generateApiKey = () => {
  return crypto.randomBytes(32).toString("hex");
};

const startApiServer = (db, spawnedProcesses) => {
  // Store in app.locals for access in routes
  app.locals.db = db;
  app.locals.spawnedProcesses = spawnedProcesses;

  // Basic HTTPS options
  const httpsOptions = {
    key: fs.readFileSync(
      path.resolve(__dirname, "certs/poslocal.mammam.com.au.key")
    ),
    cert: fs.readFileSync(
      path.resolve(__dirname, "certs/poslocal.mammam.com.au.crt")
    ),
    ca: fs.readFileSync(
      path.resolve(__dirname, "certs/poslocal.mammam.com.au.ca-bundle")
    ),
  };
  // Create HTTPS server
  const httpsServer = https.createServer(httpsOptions, app);

  httpsServer.listen(PORT, () => {
    console.log(`HTTPS Server is running on port ${PORT}`);
  });

  app.use("/api/auth", authRoutes);
  app.use(`/api/channels`, channelRoutes);
  app.use(`/api/schedule`, scheduleRoutes);
  app.use(`/api`, mediaRoutes);
  app.use(`/pos`, posRoutes);
  app.use(`/admin`, adminRoutes);

  app.use(
    "/cctv",
    express.static(path.join(configManager.baseVideoDirectory, "video_output"))
  );
  app.use(
    "/cctv_evidence",
    express.static(path.join(configManager.baseVideoDirectory, "evidence"))
  );
  // Return 404 if file not found in /cctv_evidence, preventing fall-through to SPA
  app.use("/cctv_evidence", (req, res) => {
    res.status(404).send("File not found");
  });

  app.get("/api/recording/status", authenticateSession, async (req, res) => {
    try {
      const recordingStatusCallback = [];
      const knownPids = new Set();

      // Get all channel configurations
      const channelConfigs = await configManager.getRecordingConfigurations();

      // Build status for all channels
      for (const channelConfig of channelConfigs) {
        const channel = channelConfig.channel;
        const recordingControl = recordingControls[channel];

        if (recordingControl) {
          // Channel is currently recording
          const status = recordingControl.getStatus();
          if (status.pid) knownPids.add(String(status.pid));
          recordingStatusCallback.push({
            channel: channel,
            pid: status.pid,
            isRecording: status.isRecording,
            startTime: status.startTime,
            uptime: status.uptime,
            respawnCount: status.respawnCount,
            currentFile: status.currentSegmentFile,
            type: channelConfig.type || 'standard',
          });
        } else {
          // Channel is not currently recording
          recordingStatusCallback.push({
            channel: channel,
            pid: null,
            isRecording: false,
            startTime: null,
            uptime: 'N/A',
            respawnCount: 0,
            currentFile: 'Not Recording',
            type: channelConfig.type || 'standard',
          });
        }
      }

      // 2. Get All FFmpeg Processes via Registry
      let otherProcesses = [];
      try {
        const { getAllFFmpegProcesses } = await import("./ffmpegRegistry.js");
        const allTrackedProcesses = getAllFFmpegProcesses();

        // Filter out processes that are already accounted for in knownPids (recording channels)
        otherProcesses = allTrackedProcesses
          .filter(proc => !knownPids.has(String(proc.pid)))
          .map(proc => ({
            pid: proc.pid,
            context: proc.context,
            startTime: proc.startTimeISO,
            uptime: proc.uptime,
            command: proc.command
          }));
      } catch (e) {
        console.error("Error fetching registry processes:", e);
      }

      res.json({
        recordingStatus: recordingStatusCallback,
        otherProcesses: otherProcesses
      });
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ error: "Failed to get the query" });
    }
  });

  // New endpoint to get logs for a specific process
  app.get("/api/processes/logs/:pid", authenticateSession, async (req, res) => {
    try {
      const { getProcessLogs } = await import("./ffmpegRegistry.js");
      const logs = getProcessLogs(req.params.pid);
      res.json(logs);
    } catch (error) {
      console.error(`Error fetching logs for process ${req.params.pid}:`, error);
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  app.get("/api/metrics/history", authenticateSession, async (req, res) => {
    try {
      const range = req.query.range || 'daily';
      const metrics = await getSystemMetrics(range);
      res.json(metrics);
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ error: "Failed to fetch metrics history" });
    }
  });

  app.get("/api/disk/usage", authenticateSession, async (req, res) => {
    try {
      res.json(await storageManager.getDiskUsagePercentage(configManager.baseVideoDirectory));
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ error: "Failed to get the query" });
    }
  });

  // Serve static files from the 'client/dist' folder
  app.use("/", express.static(path.join(__dirname, "client", "dist")));

  // Catch-all route to serve the React app for client-side routing
  app.get("/*", (req, res) => {
    res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
  });
};

export { startApiServer, app };
