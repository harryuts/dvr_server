import express from "express";
import { authenticateSession } from "../authentication.js";
import { db } from "../dbFunctions.js";
import crypto from "crypto";

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

export default router;
