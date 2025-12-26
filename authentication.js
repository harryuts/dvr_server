import { v4 as uuidv4 } from "uuid";
import configManager from "./configManager.js";
import bcrypt from "bcrypt";
import { db } from "./dbFunctions.js";

// Bypass SSL verification for internal self-signed certificates (e.g. auth provider)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

// --- Authentication Logic (Authorization Approval-based) ---

const AUTH_PROVIDER_URL = "https://www.shop.mammam.com.au:4433";
const REQUESTER_APP_ID = "dvr_server";
const REQUESTER_NAME = "DVR Server";

// Proxy to get users from the auth provider
export async function getRemoteUsers(req, res) {
  try {
    let authAppId = "mammam";
    try {
      const configAppId = await configManager.getAuthAppId();
      if (configAppId) authAppId = configAppId;
    } catch (err) {
      console.warn("[Auth] Failed to get authAppId from config, using default 'mammam'", err);
    }

    const url = `${AUTH_PROVIDER_URL}/api/auth/users?appId=${authAppId}`;
    console.log(`[Auth] calling ${url}`);

    // Ensure fetch is available (Node 18+)
    if (typeof fetch === "undefined") {
      throw new Error("Global fetch is not defined. Node.js 18+ required.");
    }

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Auth] Failed to fetch users: ${response.status} ${errorText}`);
      return res.status(response.status).json({ message: `Failed to fetch users from provider: ${response.status}` });
    }

    const data = await response.json();
    res.json(data); // Forward the response
  } catch (error) {
    console.error("[Auth] Error fetching remote users:", error);
    res.status(500).json({ message: "Internal server error fetching users: " + error.message });
  }
}

// Request authorization approval from user
export async function requestAuthorization(req, res) {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  try {
    const authAppId = await configManager.getAuthAppId();
    console.log(`[Auth] Requesting authorization for user: ${userId}, targetApp: ${authAppId}`);

    const payload = {
      userId,
      targetAppId: authAppId,
      requesterAppId: REQUESTER_APP_ID,
      requesterName: REQUESTER_NAME,
      scopes: ["view_recordings", "live_feed"]
    };

    const response = await fetch(`${AUTH_PROVIDER_URL}/api/auth/authorize/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Auth] Authorization request failed: ${JSON.stringify(data)}`);
      return res.status(response.status).json(data);
    }

    console.log(`[Auth] Authorization request sent, token: ${data.authToken}`);
    res.json({
      success: true,
      authToken: data.authToken,
      expiresIn: data.expiresIn
    });
  } catch (error) {
    console.error("[Auth] Error requesting authorization:", error);
    res.status(500).json({ message: "Internal server error requesting authorization" });
  }
}

// Poll for authorization status
export async function checkAuthorizationStatus(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ message: "Authorization token is required" });
  }

  try {
    const response = await fetch(`${AUTH_PROVIDER_URL}/api/auth/authorize/status?token=${token}`);
    const data = await response.json();

    if (!response.ok) {
      console.error(`[Auth] Status check failed: ${JSON.stringify(data)}`);
      return res.status(response.status).json(data);
    }

    // If approved, create a local session
    if (data.success && data.data.status === 'approved') {
      console.log("[Auth] Authorization approved! Creating local session...");
      const sessionInfo = await createSession();

      return res.json({
        success: true,
        status: 'approved',
        token: sessionInfo.sessionId,
        expiresIn: sessionInfo.expiresAt
      });
    }

    // Return status for pending/denied/expired
    res.json({
      success: true,
      status: data.data.status
    });

  } catch (error) {
    console.error("[Auth] Error checking authorization status:", error);
    res.status(500).json({ message: "Internal server error checking authorization status" });
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
  getRemoteUsers,
  requestAuthorization,
  checkAuthorizationStatus,
  authenticateSession,
  authenticateApiKey,
};
