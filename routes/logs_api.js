import express from "express";
import { authenticateSession } from "../authentication.js";
import performanceLogger from "../performanceLogger.js";

const router = express.Router();

// GET endpoint to fetch performance logs
router.get("", authenticateSession, async (req, res) => {
  try {
    const { limit = 100, endpoint } = req.query;
    const logs = performanceLogger.getLogs(parseInt(limit), endpoint);
    res.json({ logs, total: logs.length });
  } catch (error) {
    console.error("[logs_api] Error fetching logs:", error);
    res.status(500).json({ message: "Failed to fetch performance logs" });
  }
});

// GET endpoint to fetch performance statistics
router.get("/stats", authenticateSession, async (req, res) => {
  try {
    const { endpoint } = req.query;
    const stats = performanceLogger.getStats(endpoint);
    
    if (!stats) {
      return res.json({ message: "No statistics available", stats: null });
    }
    
    res.json({ stats });
  } catch (error) {
    console.error("[logs_api] Error fetching stats:", error);
    res.status(500).json({ message: "Failed to fetch performance statistics" });
  }
});

// DELETE endpoint to clear logs
router.delete("", authenticateSession, async (req, res) => {
  try {
    const success = performanceLogger.clearLogs();
    
    if (success) {
      res.json({ message: "Performance logs cleared successfully" });
    } else {
      res.status(500).json({ message: "Failed to clear performance logs" });
    }
  } catch (error) {
    console.error("[logs_api] Error clearing logs:", error);
    res.status(500).json({ message: "Failed to clear performance logs" });
  }
});

export default router;

