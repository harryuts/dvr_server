import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import configManager from "./configManager.js";
import { db } from "./dbFunctions.js";
import { getRecordingStatus } from "./recording.js";
import { fileURLToPath } from "url";
import { getRecordingConfigurations } from "./configManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
//======================================================
// Access baseVideoDirectory dynamically from configManager
const CAPTURE_SEGMENT_DURATION = configManager.segmentDuration;
const ERROR_LOG_FILE = path.join(__dirname, "video_processing_error.log");
//======================================================

// Helper to check if file exists
async function fileExists(path) {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Logs error details to both console and file
 */
function logError(message, details = {}) {
  const timestamp = new Date().toISOString();
  // Console log
  console.error(`[ERROR] ${message}`, details);
  // File log
  const logLine = `\n${"=".repeat(80)}\n[${timestamp}] ${message}\n${JSON.stringify(details, null, 2)}\n`;
  fs.appendFileSync(ERROR_LOG_FILE, logLine, "utf8");
}

/**
 * Trims a video file either from the start or the end based on the given mode.
 */
function trimVideo(inputFile, offset, outputFile, mode) {
  return new Promise((resolve, reject) => {
    let cmd_option;

    if (mode === "start_trim") {
      cmd_option = [
        "-i", inputFile, "-ss", String(offset), "-c", "copy", "-y", outputFile,
      ];
    } else if (mode === "end_trim") {
      cmd_option = [
        "-i", inputFile, "-t", String(offset), "-c", "copy", "-y", outputFile,
      ];
    }

    const ffmpegTrimCmd = spawn("ffmpeg", cmd_option);

    ffmpegTrimCmd.on("close", (code) => {
      console.log(`[trimVideo] FFmpeg process for ${mode} exited with code ${code}`);
      if (code !== 0) {
        return reject(`Error trimming the video (exit code ${code}).`);
      }
      resolve();
    });
  });
}

/**
 * Extracts a partial segment from an in-progress recording file.
 */
function extractPartialSegment(inputFile, segmentStartTime, requestedEndTime, outputFile) {
  return new Promise((resolve, reject) => {
    const durationSeconds = Math.floor((requestedEndTime - segmentStartTime) / 1000);
    if (durationSeconds <= 0) {
      return reject("Invalid duration for partial segment extraction.");
    }

    console.log(`Extracting partial segment: ${durationSeconds}s from ${inputFile}`);

    const cmd_option = [
      "-i", inputFile, "-t", String(durationSeconds), "-c", "copy", "-movflags", "+faststart", "-y", outputFile,
    ];

    const ffmpegCmd = spawn("ffmpeg", cmd_option);

    ffmpegCmd.on("close", (code) => {
      console.log(`[extractPartialSegment] FFmpeg process exited with code ${code}`);
      if (code !== 0) {
        return reject(`Error extracting partial segment (exit code ${code}).`);
      }
      resolve();
    });
  });
}

/**
 * Formats a Date object to the string format required by Dahua NVR (yyyy_MM_dd_HH_mm_ss)
 */
function formatDahuaTime(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${year}_${month}_${day}_${hour}_${minute}_${second}`;
}

// -----------------------------------------------------------------------------
// LEGACY FILE-BASED PROCESSING (Restored for compat)
// -----------------------------------------------------------------------------

/**
 * Handles video retrieval for Dahua channels by downloading the file from NVR (Legacy behavior)
 */
async function processDahuaVideo(req, res, channelConfig, requestedStartTime, requestedEndTime, storeEvidence, orderId) {
  console.log(`[processDahuaVideo] Processing Dahua video for channel ${channelConfig.channel}`);

  const startDate = new Date(requestedStartTime);
  const endDate = new Date(requestedEndTime);

  const startStr = formatDahuaTime(startDate);
  const endStr = formatDahuaTime(endDate);

  let playbackUrl = channelConfig.playbackUrl;
  if (!playbackUrl) {
    return res.status(500).send("Dahua playback URL not configured for this channel.");
  }

  const separator = playbackUrl.includes('?') ? '&' : '?';
  const fullUrl = `${playbackUrl}${separator}starttime=${startStr}&endtime=${endStr}`;

  console.log(`[processDahuaVideo] RTSP URL: ${fullUrl}`);

  // Output file setup
  let outputVideoFile = `dahua_${channelConfig.channel}_${Date.now()}.mp4`;
  if (storeEvidence && orderId) {
    outputVideoFile = `cctv_${orderId}.mp4`;
  }
  const outputVideoPath = path.join(
    configManager.baseVideoDirectory,
    "video_output",
    outputVideoFile
  );

  // Spawn FFmpeg to download the stream
  const args = [
    "-y", "-v", "error", "-rtsp_transport", "tcp", "-i", fullUrl,
    "-c:v", "copy", "-c:a", "aac",
    "-movflags", "+faststart",
    outputVideoPath
  ];

  console.log(`[processDahuaVideo] Spawning FFmpeg...`);

  try {
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", args);
      ffmpeg.stderr.on('data', (data) => { /* console.log(`[Dahua FFmpeg Error]: ${data}`); */ });
      ffmpeg.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });

    // Check if file exists and has content
    const stats = await fs.promises.stat(outputVideoPath).catch(() => null);
    if (!stats || stats.size === 0) {
      console.error(`[processDahuaVideo] Empty or missing file: ${outputVideoFile}`);
      if (stats) await fs.promises.unlink(outputVideoPath).catch(() => { });
      return res.status(404).json({ error: "No video found for this time range." });
    }

    console.log(`[processDahuaVideo] Download complete: ${outputVideoFile} (${stats.size} bytes)`);

    if (storeEvidence) {
      const destinationPath = path.join(configManager.baseVideoDirectory, "evidence", outputVideoFile);
      fs.copyFile(outputVideoPath, destinationPath, (err) => {
        if (err) console.log("evidence file copy error");
        else console.log("File was copied successfully");
      });
    }

    res.json({
      outputFile: outputVideoFile,
      from: new Date(requestedStartTime).toLocaleTimeString(),
      to: new Date(requestedEndTime).toLocaleTimeString(),
      fromEpoch: requestedStartTime,
      toEpoch: requestedEndTime,
    });

  } catch (err) {
    console.error(`[processDahuaVideo] Error: ${err.message}`);
    logError("Dahua video processing failed", {
      error: err.message,
      channel: channelConfig.channel,
      url: fullUrl
    });
    res.status(500).send("Error retrieving video from NVR.");
  }
}

/**
 * Legacy process_video for Standard channels (Concatenate to file)
 */
export async function process_video(
  res,
  files,
  startTime,
  endTime,
  storeEvidence,
  orderId,
  inProgressSegment = null
) {
  const startTimeStr = new Date(parseInt(startTime)).toLocaleTimeString();
  const endTimeStr = new Date(parseInt(endTime)).toLocaleTimeString();
  console.log(`[process_video] Start. Files: ${files.length}, Start: ${startTimeStr}, End: ${endTimeStr}`);
  const trimmed_files = [];
  let fileList = files.map((f) => f.filename);

  if (inProgressSegment) {
    fileList.push(inProgressSegment.filename);
    files.push(inProgressSegment);
  }

  // Trim Start
  if (files.length > 0 && parseInt(startTime) > parseInt(files[0].start_time)) {
    const trim_length = Math.floor((parseInt(startTime) - parseInt(files[0].start_time)) / 1000);
    if (trim_length > 0) {
      const trimmedFirstFile = path.join(configManager.baseVideoDirectory, "video_output", `trimmed_start_${Date.now()}.mp4`);
      trimmed_files.push(trimmedFirstFile);
      try {
        await trimVideo(fileList[0], trim_length, trimmedFirstFile, "start_trim");
        fileList[0] = trimmedFirstFile;
      } catch (error) {
        console.error("Error trimming start:", error);
      }
    }
  }

  // Trim End
  if (files.length > 0 && parseInt(endTime) < parseInt(files[files.length - 1].end_time)) {
    let trim_length;
    if (files.length === 1 && parseInt(startTime) > parseInt(files[0].start_time)) {
      trim_length = Math.floor((parseInt(endTime) - parseInt(startTime)) / 1000);
    } else {
      trim_length = Math.floor((parseInt(endTime) - parseInt(files[files.length - 1].start_time)) / 1000);
    }

    if (trim_length > 0) {
      const trimmedLastFile = path.join(configManager.baseVideoDirectory, "video_output", `trimmed_end_${Date.now()}.mp4`);
      trimmed_files.push(trimmedLastFile);
      try {
        await trimVideo(fileList[fileList.length - 1], trim_length, trimmedLastFile, "end_trim");
        fileList[fileList.length - 1] = trimmedLastFile;
      } catch (error) {
        console.error("Error trimming end:", error);
      }
    }
  }

  // Concatenate
  let outputVideoFile = `output_${Date.now()}.mp4`;
  if (storeEvidence && orderId) {
    outputVideoFile = `cctv_${orderId}.mp4`;
  }
  const outputVideoPath = path.join(configManager.baseVideoDirectory, "video_output", outputVideoFile);

  const validFiles = await Promise.all(fileList.map(async (file) => {
    try {
      const stats = await fs.promises.stat(file);
      return stats.size > 100000 ? file : null;
    } catch { return null; }
  }));
  const filteredFileList = validFiles.filter(f => f !== null);

  if (filteredFileList.length === 0) {
    return res.status(404).send("No video found for the specified time range.");
  }

  const filelistPath = path.join(configManager.baseVideoDirectory, "video_output", `video_concat_list_${Date.now()}.txt`);
  fs.writeFileSync(filelistPath, filteredFileList.map((f) => `file '${f}'`).join("\n"));

  const ffmpegCmd = spawn("ffmpeg", [
    "-f", "concat", "-safe", "0", "-i", filelistPath, "-y", "-c", "copy", "-movflags", "+faststart", outputVideoPath,
  ]);

  ffmpegCmd.stdout.pipe(process.stdout);
  ffmpegCmd.stderr.pipe(process.stderr);

  ffmpegCmd.on("close", (code) => {
    console.log(`[process_video] FFmpeg process exited with code ${code}`);
    if (code !== 0) {
      return res.status(500).send("Error processing the video.");
    }
    if (storeEvidence) {
      const sourcePath = path.join(configManager.baseVideoDirectory, "video_output", outputVideoFile);
      const destinationPath = path.join(configManager.baseVideoDirectory, "evidence", outputVideoFile);
      fs.copyFile(sourcePath, destinationPath, (err) => {
        if (err) console.log("evidence file copy error");
      });
    }
    res.json({
      outputFile: outputVideoFile,
      from: new Date(parseInt(startTime)).toLocaleTimeString(),
      to: new Date(parseInt(endTime)).toLocaleTimeString(),
      fromEpoch: parseInt(startTime),
      toEpoch: parseInt(endTime),
    });

    // Cleanup
    trimmed_files.forEach(f => fs.unlink(f, () => { }));
    fs.unlink(filelistPath, () => { });
  });
}

// -----------------------------------------------------------------------------
// NEW STREAMING VIDEO PROCESSING
// -----------------------------------------------------------------------------

async function streamDahuaVideo(req, res, channelConfig, requestedStartTime, requestedEndTime) {
  console.log(`[streamDahuaVideo] Processing Dahua video for channel ${channelConfig.channel}`);
  const startDate = new Date(parseInt(requestedStartTime));
  const endDate = new Date(parseInt(requestedEndTime));
  const startStr = formatDahuaTime(startDate);
  const endStr = formatDahuaTime(endDate);

  let playbackUrl = channelConfig.playbackUrl;
  if (!playbackUrl) return res.status(500).send("Dahua playback URL not configured.");

  const separator = playbackUrl.includes('?') ? '&' : '?';
  const fullUrl = `${playbackUrl}${separator}starttime=${startStr}&endtime=${endStr}`;
  console.log(`[streamDahuaVideo] RTSP URL: ${fullUrl}`);

  const args = [
    "-y", "-v", "error", "-rtsp_transport", "tcp", "-i", fullUrl,
    "-c:v", "copy", "-c:a", "aac",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "-"
  ];

  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const ffmpeg = spawn("ffmpeg", args);
  ffmpeg.stdout.pipe(res);
  ffmpeg.stderr.on('data', () => { });
  ffmpeg.on('close', (code) => console.log(`[streamDahuaVideo] FFmpeg exited with code ${code}`));
  req.on('close', () => ffmpeg.kill());
}

async function streamStandardVideo(req, res, channelNumber, startTime, endTime) {
  const startTimeStr = new Date(parseInt(startTime)).toLocaleTimeString();
  const endTimeStr = new Date(parseInt(endTime)).toLocaleTimeString();
  console.log(`[streamStandardVideo] Start. Channel: ${channelNumber}, Start: ${startTimeStr}, End: ${endTimeStr}`);

  try {
    const query = `SELECT filename, start_time, end_time FROM video_segments WHERE channel_number = ? AND start_time < ? AND end_time > ? ORDER BY start_time ASC`;
    const rows = await new Promise((resolve, reject) => {
      db.all(query, [channelNumber, endTime, startTime], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    let fileList = rows.map((f) => f.filename);
    let filesMetadata = rows;
    const trimCleanupList = [];

    const recordingStatus = getRecordingStatus(channelNumber);
    if (recordingStatus.isRecording && recordingStatus.currentSegmentFile && recordingStatus.currentSegmentStartTime && endTime > recordingStatus.currentSegmentStartTime) {
      const partialOutputFile = path.join(configManager.baseVideoDirectory, "video_output", `partial_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
      try {
        if (await fileExists(recordingStatus.currentSegmentFile)) {
          await extractPartialSegment(recordingStatus.currentSegmentFile, recordingStatus.currentSegmentStartTime, endTime, partialOutputFile);
          fileList.push(partialOutputFile);
          filesMetadata.push({ filename: partialOutputFile, start_time: recordingStatus.currentSegmentStartTime, end_time: endTime });
          trimCleanupList.push(partialOutputFile);
        }
      } catch (e) { console.error("Error extracting partial segment for stream:", e); }
    }

    if (fileList.length === 0) return res.status(404).send("No video found for streaming.");

    // Trim Start
    if (filesMetadata.length > 0 && parseInt(startTime) > parseInt(filesMetadata[0].start_time)) {
      const firstFile = filesMetadata[0];
      const trim_length = Math.floor((parseInt(startTime) - parseInt(firstFile.start_time)) / 1000);
      if (trim_length > 0) {
        const trimmedFirstFile = path.join(configManager.baseVideoDirectory, "video_output", `trimmed_start_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
        try {
          await trimVideo(fileList[0], trim_length, trimmedFirstFile, "start_trim");
          fileList[0] = trimmedFirstFile;
          trimCleanupList.push(trimmedFirstFile);
        } catch (e) { }
      }
    }

    // Trim End
    if (filesMetadata.length > 0 && parseInt(endTime) < parseInt(filesMetadata[filesMetadata.length - 1].end_time)) {
      const lastFile = filesMetadata[filesMetadata.length - 1];
      let trim_length;
      if (filesMetadata.length === 1) {
        trim_length = Math.floor((parseInt(endTime) - parseInt(startTime)) / 1000);
      } else {
        trim_length = Math.floor((parseInt(endTime) - parseInt(lastFile.start_time)) / 1000);
      }

      if (trim_length > 0) {
        const trimmedLastFile = path.join(configManager.baseVideoDirectory, "video_output", `trimmed_end_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
        try {
          await trimVideo(fileList[fileList.length - 1], trim_length, trimmedLastFile, "end_trim");
          fileList[fileList.length - 1] = trimmedLastFile;
          trimCleanupList.push(trimmedLastFile);
        } catch (e) { }
      }
    }

    const filelistPath = path.join(configManager.baseVideoDirectory, "video_output", `stream_concat_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
    const validFiles = [];
    for (const f of fileList) {
      if (await fileExists(f) && (await fs.promises.stat(f)).size > 10000) validFiles.push(f);
    }
    fs.writeFileSync(filelistPath, validFiles.map((f) => `file '${f}'`).join("\n"));
    trimCleanupList.push(filelistPath);

    console.log(`[streamStandardVideo] Spawning FFmpeg concat stream...`);
    res.writeHead(200, { "Content-Type": "video/mp4", "Cache-Control": "no-cache", "Connection": "keep-alive" });

    const ffmpeg = spawn("ffmpeg", [
      "-f", "concat", "-safe", "0", "-i", filelistPath, "-nostdin", "-c", "copy",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", "-"
    ]);

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on('data', d => console.log(`[streamStandardVideo] FFmpeg Error: ${d}`));
    ffmpeg.on('close', (code) => {
      console.log(`[streamStandardVideo] Stream ended with code ${code}`);
      trimCleanupList.forEach(f => { fs.unlink(f, (err) => { }); });
    });

    const killActiveStream = () => {
      if (!ffmpeg.killed) {
        console.log(`[streamStandardVideo] Client disconnected. Killing ffmpeg (PID: ${ffmpeg.pid}).`);
        ffmpeg.kill('SIGKILL'); // Force kill
      }
    };

    res.on('close', killActiveStream);
    req.on('close', killActiveStream);

  } catch (err) {
    console.error("[streamStandardVideo] Error:", err);
    if (!res.headersSent) res.status(500).send("Streaming error");
  }
}

// -----------------------------------------------------------------------------
// PUBLIC API FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * ORIGINAL getVideo: Returns outputFile (Legacy)
 */
export async function getVideo(req, res) {
  const { startTime, endTime, channelNumber, storeEvidence, orderId } = req.query;
  let requestedStartTime = parseInt(startTime);
  let requestedEndTime = parseInt(endTime);
  const now = Date.now();
  const bufferMs = 3000;
  if (requestedStartTime > now - bufferMs) requestedStartTime = now - bufferMs;

  if (requestedStartTime >= requestedEndTime) {
    return res.status(400).json({ error: "Start time must be before end time." });
  }

  const recordingConfigurations = await getRecordingConfigurations();
  const channelConfig = recordingConfigurations.find(c => String(c.channel) === String(channelNumber));

  if (channelConfig && channelConfig.type === 'dahua') {
    return processDahuaVideo(req, res, channelConfig, requestedStartTime, requestedEndTime, storeEvidence, orderId);
  }

  const recordingStatus = getRecordingStatus(channelNumber);
  let inProgressSegment = null;
  if (recordingStatus.isRecording && recordingStatus.currentSegmentFile && recordingStatus.currentSegmentStartTime && requestedEndTime > recordingStatus.currentSegmentStartTime) {
    const partialOutputFile = path.join(baseVideoDirectory, "video_output", `partial_${Date.now()}.mp4`);
    try {
      await extractPartialSegment(recordingStatus.currentSegmentFile, recordingStatus.currentSegmentStartTime, requestedEndTime, partialOutputFile);
      inProgressSegment = { filename: partialOutputFile, start_time: recordingStatus.currentSegmentStartTime, end_time: requestedEndTime };
    } catch (error) { console.error("Error extracting partial segment:", error); }
  }

  const query = `SELECT filename, start_time, end_time FROM video_segments WHERE channel_number = ? AND start_time < ? AND end_time > ? ORDER BY start_time ASC`;
  db.all(query, [channelNumber, requestedEndTime, requestedStartTime], (err, rows) => {
    if (err) return res.status(404).send("Unable to query database.");
    if (rows.length === 0 && !inProgressSegment) return res.status(404).send("No video found.");
    process_video(res, rows, requestedStartTime, requestedEndTime, storeEvidence, orderId, inProgressSegment);
  });
}

/**
 * NEW getLiveVideo: Returns streamUrl for instant playback
 */
export async function getLiveVideo(req, res) {
  const { startTime, endTime, channelNumber } = req.query;
  let requestedStartTime = parseInt(startTime);
  let requestedEndTime = parseInt(endTime);
  const now = Date.now();
  const bufferMs = 3000;
  if (requestedStartTime > now - bufferMs) requestedStartTime = now - bufferMs;

  // Check if content exists before returning stream URL (optional but good for UX)
  const recordingConfigurations = await getRecordingConfigurations();
  const channelConfig = recordingConfigurations.find(c => String(c.channel) === String(channelNumber));

  if (channelConfig && channelConfig.type === 'dahua') {
    const streamUrl = `/api/stream?channelNumber=${channelNumber}&startTime=${requestedStartTime}&endTime=${requestedEndTime}`;
    return res.json({
      streamUrl: streamUrl,
      from: new Date(requestedStartTime).toLocaleTimeString(),
      to: new Date(requestedEndTime).toLocaleTimeString(),
      fromEpoch: requestedStartTime,
      toEpoch: requestedEndTime,
    });
  }

  const query = `SELECT 1 FROM video_segments WHERE channel_number = ? AND start_time < ? AND end_time > ? LIMIT 1`;
  db.get(query, [channelNumber, requestedEndTime, requestedStartTime], (err, row) => {
    if (err) return res.status(500).send("DB Error");

    const recordingStatus = getRecordingStatus(channelNumber);
    const hasInProgress = (recordingStatus.isRecording && recordingStatus.currentSegmentStartTime && requestedEndTime > recordingStatus.currentSegmentStartTime);

    if (!row && !hasInProgress) return res.status(404).send("No video found.");

    const streamUrl = `/api/stream?channelNumber=${channelNumber}&startTime=${requestedStartTime}&endTime=${requestedEndTime}`;
    res.json({
      streamUrl: streamUrl,
      from: new Date(requestedStartTime).toLocaleTimeString(),
      to: new Date(requestedEndTime).toLocaleTimeString(),
      fromEpoch: requestedStartTime,
      toEpoch: requestedEndTime,
    });
  });
}

/**
 * Handles the actual streaming logic via pipe
 */
export async function streamVideo(req, res) {
  const { startTime, endTime, channelNumber } = req.query;
  if (!startTime || !endTime || !channelNumber) {
    return res.status(400).send("Missing parameters");
  }

  const recordingConfigurations = await getRecordingConfigurations();
  const channelConfig = recordingConfigurations.find(c => String(c.channel) === String(channelNumber));

  if (channelConfig && channelConfig.type === 'dahua') {
    return streamDahuaVideo(req, res, channelConfig, startTime, endTime);
  } else {
    return streamStandardVideo(req, res, channelNumber, startTime, endTime);
  }
}

export default { getVideo, getLiveVideo, streamVideo, process_video };

