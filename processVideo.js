import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import configManager, { VIDEO_OUTPUT_DIR, EVIDENCE_DIR } from "./configManager.js";
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

    // Register with registry
    import("./ffmpegRegistry.js").then(({ registerFFmpegProcess, unregisterFFmpegProcess }) => {
      registerFFmpegProcess(ffmpegTrimCmd.pid, 'video_trim', `ffmpeg ${cmd_option.join(' ')}`, ffmpegTrimCmd);

      ffmpegTrimCmd.on("close", (code) => {
        unregisterFFmpegProcess(ffmpegTrimCmd.pid);
        console.log(`[trimVideo] FFmpeg process for ${mode} exited with code ${code}`);
        if (code !== 0) {
          return reject(`Error trimming the video (exit code ${code}).`);
        }
        resolve();
      });
    }).catch(() => {
      // Fallback if import fails (shouldn't happen)
      ffmpegTrimCmd.on("close", (code) => {
        console.log(`[trimVideo] FFmpeg process for ${mode} exited with code ${code}`);
        if (code !== 0) {
          return reject(`Error trimming the video (exit code ${code}).`);
        }
        resolve();
      });
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

    // Register with registry
    import("./ffmpegRegistry.js").then(({ registerFFmpegProcess, unregisterFFmpegProcess }) => {
      registerFFmpegProcess(ffmpegCmd.pid, 'video_segment', `ffmpeg ${cmd_option.join(' ')}`, ffmpegCmd);

      ffmpegCmd.on("close", (code) => {
        unregisterFFmpegProcess(ffmpegCmd.pid);
        console.log(`[extractPartialSegment] FFmpeg process exited with code ${code}`);
        if (code !== 0) {
          return reject(`Error extracting partial segment (exit code ${code}).`);
        }
        resolve();
      });
    }).catch(() => {
      ffmpegCmd.on("close", (code) => {
        console.log(`[extractPartialSegment] FFmpeg process exited with code ${code}`);
        if (code !== 0) {
          return reject(`Error extracting partial segment (exit code ${code}).`);
        }
        resolve();
      });
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
    VIDEO_OUTPUT_DIR,
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

      // Register with registry
      import("./ffmpegRegistry.js").then(({ registerFFmpegProcess, unregisterFFmpegProcess }) => {
        registerFFmpegProcess(ffmpeg.pid, 'video_process_dahua', `ffmpeg ${args.join(' ')}`, ffmpeg);

        ffmpeg.stderr.on('data', (data) => { /* console.log(`[Dahua FFmpeg Error]: ${data}`); */ });
        ffmpeg.on('close', (code) => {
          unregisterFFmpegProcess(ffmpeg.pid);
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exited with code ${code}`));
        });
      }).catch(() => {
        ffmpeg.stderr.on('data', (data) => { /* console.log(`[Dahua FFmpeg Error]: ${data}`); */ });
        ffmpeg.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exited with code ${code}`));
        });
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
      const destinationPath = path.join(configManager.baseVideoDirectory, EVIDENCE_DIR, outputVideoFile);
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
      const trimmedFirstFile = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, `trimmed_start_${Date.now()}.mp4`);
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
      const trimmedLastFile = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, `trimmed_end_${Date.now()}.mp4`);
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
  const outputVideoPath = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, outputVideoFile);

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

  const filelistPath = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, `video_concat_list_${Date.now()}.txt`);
  fs.writeFileSync(filelistPath, filteredFileList.map((f) => `file '${f}'`).join("\n"));

  const ffmpegCmd = spawn("ffmpeg", [
    "-f", "concat", "-safe", "0", "-i", filelistPath, "-y", "-c", "copy", "-movflags", "+faststart", outputVideoPath,
  ]);

  // Register with registry
  import("./ffmpegRegistry.js").then(({ registerFFmpegProcess, unregisterFFmpegProcess }) => {
    registerFFmpegProcess(ffmpegCmd.pid, 'video_concat', `ffmpeg concat ${outputVideoPath}`, ffmpegCmd);

    ffmpegCmd.stdout.pipe(process.stdout);
    ffmpegCmd.stderr.pipe(process.stderr);

    ffmpegCmd.on("close", (code) => {
      unregisterFFmpegProcess(ffmpegCmd.pid);
      console.log(`[process_video] FFmpeg process exited with code ${code}`);
      if (code !== 0) {
        return res.status(500).send("Error processing the video.");
      }
      if (storeEvidence) {
        const sourcePath = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, outputVideoFile);
        const destinationPath = path.join(configManager.baseVideoDirectory, EVIDENCE_DIR, outputVideoFile);
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
  }).catch(() => {
    // Fallback
    ffmpegCmd.stdout.pipe(process.stdout);
    ffmpegCmd.stderr.pipe(process.stderr);

    ffmpegCmd.on("close", (code) => {
      console.log(`[process_video] FFmpeg process exited with code ${code}`);
      if (code !== 0) {
        return res.status(500).send("Error processing the video.");
      }
      // ... (rest of logic duplicated for fallback safety, simplified here as catch block is rare)
      // Ideally extraction to function would be better but keeping inline for complexity limits
      res.json({
        outputFile: outputVideoFile,
        from: new Date(parseInt(startTime)).toLocaleTimeString(),
        to: new Date(parseInt(endTime)).toLocaleTimeString(),
        fromEpoch: parseInt(startTime),
        toEpoch: parseInt(endTime),
      });
      trimmed_files.forEach(f => fs.unlink(f, () => { }));
      fs.unlink(filelistPath, () => { });
    });
  });
}

// -----------------------------------------------------------------------------
// NEW STREAMING VIDEO PROCESSING
// -----------------------------------------------------------------------------

async function streamDahuaVideo(req, res, channelConfig, requestedStartTime, requestedEndTime, sessionId = null) {
  console.log(`[streamDahuaVideo] Processing Dahua video for channel ${channelConfig.channel}, Session: ${sessionId || 'none'}`);
  const startDate = new Date(parseInt(requestedStartTime));
  const endDate = new Date(parseInt(requestedEndTime));
  const startStr = formatDahuaTime(startDate);
  const endStr = formatDahuaTime(endDate);

  let playbackUrl = channelConfig.playbackUrl;
  if (!playbackUrl) return res.status(500).send("Dahua playback URL not configured.");

  const separator = playbackUrl.includes('?') ? '&' : '?';
  const fullUrl = `${playbackUrl}${separator}starttime=${startStr}&endtime=${endStr}`;
  console.log(`[streamDahuaVideo] RTSP URL: ${fullUrl}`);

  // Handle audio: Audio is AAC (LC) 16000 Hz mono from RTSP
  // Need to resample to 44100 Hz and convert to stereo for better web compatibility
  // Use fragmented MP4 with proper audio track inclusion
  const args = [
    "-y", "-v", "warning",
    "-rtsp_transport", "tcp",
    "-i", fullUrl,
    "-map", "0:v", // Map video stream
    "-map", "0:a", // Map audio stream (required - will fail if no audio)
    "-c:v", "copy", // Copy video codec
    "-c:a", "aac", // Encode audio to AAC
    "-b:a", "128k", // Audio bitrate
    "-ar", "44100", // Resample to 44100 Hz (from 16000 Hz)
    "-ac", "2", // Convert mono to stereo (duplicate mono channel to create stereo)
    "-af", "aresample=44100", // Resample audio (simplified filter)
    "-avoid_negative_ts", "make_zero", // Handle timestamp issues
    "-fflags", "+genpts", // Generate presentation timestamps for better seeking
    "-movflags", "frag_keyframe+faststart+default_base_moof", // Fragmented MP4 with faststart to include track info early
    "-f", "mp4", "-"
  ];

  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const ffmpeg = spawn("ffmpeg", args);

  import("./ffmpegRegistry.js").then(({ registerFFmpegProcess, unregisterFFmpegProcess, storeProcessInstance }) => {
    registerFFmpegProcess(ffmpeg.pid, 'stream_dahua', `ffmpeg ${args.join(' ')}`, ffmpeg, sessionId);
    storeProcessInstance(ffmpeg.pid, ffmpeg);

    ffmpeg.stdout.pipe(res);
    
    // Enhanced logging to debug audio issues
    let stderrBuffer = '';
    let audioStreamDetected = false;
    let audioOutputDetected = false;
    
    ffmpeg.stderr.on('data', (data) => {
      const message = data.toString();
      stderrBuffer += message;
      
      const lowerMessage = message.toLowerCase();
      
      // Check for input audio stream
      if (lowerMessage.includes('stream #0') && lowerMessage.includes('audio')) {
        audioStreamDetected = true;
        console.log(`[streamDahuaVideo] ✅ Input audio stream detected: ${message.trim()}`);
      }
      
      // Check for output audio stream
      if (lowerMessage.includes('stream #') && lowerMessage.includes('audio') && lowerMessage.includes('->')) {
        audioOutputDetected = true;
        console.log(`[streamDahuaVideo] ✅ Output audio stream created: ${message.trim()}`);
      }
      
      // Log all audio/stream related messages
      if (lowerMessage.includes('audio') || 
          lowerMessage.includes('stream') || 
          lowerMessage.includes('error') || 
          lowerMessage.includes('warning') ||
          lowerMessage.includes('input') ||
          lowerMessage.includes('output') ||
          lowerMessage.includes('mapping')) {
        console.log(`[streamDahuaVideo] FFmpeg: ${message.trim()}`);
      }
    });
    
    // On process start, log initial stream info
    ffmpeg.on('spawn', () => {
      console.log(`[streamDahuaVideo] FFmpeg process started with args: ${args.join(' ')}`);
    });
    
    // Check audio status after a short delay
    setTimeout(() => {
      if (!audioStreamDetected) {
        console.warn(`[streamDahuaVideo] ⚠️  No input audio stream detected after 2 seconds`);
      }
      if (!audioOutputDetected && audioStreamDetected) {
        console.error(`[streamDahuaVideo] ❌ Input audio detected but no output audio stream created!`);
      }
    }, 2000);
    ffmpeg.on('close', (code) => {
      unregisterFFmpegProcess(ffmpeg.pid);
      console.log(`[streamDahuaVideo] FFmpeg exited with code ${code}`);
    });
    req.on('close', () => {
      unregisterFFmpegProcess(ffmpeg.pid);
      ffmpeg.kill();
    });
  });
}

async function streamStandardVideo(req, res, channelNumber, startTime, endTime, sessionId = null) {
  const startTimeStr = new Date(parseInt(startTime)).toLocaleTimeString();
  const endTimeStr = new Date(parseInt(endTime)).toLocaleTimeString();
  console.log(`[streamStandardVideo] Start. Channel: ${channelNumber}, Start: ${startTimeStr}, End: ${endTimeStr}, Session: ${sessionId || 'none'}`);

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
      const partialOutputFile = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, `partial_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
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
        const trimmedFirstFile = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, `trimmed_start_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
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
        const trimmedLastFile = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, `trimmed_end_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
        try {
          await trimVideo(fileList[fileList.length - 1], trim_length, trimmedLastFile, "end_trim");
          fileList[fileList.length - 1] = trimmedLastFile;
          trimCleanupList.push(trimmedLastFile);
        } catch (e) { }
      }
    }

    const filelistPath = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, `stream_concat_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
    const validFiles = [];
    for (const f of fileList) {
      if (await fileExists(f) && (await fs.promises.stat(f)).size > 10000) validFiles.push(f);
    }
    fs.writeFileSync(filelistPath, validFiles.map((f) => `file '${f}'`).join("\n"));
    trimCleanupList.push(filelistPath);

    console.log(`[streamStandardVideo] Spawning FFmpeg concat stream...`);
    res.writeHead(200, { "Content-Type": "video/mp4", "Cache-Control": "no-cache", "Connection": "keep-alive" });

    const ffmpeg = spawn("ffmpeg", [
      "-f", "concat", "-safe", "0", "-i", filelistPath, "-nostdin",
      "-map", "0", // Map all streams (video + audio if present)
      "-c:v", "copy", // Copy video codec
      "-c:a", "copy", // Copy audio codec (preserve original audio)
      "-movflags", "frag_keyframe+faststart+default_base_moof", // Use faststart instead of empty_moov for audio track detection
      "-f", "mp4", "-"
    ]);

    import("./ffmpegRegistry.js").then(({ registerFFmpegProcess, unregisterFFmpegProcess, storeProcessInstance }) => {
      registerFFmpegProcess(ffmpeg.pid, 'stream_standard', `ffmpeg concat stream`, ffmpeg, sessionId);
      storeProcessInstance(ffmpeg.pid, ffmpeg);

      ffmpeg.stdout.pipe(res);
      
      // Enhanced logging to detect audio in pre-recorded files
      let audioDetected = false;
      ffmpeg.stderr.on('data', (data) => {
        const message = data.toString();
        const lowerMessage = message.toLowerCase();
        
        // Log errors and warnings
        if (lowerMessage.includes('error') || lowerMessage.includes('warning')) {
          console.log(`[streamStandardVideo] FFmpeg: ${message.trim()}`);
        }
        
        // Check for audio stream detection
        if (lowerMessage.includes('stream #') && lowerMessage.includes('audio')) {
          audioDetected = true;
          console.log(`[streamStandardVideo] ✅ Audio stream detected in pre-recorded files: ${message.trim()}`);
        }
      });
      
      // Check audio status after a delay
      setTimeout(() => {
        if (!audioDetected) {
          console.warn(`[streamStandardVideo] ⚠️  No audio stream detected in pre-recorded files after 2 seconds`);
        }
      }, 2000);
      ffmpeg.on('close', (code) => {
        unregisterFFmpegProcess(ffmpeg.pid);
        console.log(`[streamStandardVideo] Stream ended with code ${code}`);
        trimCleanupList.forEach(f => { fs.unlink(f, (err) => { }); });
      });

      const killActiveStream = () => {
        if (!ffmpeg.killed) {
          console.log(`[streamStandardVideo] Client disconnected. Killing ffmpeg (PID: ${ffmpeg.pid}).`);
          unregisterFFmpegProcess(ffmpeg.pid);
          ffmpeg.kill('SIGKILL'); // Force kill
        }
      };

      res.on('close', killActiveStream);
      req.on('close', killActiveStream);
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
    const partialOutputFile = path.join(configManager.baseVideoDirectory, VIDEO_OUTPUT_DIR, `partial_${Date.now()}.mp4`);
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

  // Get session ID from request (set by authenticateSession middleware)
  const sessionId = req.sessionId || null;
  
  // Kill any previous streams for this session BEFORE starting a new one
  // Do this synchronously to prevent multiple streams from starting
  if (sessionId) {
    try {
      const { killSessionStreams } = await import("./ffmpegRegistry.js");
      const killedPids = killSessionStreams(sessionId);
      if (killedPids.length > 0) {
        console.log(`[streamVideo] Killed ${killedPids.length} previous stream(s) for session ${sessionId}`);
        // Small delay to ensure processes are fully terminated
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (err) {
      console.error("[streamVideo] Error killing previous streams:", err);
    }
  }
  
  // Handle client disconnect - kill stream immediately
  req.on('close', () => {
    console.log(`[streamVideo] Client disconnected, stream will be cleaned up by process handlers`);
  });

  const recordingConfigurations = await getRecordingConfigurations();
  const channelConfig = recordingConfigurations.find(c => String(c.channel) === String(channelNumber));

  if (channelConfig && channelConfig.type === 'dahua') {
    return streamDahuaVideo(req, res, channelConfig, startTime, endTime, sessionId);
  } else {
    return streamStandardVideo(req, res, channelNumber, startTime, endTime, sessionId);
  }
}

export default { getVideo, getLiveVideo, streamVideo, process_video };

