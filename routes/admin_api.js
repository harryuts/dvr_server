import express from "express";
import { authenticateSession } from "../authentication.js";
import { db } from "../dbFunctions.js";
import crypto from "crypto";
import configManager, { VIDEO_OUTPUT_DIR, EVIDENCE_DIR } from "../configManager.js";
import os from "os";
import si from "systeminformation";
import fs from "fs";
import path from "path";

const router = express.Router();

// Function to generate a secure random API key
const generateApiKey = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Create a new API key
router.post("/api-keys", authenticateSession, async (req, res) => {
  const { ownerId, name, expiresAt } = req.body;
  const apiKey = generateApiKey();
  const createdAt = Date.now() / 1000; // Unix timestamp

  db.run(
    "INSERT INTO api_keys (api_key, owner_id, name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [apiKey, ownerId, name, createdAt, expiresAt || null],
    function (err) {
      if (err) {
        console.error(err.message);
        return res
          .status(500)
          .json({ message: "Failed to create API key", error: err.message });
      }
      res
        .status(201)
        .json({ message: "API key created successfully", apiKey: apiKey });
    }
  );
});

// Get a list of all API keys (admin only)
router.get("/api-keys", authenticateSession, (req, res) => {
  db.all(
    "SELECT api_key, owner_id, name, is_active, created_at, expires_at FROM api_keys",
    [],
    (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({
          message: "Failed to retrieve API keys",
          error: err.message,
        });
      }
      res.json(rows);
    }
  );
});

// Get details of a specific API key (admin only)
router.get("/api-keys/:apiKey", authenticateSession, (req, res) => {
  const apiKey = req.params.apiKey;
  db.get(
    "SELECT api_key, owner_id, name, is_active, created_at, expires_at FROM api_keys WHERE api_key = ?",
    [apiKey],
    (err, row) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({
          message: "Failed to retrieve API key details",
          error: err.message,
        });
      }
      if (!row) {
        return res.status(404).json({ message: "API key not found" });
      }
      res.json(row);
    }
  );
});

// Update an API key (admin only - e.g., name, expiration, status)
router.put("/api-keys/:apiKey", authenticateSession, async (req, res) => {
  const apiKeyToUpdate = req.params.apiKey;
  const { name, isActive, expiresAt, newApiKey } = req.body;

  const updates = [];
  const params = [];

  if (newApiKey !== undefined) {
    updates.push("api_key = ?");
    params.push(newApiKey);
  }

  if (name !== undefined) {
    updates.push("name = ?");
    params.push(name);
  }
  if (isActive !== undefined) {
    updates.push("is_active = ?");
    params.push(isActive ? 1 : 0);
  }
  if (expiresAt !== undefined) {
    updates.push("expires_at = ?");
    params.push(expiresAt || null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "No update parameters provided" });
  }

  const sql = `UPDATE api_keys SET ${updates.join(", ")} WHERE api_key = ?`;
  params.push(apiKeyToUpdate);

  db.run(sql, params, function (err) {
    if (err) {
      console.error(err.message);
      return res
        .status(500)
        .json({ message: "Failed to update API key", error: err.message });
    }
    if (this.changes > 0) {
      res.json({ message: "API key updated successfully" });
    } else {
      res.status(404).json({ message: "API key not found" });
    }
  });
});

// Delete an API key (admin only)
router.delete("/api-keys/:apiKey", authenticateSession, (req, res) => {
  const apiKeyToDelete = req.params.apiKey;
  db.run(
    "DELETE FROM api_keys WHERE api_key = ?",
    [apiKeyToDelete],
    function (err) {
      if (err) {
        console.error(err.message);
        return res
          .status(500)
          .json({ message: "Failed to delete API key", error: err.message });
      }
      if (this.changes > 0) {
        res.json({ message: "API key deleted successfully" });
      } else {
        res.status(404).json({ message: "API key not found" });
      }
    }
  );
});

// Get live capture configuration
router.get("/live-capture-config", authenticateSession, async (req, res) => {
  try {
    const frameRate = await configManager.getLiveCaptureFrameRate();
    res.json({ liveCaptureFrameRate: frameRate });
  } catch (error) {
    console.error("Error fetching live capture config:", error);
    res.status(500).json({ message: "Failed to fetch live capture configuration", error: error.message });
  }
});

// Update live capture configuration
router.post("/live-capture-config", authenticateSession, async (req, res) => {
  const { liveCaptureFrameRate } = req.body;

  if (!liveCaptureFrameRate || ![1, 2, 3].includes(parseInt(liveCaptureFrameRate))) {
    return res.status(400).json({ message: "Invalid frame rate. Must be 1, 2, or 3 FPS." });
  }

  try {
    await configManager.updateLiveCaptureFrameRate(liveCaptureFrameRate);

    // Restart all recordings to apply new frame rate
    const { restartAllRecordings } = await import("../scheduleRecording.js");
    await restartAllRecordings();

    res.json({ message: "Live capture frame rate updated successfully. Recordings restarted." });
  } catch (error) {
    console.error("Error updating live capture config:", error);
    res.status(500).json({ message: "Failed to update live capture configuration", error: error.message });
  }
});

// Helper function to get CPU info
const getCpuInfo = () => {
  const cpus = os.cpus();
  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;

  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }

  const total = user + nice + sys + idle + irq;

  return {
    idle,
    total,
  };
};

// Get system stats (CPU & RAM)
router.get("/system-stats", authenticateSession, async (req, res) => {
  try {
    const startMeasure = getCpuInfo();

    // Wait 100ms to calculate CPU usage
    await new Promise((resolve) => setTimeout(resolve, 100));

    const endMeasure = getCpuInfo();

    const idleDifference = endMeasure.idle - startMeasure.idle;
    const totalDifference = endMeasure.total - startMeasure.total;

    // Calculate CPU percentage
    const cpuPercentage = totalDifference === 0 ? 0 : 100 - (100 * idleDifference) / totalDifference;

    // Calculate RAM usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercentage = (usedMem / totalMem) * 100;

    // Get CPU temperature
    const cpuTempData = await si.cpuTemperature();
    const cpuTemp = cpuTempData.main;

    res.json({
      cpu: Math.round(cpuPercentage),
      cpuCount: os.cpus().length,
      cpuTemp: Math.round(cpuTemp),
      ram: Math.round(ramPercentage),
      totalMem: totalMem,
      usedMem: usedMem
    });
  } catch (error) {
    console.error("Error fetching system stats:", error);
    res.status(500).json({ message: "Failed to fetch system stats", error: error.message });
  }
});

// Get Storage Config
router.get("/storage-config", authenticateSession, async (req, res) => {
  try {
    const percent = await configManager.getMaxStoragePercent();
    const baseDir = await configManager.getBaseVideoDirectory();
    res.json({ 
      maxStoragePercent: percent,
      baseVideoDirectory: baseDir
    });
  } catch (error) {
    console.error("Error fetching storage config:", error);
    res.status(500).json({ message: "Failed to fetch storage config", error: error.message });
  }
});

// Update Storage Config
router.post("/storage-config", authenticateSession, async (req, res) => {
  const { maxStoragePercent, baseVideoDirectory } = req.body;

  if (maxStoragePercent !== undefined && (maxStoragePercent < 1 || maxStoragePercent > 100)) {
    return res.status(400).json({ message: "Invalid percentage value (1-100)" });
  }

  if (baseVideoDirectory !== undefined && typeof baseVideoDirectory !== 'string') {
    return res.status(400).json({ message: "Base video directory must be a string" });
  }

  try {
    if (maxStoragePercent !== undefined) {
      await configManager.updateMaxStoragePercent(maxStoragePercent);
    }
    if (baseVideoDirectory !== undefined) {
      await configManager.updateBaseVideoDirectory(baseVideoDirectory.trim());
    }
    res.json({ message: "Storage configuration updated successfully" });
  } catch (error) {
    console.error("Error updating storage config:", error);
    res.status(500).json({ message: "Failed to update storage config", error: error.message });
  }
});

// Get Storage Utilization
router.get("/storage-utilization", authenticateSession, async (req, res) => {
  try {
    const baseDir = await configManager.getBaseVideoDirectory();
    const si = (await import('systeminformation')).default;
    const fsSize = await si.fsSize();
    
    // Find the filesystem that contains our base directory (recording mount)
    // Sort by mount path length (longest first) to get the most specific mount
    const sortedFs = fsSize.sort((a, b) => b.mount.length - a.mount.length);
    let recordingFs = sortedFs.find(fs => baseDir.startsWith(fs.mount));
    
    if (!recordingFs) {
      return res.status(404).json({ 
        message: "Could not determine storage information for video directory",
        baseDirectory: baseDir,
        availableFilesystems: fsSize.map(fs => ({ mount: fs.mount, fs: fs.fs }))
      });
    }

    // Find the system root filesystem
    const systemFs = fsSize.find(fs => fs.mount === '/');

    const result = {
      baseDirectory: baseDir,
      recording: {
        totalBytes: recordingFs.size,
        usedBytes: recordingFs.used,
        availableBytes: recordingFs.available,
        usedPercent: recordingFs.use,
        mount: recordingFs.mount,
        filesystem: recordingFs.fs
      }
    };

    // Add system disk info if different from recording
    if (systemFs && systemFs.mount !== recordingFs.mount) {
      result.system = {
        totalBytes: systemFs.size,
        usedBytes: systemFs.used,
        availableBytes: systemFs.available,
        usedPercent: systemFs.use,
        mount: systemFs.mount,
        filesystem: systemFs.fs
      };
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching storage utilization:", error);
    res.status(500).json({ message: "Failed to fetch storage utilization", error: error.message });
  }
});

// Get Auth App ID Config
router.get("/auth-app-id-config", authenticateSession, async (req, res) => {
  try {
    const authAppId = await configManager.getAuthAppId();
    res.json({ authAppId: authAppId });
  } catch (error) {
    console.error("Error fetching auth app ID config:", error);
    res.status(500).json({ message: "Failed to fetch auth app ID configuration", error: error.message });
  }
});

// Update Auth App ID Config
router.post("/auth-app-id-config", authenticateSession, async (req, res) => {
  const { authAppId } = req.body;

  if (!authAppId || typeof authAppId !== 'string' || authAppId.trim().length === 0) {
    return res.status(400).json({ message: "Invalid auth app ID. Must be a non-empty string." });
  }

  try {
    await configManager.updateAuthAppId(authAppId.trim());
    res.json({ message: "Auth app ID updated successfully" });
  } catch (error) {
    console.error("Error updating auth app ID config:", error);
    res.status(500).json({ message: "Failed to update auth app ID configuration", error: error.message });
  }
});

// Get System Config (raw config.json)
router.get("/system-config", authenticateSession, async (req, res) => {
  try {
    const config = await configManager.readConfig();
    res.json({ config: config });
  } catch (error) {
    console.error("Error fetching system config:", error);
    res.status(500).json({ message: "Failed to fetch system configuration", error: error.message });
  }
});

// Update System Config (raw config.json)
router.put("/system-config", authenticateSession, async (req, res) => {
  const { config } = req.body;

  if (!config) {
    return res.status(400).json({ message: "Config data is required" });
  }

  // Validate that the config is a valid object
  if (typeof config !== 'object' || Array.isArray(config)) {
    return res.status(400).json({ message: "Config must be a valid JSON object" });
  }

  try {
    await configManager.writeConfig(config);
    res.json({ message: "System configuration updated successfully" });
  } catch (error) {
    console.error("Error updating system config:", error);
    res.status(500).json({ message: "Failed to update system configuration", error: error.message });
  }
});

// List files in a directory (video_output or evidence)
router.get("/directory-files", authenticateSession, async (req, res) => {
  try {
    const { directory } = req.query; // 'video_output' or 'evidence'
    
    if (!directory || (directory !== VIDEO_OUTPUT_DIR && directory !== EVIDENCE_DIR)) {
      return res.status(400).json({ 
        error: "Invalid directory. Must be 'video_output' or 'evidence'" 
      });
    }

    const baseDir = await configManager.getBaseVideoDirectory();
    const dirPath = path.join(baseDir, directory);

    // Check if directory exists
    if (!fs.existsSync(dirPath)) {
      return res.status(404).json({ error: "Directory not found" });
    }

    // Read directory contents
    const files = fs.readdirSync(dirPath);
    const fileList = files.map((filename) => {
      const filePath = path.join(dirPath, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        modified: stats.mtime.getTime(),
        isDirectory: stats.isDirectory(),
      };
    });

    // Sort by modified date (newest first)
    fileList.sort((a, b) => b.modified - a.modified);

    res.json({
      directory,
      path: dirPath,
      files: fileList,
    });
  } catch (error) {
    console.error("Error listing directory files:", error);
    res.status(500).json({ error: "Failed to list directory files", message: error.message });
  }
});

// Export
export default router;
