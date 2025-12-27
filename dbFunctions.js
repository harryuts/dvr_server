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

    // Optimize SQLite for SSD performance
    // WAL mode: Faster concurrent writes, better for SSD
    db.run("PRAGMA journal_mode = WAL;", (err) => {
      if (err) {
        console.warn("Failed to set WAL mode:", err.message);
      } else {
        console.log("SQLite WAL mode enabled (optimized for SSD)");
      }
    });

    // Synchronous mode: NORMAL is safe and faster than FULL for SSD
    // OFF is fastest but less safe (acceptable for video recording where we can recover)
    db.run("PRAGMA synchronous = NORMAL;", (err) => {
      if (err) {
        console.warn("Failed to set synchronous mode:", err.message);
      }
    });

    // Increase cache size for better performance (default is 2000 pages, ~8MB)
    // Set to 10000 pages (~40MB) for better SSD performance
    db.run("PRAGMA cache_size = -10000;", (err) => {
      if (err) {
        console.warn("Failed to set cache size:", err.message);
      }
    });

    // Optimize for faster writes
    db.run("PRAGMA temp_store = MEMORY;", (err) => {
      if (err) {
        console.warn("Failed to set temp_store:", err.message);
      }
    });

    // Create the table and only proceed once it's created
    db.run(
      "CREATE TABLE IF NOT EXISTS video_segments (id INTEGER PRIMARY KEY AUTOINCREMENT, filename TEXT, channel_number TEXT, start_time INTEGER, end_time INTEGER, start_time_str TEXT, end_time_str TEXT)",
      (createErr) => {
        if (createErr) {
          return console.error(createErr.message);
        }
        // Create indexes for faster queries (optimized for SSD)
        // Index on channel_number for filtering by channel
        db.run(
          "CREATE INDEX IF NOT EXISTS idx_channel_number ON video_segments(channel_number);",
          (idxErr) => {
            if (idxErr) {
              console.warn("Failed to create channel_number index:", idxErr.message);
            }
          }
        );
        // Composite index on channel_number and time range for faster segment lookups
        db.run(
          "CREATE INDEX IF NOT EXISTS idx_channel_time ON video_segments(channel_number, start_time, end_time);",
          (idxErr) => {
            if (idxErr) {
              console.warn("Failed to create channel_time index:", idxErr.message);
            }
          }
        );
        // Index on start_time for date-based queries
        db.run(
          "CREATE INDEX IF NOT EXISTS idx_start_time ON video_segments(start_time);",
          (idxErr) => {
            if (idxErr) {
              console.warn("Failed to create start_time index:", idxErr.message);
            }
          }
        );
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

    // Create the system_metrics table
    db.run(`
      CREATE TABLE IF NOT EXISTS system_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cpu_usage REAL,
        ram_usage REAL,
        cpu_temp REAL,
        timestamp INTEGER
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

// Function to get distinct dates (YYYY-MM-DD) that have recordings for a channel
export function getDatesWithRecordings(channel) {
  return new Promise((resolve, reject) => {
    // Get all segments for the channel and extract unique dates
    const query = `
      SELECT DISTINCT 
        date(start_time / 1000, 'unixepoch', 'localtime') as date_str
      FROM video_segments
      WHERE channel_number = ?
      ORDER BY date_str DESC;
    `;

    db.all(query, [channel], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        // Return array of date strings in YYYY-MM-DD format
        const dates = rows.map(row => row.date_str);
        resolve(dates);
      }
    });
  });
}

export function insertSystemMetrics(cpuUsage, ramUsage, cpuTemp) {
  const timestamp = Date.now();
  db.run(
    `INSERT INTO system_metrics (cpu_usage, ram_usage, cpu_temp, timestamp) VALUES (?, ?, ?, ?)`,
    [cpuUsage, ramUsage, cpuTemp, timestamp],
    (err) => {
      if (err) {
        console.error("Error inserting system metrics:", err.message);
      }
    }
  );
}

export function getSystemMetrics(range = 'daily') {
  return new Promise((resolve, reject) => {
    let query = '';
    let params = [];
    const now = Date.now();

    if (range === 'weekly') {
      // Last 7 days, grouped by ~15 minutes (900000ms)
      const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
      query = `
        SELECT 
          AVG(cpu_usage) as cpu_usage, 
          AVG(ram_usage) as ram_usage, 
          AVG(cpu_temp) as cpu_temp, 
          (timestamp / 900000) * 900000 as timestamp
        FROM system_metrics
        WHERE timestamp > ?
        GROUP BY timestamp / 900000
        ORDER BY timestamp ASC
      `;
      params = [oneWeekAgo];
    } else if (range === 'daily') {
      // Last 24 hours, grouped by ~2 minutes (120000ms)
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      query = `
        SELECT 
          AVG(cpu_usage) as cpu_usage, 
          AVG(ram_usage) as ram_usage, 
          AVG(cpu_temp) as cpu_temp, 
          (timestamp / 120000) * 120000 as timestamp
        FROM system_metrics
        WHERE timestamp > ?
        GROUP BY timestamp / 120000
        ORDER BY timestamp ASC
      `;
      params = [oneDayAgo];
    } else {
      // Default / Raw fallback (last 1000 points)
      query = `
        SELECT * FROM system_metrics
        ORDER BY timestamp DESC
        LIMIT 1000
      `;
      params = [];
    }

    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        if (!range || range === 'raw') {
          resolve(rows);
        } else {
          // For aggregated queries, we ordered ASC for graph, raw was DESC
          resolve(rows);
        }
      }
    });
  });
}

export { db };
