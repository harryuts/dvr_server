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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = 3006;
const baseVideoDirectory = configManager.baseVideoDirectory;

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

const startApiServer = (db) => {
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
  app.use(`/api`, adminRoutes);

  app.use(
    "/cctv",
    express.static(path.join(baseVideoDirectory, "video_output"))
  );
  app.use(
    "/cctv_evidence",
    express.static(path.join(baseVideoDirectory, "evidence"))
  );

  app.get("/api/recording/status", authenticateSession, async (req, res) => {
    try {
      const result = [];
      for (const channel in recordingControls) {
        if (recordingControls.hasOwnProperty(channel)) {
          const status = recordingControls[channel].getStatus();
          result.push({
            channel: channel,
            pid: status.pid,
            isRecording: status.isRecording,
            startTime: status.startTime,
            uptime: status.uptime,
            respawnCount: status.respawnCount,
            currentFile: status.currentSegmentFile,
          });
        }
      }

      res.json(result);
    } catch (error) {
      console.error(error.message);
      res.status(500).json({ error: "Failed to get the query" });
    }
  });

  app.get("/api/disk/usage", authenticateSession, async (req, res) => {
    try {
      res.json(await storageManager.getDiskUsagePercentage(baseVideoDirectory));
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
