import { v4 as uuidv4 } from "uuid";
import configManager from "./configManager.js";
import bcrypt from "bcrypt";
import { db } from "./dbFunctions.js";

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds

// Function to generate a session ID
function generateSessionId() {
  return uuidv4();
}

// Function to create a new session
async function createSession() {
  const sessionId = generateSessionId();
  const expiresAt = Date.now() + SESSION_DURATION;

  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO sessions (session_id, expires_at) VALUES (?, ?)",
      [sessionId, expiresAt],
      function (err) {
        if (err) {
          console.error("Error creating session:", err);
          reject(err);
        } else {
          resolve({ sessionId, expiresAt }); // Return both session ID and expiration
        }
      }
    );
  });
}

// Middleware to authenticate requests using session ID
export async function authenticateSession(req, res, next) {
  const sessionId = req.headers.authorization || req.query.token;
  if (!sessionId) {
    return res
      .status(401)
      .json({ message: "Unauthorized: No session ID provided" });
  }

  try {
    const sessionValid = await isSessionValid(sessionId);
    if (sessionValid) {
      req.sessionId = sessionId; // Optionally store session ID in the request
      next(); // Proceed to the next middleware/route handler
    } else {
      res
        .status(401)
        .json({ message: "Unauthorized: Invalid or expired session" });
    }
  } catch (error) {
    console.error("Error authenticating session:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// Function to check if a session ID is valid and not expired
async function isSessionValid(sessionId) {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT expires_at FROM sessions WHERE session_id = ?",
      [sessionId],
      (err, row) => {
        if (err) {
          console.error("Error retrieving session:", err);
          reject(err);
        } else if (row) {
          if (row.expires_at > Date.now()) {
            resolve(true); // Session is valid
          } else {
            // Session expired, optionally delete it
            deleteSession(sessionId)
              .then(() => resolve(false))
              .catch(reject);
          }
        } else {
          resolve(false); // Session not found
        }
      }
    );
  });
}

// Function to delete a session
async function deleteSession(sessionId) {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM sessions WHERE session_id = ?", [sessionId], (err) => {
      if (err) {
        console.error("Error deleting session:", err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// --- Authentication Logic (PIN-based) ---

// API endpoint for login (PIN verification)
export async function loginWithPin(req, res) {
  const { pin } = req.body;
  if (!pin) {
    return res.status(400).json({ message: "PIN is required" });
  }

  const storedPinHash = await configManager.getStoredPinHash();

  if (!storedPinHash) {
    return res.status(500).json({ message: "PIN configuration error" });
  }

  try {
    const match = await bcrypt.compare(pin, storedPinHash);

    if (match) {
      const sessionInfo = await createSession();
      res.json({
        message: "Login successful",
        token: `${sessionInfo.sessionId}`,
        expiresIn: sessionInfo.expiresAt,
      }); // Send expiresIn
    } else {
      res.status(401).json({ message: "Invalid PIN" });
    }
  } catch (error) {
    console.error("Error during PIN comparison:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

// API endpoint to change the PIN (requires authentication via session)
export async function changePin(req, res) {
  const { oldPin, newPin } = req.body;

  if (!oldPin || !newPin) {
    return res.status(400).json({ message: "Old and new PIN are required" });
  }

  if (!/^\d{6}$/.test(newPin)) {
    return res
      .status(400)
      .json({ message: "New PIN must be a 6-digit number" });
  }

  const storedPinHash = await configManager.getStoredPinHash();

  if (!storedPinHash) {
    return res.status(500).json({ message: "PIN configuration error" });
  }

  try {
    const oldPinMatch = bcrypt.compare(oldPin, storedPinHash);
    if (oldPinMatch) {
      const saltRounds = 10;
      const newHashedPin = await bcrypt.hash(newPin, saltRounds);
      await configManager.updateStoredPinHash(newHashedPin);
      res.json({ message: "PIN changed successfully" });
    } else {
      res.status(400).json({ message: "Invalid old PIN" });
    }
  } catch (error) {
    console.error("Error during PIN change:", error);
    res.status(500).json({ message: "Failed to change PIN" });
  }
}

// Middleware to authenticate requests using API key
export async function authenticateApiKey(req, res, next) {
  const apiKey =
    req.headers["x-api-key"] || req.headers.authorization?.split(" ")[1];

  if (!apiKey) {
    return res
      .status(401)
      .json({ message: "Unauthorized: No API key provided" });
  }

  try {
    db.get(
      "SELECT owner_id, is_active, expires_at FROM api_keys WHERE api_key = ?",
      [apiKey],
      (err, row) => {
        if (err) {
          console.error("Error querying API key:", err.message);
          return res.status(500).json({ message: "Internal server error" });
        }

        if (row && row.is_active === 1) {
          if (!row.expires_at) {
            // Key never expires
            req.apiKeyOwner = row.owner_id;
            next();
          } else {
            // Convert the date string from the database to a JavaScript Date object
            const expiryDate = new Date(row.expires_at);
            // Check if the date conversion was successful
            if (!isNaN(expiryDate.getTime())) {
              const now = new Date();
              if (expiryDate > now) {
                req.apiKeyOwner = row.owner_id;
                next();
              } else {
                return res
                  .status(401)
                  .json({ message: "Unauthorized: API key has expired" });
              }
            } else {
              console.error(
                "Error: expires_at is not a valid date string:",
                row.expires_at
              );
              return res
                .status(500)
                .json({
                  message: "Internal server error: Invalid expiry date format",
                });
            }
          }
        } else {
          return res
            .status(401)
            .json({ message: "Unauthorized: Invalid or inactive API key" });
        }
      }
    );
  } catch (error) {
    console.error("Error authenticating API key:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export default {
  loginWithPin,
  changePin,
  authenticateSession,
  authenticateApiKey,
};
