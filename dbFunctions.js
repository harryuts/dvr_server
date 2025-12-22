import * as configManager from "./configManager.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3").verbose();

const dbPath = "./videos.db";
let db = new sqlite3.Database(
  dbPath,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      return console.error(err.message);
    }
    console.log("Connected to the SQLite database.");

    // Create the table and only proceed once it's created
    db.run(
      "CREATE TABLE IF NOT EXISTS video_segments (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, channel_number TEXT, start_time INTEGER, end_time INTEGER, start_time_str TEXT, end_time_str TEXT)",
      (createErr) => {
        if (createErr) {
          return console.error(createErr.message);
        }
      }
    );
    // Create the sessions table if it doesn't exist
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
        )
        `);
    });

    // Create the api_keys table if it doesn't exist
    db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      api_key TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL, -- To identify the business/user owning the key
      name TEXT,             -- Optional: A descriptive name for the API key
      is_active INTEGER DEFAULT 1, -- 1 for active, 0 for inactive
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      expires_at INTEGER    -- Optional: Expiration timestamp
    )
  `);
  }
);

// Function to query the database and return the earliest and latest timeframes for each channel
export async function fetchTimeframeByChannel() {
  const channelInfo = await configManager.getRecordingConfigurations();
  return new Promise((resolve, reject) => {
    const query = `
        SELECT
          channel_number,
          MIN(start_time) AS earliest_start_time,
          MAX(end_time) AS latest_end_time
        FROM video_segments
        GROUP BY channel_number;
      `;

    db.all(query, [], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      // Create a map of channel data from database
      const dbChannelMap = new Map();
      if (rows && rows.length > 0) {
        rows.forEach((row) => {
          dbChannelMap.set(row.channel_number, {
            earliest: {
              timestamp: row.earliest_start_time,
              formatted: new Date(row.earliest_start_time).toLocaleString(),
            },
            latest: {
              timestamp: row.latest_end_time,
              formatted: new Date(row.latest_end_time).toLocaleString(),
            },
          });
        });
      }

      // Return all configured channels, with DB data if available
      const result = channelInfo.map((config) => {
        const dbData = dbChannelMap.get(config.channel);
        return {
          channel: config.channel,
          name: config.name,
          earliest: dbData?.earliest || null,
          latest: dbData?.latest || null,
        };
      });

      resolve(result);
    });
  });
}

// Function to fetch video segments for a specific channel and timeframe
export function getVideoSegmentsForTimeframe(channel, startTime, endTime) {
  return new Promise((resolve, reject) => {
    // Only select the fields we need for the timeline
    // We want segments that overlap with [startTime, endTime]
    // Condition: segment.start_time < endTime AND segment.end_time > startTime
    const query = `
      SELECT start_time, end_time
      FROM video_segments
      WHERE channel_number = ?
        AND start_time < ?
        AND end_time > ?
      ORDER BY start_time ASC;
    `;

    db.all(query, [channel, endTime, startTime], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Map to format that might be easier for frontend if needed, or return raw
        resolve(rows);
      }
    });
  });
}

export { db };
