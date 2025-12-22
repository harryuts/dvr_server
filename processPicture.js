import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import configManager from "./configManager.js";
import { db } from "./dbFunctions.js";
//======================================================
const baseVideoDirectory = configManager.baseVideoDirectory;
//======================================================

async function process_picture(res, files, channelNumber, startTime, orderId) {
  let fileList = files.map((f) => f.filename);
  const outputPicturePath = path.join(
    baseVideoDirectory,
    "video_output",
    `${orderId}.jpg`
  );
  let picturePosition = parseInt(
    (parseFloat(startTime) - files[0].start_time) / 1000
  );
  if (picturePosition === 0) picturePosition = 1;
  const ffmpegCmd = spawn("ffmpeg", [
    "-ss",
    `${picturePosition}`,
    "-i",
    fileList[0],
    "-y",
    "-vframes",
    "1",
    outputPicturePath,
  ]);

  //ffmpegCmd.stdout.pipe(process.stdout);
  //ffmpegCmd.stderr.pipe(process.stderr);

  ffmpegCmd.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).send("Error processing the picture.");
    }
    res.json({
      outputFile: outputPicturePath,
    });
  });
}

export async function getPicture(req, res) {
  const { startTime, channelNumber, orderId } = req.query;
  const query = `SELECT filename, start_time, end_time FROM video_segments WHERE channel_number = ? AND start_time <= ? AND end_time >= ? ORDER BY start_time ASC`;
  let files;
  db.all(
    query,
    [channelNumber, parseInt(startTime), parseInt(startTime)],
    (err, rows) => {
      if (err) {
        console.error(err.message);
        return;
      }
      files = rows;
      if (files.length === 0) {
        return res
          .status(404)
          .send("No picture found for the specified time range.");
      }
      process_picture(res, files, channelNumber, startTime, orderId);
    }
  );
}

export async function getJpegIot(req, res) {
  const { minutesFromNow, channelNumber } = req.query;

  // Generate a unique orderId internally
  const orderId = `jpeg_iot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Debug logging
  console.log("=== getJpegIot Debug Info ===");
  console.log("Request query params:", req.query);
  console.log("Parsed params:", { minutesFromNow, channelNumber, orderId });
  console.log("minutesFromNow type:", typeof minutesFromNow);
  console.log("channelNumber type:", typeof channelNumber);

  // Validate required parameters
  if (!minutesFromNow || !channelNumber) {
    console.log("❌ Missing required parameters");
    return res.status(400).json({
      error: "Missing required parameters",
      required: ["minutesFromNow", "channelNumber"],
      received: { minutesFromNow, channelNumber }
    });
  }

  // Convert minutes from now to timestamp
  const minutes = parseInt(minutesFromNow);
  if (isNaN(minutes) || minutes < 0) {
    console.log("❌ Invalid minutesFromNow parameter");
    return res.status(400).json({
      error: "Invalid minutesFromNow parameter",
      message: "Must be a positive number representing minutes from now",
      received: minutesFromNow
    });
  }

  const now = Date.now();
  const targetTime = now - (minutes * 60 * 1000); // Convert minutes to milliseconds

  console.log("Time calculation:");
  console.log("- Current server time:", new Date(now).toISOString());
  console.log("- Minutes from now:", minutes);
  console.log("- Target timestamp:", targetTime);
  console.log("- Target time:", new Date(targetTime).toISOString());

  const query = `SELECT filename, start_time, end_time FROM video_segments WHERE channel_number = ? AND start_time <= ? AND end_time >= ? ORDER BY start_time ASC`;
  console.log("SQL Query:", query);
  console.log("Query parameters:", [channelNumber, targetTime, targetTime]);

  let files;
  db.all(
    query,
    [channelNumber, targetTime, targetTime],
    (err, rows) => {
      if (err) {
        console.error("❌ Database error:", err.message);
        console.error("Full error:", err);
        return res.status(500).json({
          error: "Database error",
          message: err.message,
          query: query,
          params: [channelNumber, targetTime, targetTime]
        });
      }

      console.log("✅ Database query successful");
      console.log("Number of rows returned:", rows ? rows.length : 0);
      console.log("Rows:", rows);

      // Debug: Let's check what data exists in the database
      if (rows.length === 0) {
        console.log("🔍 Debugging: No data found, checking what exists in database...");

        // Check what channels exist
        db.all("SELECT DISTINCT channel_number FROM video_segments", [], (err, channelRows) => {
          if (err) {
            console.error("Error checking channels:", err);
          } else {
            console.log("Available channels:", channelRows);
          }
        });

        // Check what time ranges exist for the requested channel
        db.all("SELECT filename, start_time, end_time FROM video_segments WHERE channel_number = ? ORDER BY start_time DESC LIMIT 5", [channelNumber], (err, timeRows) => {
          if (err) {
            console.error("Error checking time ranges:", err);
          } else {
            console.log(`Recent segments for ${channelNumber}:`, timeRows);
            if (timeRows.length > 0) {
              console.log("Latest segment times:");
              timeRows.forEach((row, index) => {
                console.log(`  ${index + 1}. ${row.filename}: ${new Date(row.start_time).toISOString()} - ${new Date(row.end_time).toISOString()}`);
              });
            }
          }
        });

        // Check what time ranges exist overall
        db.all("SELECT channel_number, MIN(start_time) as min_time, MAX(end_time) as max_time FROM video_segments GROUP BY channel_number", [], (err, rangeRows) => {
          if (err) {
            console.error("Error checking time ranges:", err);
          } else {
            console.log("Time ranges by channel:", rangeRows);
            rangeRows.forEach(row => {
              console.log(`  ${row.channel_number}: ${new Date(row.min_time).toISOString()} to ${new Date(row.max_time).toISOString()}`);
            });
          }
        });
      }

      files = rows;
      if (files.length === 0) {
        console.log("❌ No video segments found for the specified time range");
        return res.status(404).json({
          error: "No picture found for the specified time range",
          searchParams: {
            channelNumber,
            minutesFromNow: minutes,
            targetTime: targetTime,
            targetTimeFormatted: new Date(targetTime).toISOString(),
            currentServerTime: new Date(now).toISOString()
          }
        });
      }

      console.log("✅ Found video segments, proceeding to process");
      process_jpeg_iot(res, files, channelNumber, targetTime, orderId);
    }
  );
}

async function process_jpeg_iot(res, files, channelNumber, startTime, orderId) {
  console.log("=== process_jpeg_iot Debug Info ===");
  console.log("Files received:", files);

  let fileList = files.map((f) => f.filename);
  console.log("File list:", fileList);

  const outputPicturePath = path.join(
    baseVideoDirectory,
    "video_output",
    `${orderId}_iot.jpg`
  );
  console.log("Output path:", outputPicturePath);

  let picturePosition = parseInt(
    (parseFloat(startTime) - files[0].start_time) / 1000
  );
  if (picturePosition === 0) picturePosition = 1;

  console.log("Picture position calculation:");
  console.log("- startTime:", startTime);
  console.log("- files[0].start_time:", files[0].start_time);
  console.log("- picturePosition:", picturePosition);

  const ffmpegArgs = [
    "-ss",
    `${picturePosition}`,
    "-i",
    fileList[0],
    "-y",
    "-vframes",
    "1",
    "-vf",
    "scale=800:480",
    "-q:v",
    "2",
    outputPicturePath,
  ];

  console.log("FFmpeg command:", "ffmpeg", ffmpegArgs.join(" "));

  const ffmpegCmd = spawn("ffmpeg", ffmpegArgs);

  // Capture FFmpeg output for debugging
  let ffmpegOutput = "";
  let ffmpegError = "";

  ffmpegCmd.stdout.on('data', (data) => {
    ffmpegOutput += data.toString();
  });

  ffmpegCmd.stderr.on('data', (data) => {
    ffmpegError += data.toString();
  });

  ffmpegCmd.on("close", (code) => {
    console.log("FFmpeg process closed with code:", code);
    console.log("FFmpeg stdout:", ffmpegOutput);
    console.log("FFmpeg stderr:", ffmpegError);

    if (code !== 0) {
      console.log("❌ FFmpeg failed with exit code:", code);
      return res.status(500).json({
        error: "Error processing the picture",
        ffmpegExitCode: code,
        ffmpegError: ffmpegError,
        ffmpegOutput: ffmpegOutput,
        command: "ffmpeg " + ffmpegArgs.join(" ")
      });
    }

    console.log("✅ FFmpeg completed successfully");

    // Read the generated image file and send it as inline response
    fs.readFile(outputPicturePath, (err, data) => {
      if (err) {
        console.log("❌ Error reading processed picture:", err);
        return res.status(500).json({
          error: "Error reading the processed picture",
          filePath: outputPicturePath,
          errorMessage: err.message
        });
      }

      console.log("✅ Successfully read image file, size:", data.length, "bytes");

      // Set appropriate headers for inline JPEG display
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache'
      });

      res.send(data);

      // Clean up the temporary file
      fs.unlink(outputPicturePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting temporary file:", unlinkErr);
        } else {
          console.log("✅ Temporary file cleaned up:", outputPicturePath);
        }
      });
    });
  });

  ffmpegCmd.on("error", (err) => {
    console.log("❌ FFmpeg spawn error:", err);
    return res.status(500).json({
      error: "Failed to start FFmpeg process",
      errorMessage: err.message
    });
  });
}

export async function getJpegLive(req, res) {
  const { channelNumber } = req.query;

  // Generate a unique orderId internally
  const orderId = `jpeg_live_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Debug logging (commented out to reduce log verbosity)
  // console.log("=== getJpegLive Debug Info ===");
  // console.log("Request query params:", req.query);
  // console.log("Parsed params:", { channelNumber, orderId });
  // console.log("channelNumber type:", typeof channelNumber);

  // Validate required parameters
  if (!channelNumber) {
    console.log("❌ Missing required parameter");
    return res.status(400).json({
      error: "Missing required parameter",
      required: ["channelNumber"],
      received: { channelNumber }
    });
  }

  // Get recording configurations to find the RTSP URL for this channel
  const recordingConfigs = await configManager.getRecordingConfigurations();
  const channelConfig = recordingConfigs.find(config => config.channel === channelNumber);

  if (!channelConfig) {
    console.log("❌ Channel not found in configuration");
    return res.status(404).json({
      error: "Channel not found",
      message: `Channel ${channelNumber} is not configured`,
      availableChannels: recordingConfigs.map(config => config.channel)
    });
  }

  // console.log("✅ Found channel configuration:", channelConfig);

  // Process the live capture
  process_jpeg_live(res, channelConfig.recordUrl, channelNumber, orderId);
}

async function process_jpeg_live(res, rtspUrl, channelNumber, orderId) {
  console.log("=== process_jpeg_live Debug Info ===");
  console.log("RTSP URL:", rtspUrl);
  console.log("Channel:", channelNumber);
  console.log("Order ID:", orderId);

  const outputPicturePath = path.join(
    baseVideoDirectory,
    "video_output",
    `${orderId}_live.jpg`
  );
  console.log("Output path:", outputPicturePath);

  // FFmpeg arguments for live capture from RTSP
  const ffmpegArgs = [
    "-hwaccel", "auto",        // Try to use hardware acceleration
    "-rtsp_transport", "tcp",  // Use TCP for more reliable connection
    "-i", rtspUrl,             // Input RTSP URL
    "-y",                      // Overwrite output file
    "-vframes", "1",           // Capture only 1 frame
    "-q:v", "2",               // High quality JPEG
    "-t", "5",                 // Timeout after 5 seconds
    outputPicturePath,
  ];

  console.log("FFmpeg command:", "ffmpeg", ffmpegArgs.join(" "));

  const ffmpegCmd = spawn("ffmpeg", ffmpegArgs);

  // Capture FFmpeg output for debugging
  let ffmpegOutput = "";
  let ffmpegError = "";

  ffmpegCmd.stdout.on('data', (data) => {
    ffmpegOutput += data.toString();
  });

  ffmpegCmd.stderr.on('data', (data) => {
    ffmpegError += data.toString();
  });

  ffmpegCmd.on("close", (code) => {
    console.log("FFmpeg process closed with code:", code);
    console.log("FFmpeg stdout:", ffmpegOutput);
    console.log("FFmpeg stderr:", ffmpegError);

    if (code !== 0) {
      console.log("❌ FFmpeg failed with exit code:", code);
      return res.status(500).json({
        error: "Error capturing live picture",
        ffmpegExitCode: code,
        ffmpegError: ffmpegError,
        ffmpegOutput: ffmpegOutput,
        command: "ffmpeg " + ffmpegArgs.join(" "),
        rtspUrl: rtspUrl
      });
    }

    console.log("✅ FFmpeg completed successfully");

    // Read the generated image file and send it as inline response
    fs.readFile(outputPicturePath, (err, data) => {
      if (err) {
        console.log("❌ Error reading captured picture:", err);
        return res.status(500).json({
          error: "Error reading the captured picture",
          filePath: outputPicturePath,
          errorMessage: err.message
        });
      }

      console.log("✅ Successfully read image file, size:", data.length, "bytes");

      // Set appropriate headers for inline JPEG display
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache'
      });

      res.send(data);

      // Clean up the temporary file
      fs.unlink(outputPicturePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting temporary file:", unlinkErr);
        } else {
          console.log("✅ Temporary file cleaned up:", outputPicturePath);
        }
      });
    });
  });

  ffmpegCmd.on("error", (err) => {
    console.log("❌ FFmpeg spawn error:", err);
    return res.status(500).json({
      error: "Failed to start FFmpeg process",
      errorMessage: err.message,
      rtspUrl: rtspUrl
    });
  });
}

export default { getPicture, getJpegIot, getJpegLive };
