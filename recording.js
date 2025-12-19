import { format } from "date-fns";
import path from "path";
import fs from "fs";
import { spawn, exec } from "child_process";
import os from "os";
import storageManager from "./storage-management.js"; // Import the storage management module
import configManager, { liveCaptureFrameRate } from "./configManager.js";

const CAPTURE_SEGMENT_DURATION = configManager.segmentDuration;
const baseVideoDirectory = configManager.baseVideoDirectory;
const MAX_STORAGE_PERCENTAGE = 90;
const recordingStatus = {};

export const getRecordingStatus = (channel_number) => {
  return (
    recordingStatus[channel_number] || {
      pid: null,
      isRecording: false,
      startTime: null,
      uptime: null,
      respawnCount: 0,
      currentSegmentFile: null,
    }
  );
};

const updateRecordingStatus = (channel_number, newStatus) => {
  recordingStatus[channel_number] = {
    ...recordingStatus[channel_number],
    ...newStatus,
  };
};

const startRecording = (
  db,
  spawnedProcesses,
  channel_number,
  CAPTURE_SOURCE_URL
) => {
  let segmentFile;
  let isRecording = true;
  let ffmpegProcess = null;
  let inactivityTimeout;
  const INACTIVITY_THRESHOLD = 90 * 1000;
  const KILL_TIMEOUT = 3000;
  let recordingStartTime;
  let respawnCounter = 0;

  console.log(`Start recording for channel ${channel_number}`);
  updateRecordingStatus(channel_number, {
    isRecording: true,
    startTime: new Date(),
    pid: null,
    uptime: "0s",
    respawnCount: respawnCounter,
    currentSegmentFile: null,
  });

  const channelDirectoryBase = path.join(
    baseVideoDirectory,
    `capture/${channel_number}`
  );

  const checkStorageAndCleanup = async () => {
    const usagePercentage = await storageManager.getDiskUsagePercentage(
      baseVideoDirectory
    );
    if (usagePercentage > MAX_STORAGE_PERCENTAGE) {
      console.warn(
        `Storage reaching ${usagePercentage.toFixed(
          2
        )}%. Initiating cleanup for channel ${channel_number}.`
      );
      await storageManager.deleteOldestFileAndDbEntry(
        db,
        channelDirectoryBase,
        channel_number
      );
    }
  };

  const storageCheckInterval = setInterval(checkStorageAndCleanup, 60 * 1000);

  const killFFmpeg = (pid) => {
    return new Promise((resolve, reject) => {
      const killCommand = `kill ${pid}`; //${signal}
      console.log(`[${channel_number}] Executing kill command: ${killCommand}`);
      exec(killCommand, (error, stdout, stderr) => {
        if (error) {
          console.error(
            `[${channel_number}] Error killing ffmpeg (PID: ${pid}): ${error}`
          );
          reject(error);
          return;
        }
        console.log(
          `[${channel_number}] Successfully sent kill to ffmpeg (PID: ${pid}).`
        );
        resolve();
      });
    });
  };

  const resetInactivityTimer = () => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(async () => {
      console.log(`[${channel_number}] Inactivity detected. Restarting...`);
      isRecording = false;
      updateRecordingStatus(channel_number, { isRecording: false });
      if (ffmpegProcess && !ffmpegProcess.killed) {
        try {
          await killFFmpeg(ffmpegProcess.pid);
          await new Promise((resolve) => setTimeout(resolve, KILL_TIMEOUT));
          if (ffmpegProcess && !ffmpegProcess.killed) {
            console.log(
              `[${channel_number}] ffmpeg (PID: ${ffmpegProcess.pid}) did not terminate after SIGTERM. Using SIGKILL.`
            );
            await killFFmpeg(ffmpegProcess.pid);
          }
        } catch (error) {
          console.error(
            `[${channel_number}] Error during kill process: ${error}`
          );
        }
      }
      setTimeout(restartRecording, 1000);
    }, INACTIVITY_THRESHOLD);
  };

  const spawnFFmpegProcess = async () => {
    const { getStopRecording } = await import("./scheduleRecording.js");
    const currentDate = new Date();
    const year = format(currentDate, "yyyy");
    const month = format(currentDate, "MM");
    const day = format(currentDate, "dd");
    const channelDirectoryPath = path.join(
      channelDirectoryBase,
      year,
      month,
      day
    );
    // Use strftime pattern for segment filenames (Shinobi-style)
    const segmentFileTemplate = path.join(
      channelDirectoryPath,
      `%Y-%m-%dT%H-%M-%S.mp4`
    );

    if (!fs.existsSync(channelDirectoryPath)) {
      fs.mkdirSync(channelDirectoryPath, { recursive: true, mode: 0o755 });
      console.log(`[${channel_number}] Directory created: ${channelDirectoryPath}`);
    }

    console.log(`[${channel_number}] Spawning ffmpeg process...`);
    let isKilling = false;
    const liveJpegPath = path.join(channelDirectoryBase, "live.jpg");
    let currentSegmentStartTime = null;

    ffmpegProcess = spawn("ffmpeg", [
      "-rtsp_transport",
      "tcp",
      "-i",
      CAPTURE_SOURCE_URL,
      // Recording output
      "-map", "0:v",
      "-c:v",
      "copy",
      "-an",
      "-f",
      "segment",
      "-segment_time",
      CAPTURE_SEGMENT_DURATION.toString(),
      "-segment_atclocktime",
      "1",
      "-strftime",
      "1",
      "-reset_timestamps",
      "1",
      "-segment_format_options",
      "movflags=+frag_keyframe+empty_moov",
      "-y",
      segmentFileTemplate,
      // Live JPEG output
      "-map", "0:v",
      "-f",
      "image2",
      "-update",
      "1",
      "-r",
      liveCaptureFrameRate.toString(),
      liveJpegPath,
    ]);
    spawnedProcesses.push(ffmpegProcess);
    console.log(
      `[${channel_number}] ffmpeg process spawned with PID: ${ffmpegProcess.pid}`
    );
    updateRecordingStatus(channel_number, {
      pid: ffmpegProcess.pid,
      isRecording: true,
      startTime: new Date(),
      respawnCount: respawnCounter,
    });
    recordingStartTime = new Date();
    resetInactivityTimer();

    ffmpegProcess.stdout.on("data", (data) => {
      resetInactivityTimer();
      updateUptime(channel_number, recordingStartTime);
    });

    ffmpegProcess.stderr.on("data", (data) => {
      resetInactivityTimer();
      const stderrOutput = data.toString();
      updateUptime(channel_number, recordingStartTime);

      // Detect new segment opening (strftime format: YYYY-MM-DDTHH-MM-SS.mp4)
      const openingMatch = /Opening '([^']+(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.mp4)'/i.exec(stderrOutput);
      if (openingMatch && openingMatch[1]) {
        const newFile = openingMatch[1];
        const timestampStr = openingMatch[2]; // e.g., "2024-12-19T15-30-00"
        console.log(`[${channel_number}] FFmpeg opened new segment: ${newFile}`);

        // If we had a previous segment, insert its DB record now
        if (segmentFile && currentSegmentStartTime) {
          const endTime = Date.now();
          console.log(`[${channel_number}] Segment finished. Finalizing record for ${segmentFile}`);
          db.run(
            "INSERT INTO video_segments (filename, channel_number, start_time, end_time, start_time_str, end_time_str) VALUES (?, ?, ?, ?, ?, ?)",
            [
              segmentFile,
              channel_number,
              currentSegmentStartTime,
              endTime,
              new Date(currentSegmentStartTime).toLocaleTimeString(),
              new Date(endTime).toLocaleTimeString(),
            ],
            (err) => {
              if (err) {
                console.error(`[${channel_number}] DB Insert Error: ${err.message}`);
              } else {
                console.log(`[${channel_number}] DB Insert Success for segment: ${path.basename(segmentFile)}`);
              }
            }
          );
        }

        // Update to new segment
        segmentFile = newFile;
        // Parse timestamp from filename
        const parsedTime = new Date(timestampStr.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3'));
        currentSegmentStartTime = parsedTime.getTime();
        updateRecordingStatus(channel_number, {
          currentSegmentFile: newFile,
          currentSegmentStartTime: currentSegmentStartTime,
        });

        checkStorageAndCleanup();
      } else if (
        stderrOutput.includes("Connection refused") ||
        stderrOutput.includes("No route to host") ||
        stderrOutput.includes("Unable to open")
      ) {
        console.error(
          `[${channel_number}] Network issue detected. Restarting...`
        );
        isRecording = false;
        updateRecordingStatus(channel_number, { isRecording: false });
        isKilling = true;
        if (ffmpegProcess && !ffmpegProcess.killed) {
          (async () => {
            try {
              await killFFmpeg(ffmpegProcess.pid, "SIGTERM");
              await new Promise((resolve) => setTimeout(resolve, KILL_TIMEOUT));
              if (ffmpegProcess && !ffmpegProcess.killed) {
                console.log(
                  `[${channel_number}] ffmpeg (PID: ${ffmpegProcess.pid}) did not terminate after SIGTERM. Using SIGKILL.`
                );
                await killFFmpeg(ffmpegProcess.pid, "SIGKILL");
              }
            } catch (error) {
              console.error(
                `[${channel_number}] Error during kill process: ${error}`
              );
            }
            setTimeout(restartRecording, 5000);
          })();
        } else {
          setTimeout(restartRecording, 5000);
        }
      }
    });

    ffmpegProcess.on("exit", (code, signal) => {
      clearTimeout(inactivityTimeout);
      console.log(
        `[${channel_number}] ffmpeg exited with code ${code} and signal ${signal}`
      );
      spawnedProcesses = spawnedProcesses.filter(
        (child) => child.pid !== ffmpegProcess.pid
      );
      ffmpegProcess = null;
      updateRecordingStatus(channel_number, {
        pid: null,
        currentSegmentFile: null,
      });
      if (code === 0) {
        console.error(`[${channel_number}] ffmpeg exited with error code 0`);
        isRecording = false;
        console.log(`stop recording flag: ${getStopRecording()}`);
        if (!getStopRecording()) {
          console.log("restarting ffmpeg process in 10 seconds");
          setTimeout(spawnFFmpegProcess, 10000);
        }
      } else if (code === 255) {
        console.error(
          `[${channel_number}] ffmpeg exited with error code 255. Likely an issue with the RTSP stream or ffmpeg.`
        );
        isRecording = false;
        // setTimeout(spawnFFmpegProcess, 10000);
      } else if (isRecording && !isKilling) {
        isRecording = false;
        console.log(
          `[${channel_number}] ffmpeg exited unexpectedly (code ${code}, signal ${signal}). Restarting...`
        );
        setTimeout(restartRecording, 1000);
      } else {
        console.log(`[${channel_number}] ffmpeg exited as expected.`);
        isKilling = false;
        isRecording = false;
        updateRecordingStatus(channel_number, {
          isRecording: false,
          currentSegmentFile: null,
        });
      }
    });

    ffmpegProcess.on("error", (err) => {
      clearTimeout(inactivityTimeout);
      console.error(
        `[${channel_number}] Error spawning ffmpeg: ${err.message}`
      );
      console.log(
        `[${channel_number}] Attempting to restart ffmpeg in 5 seconds...`
      );
      ffmpegProcess = null;
      updateRecordingStatus(channel_number, {
        pid: null,
        currentSegmentFile: null,
      });
      setTimeout(spawnFFmpegProcess, 5000);
    });

    return ffmpegProcess;
  };

  const restartRecording = () => {
    console.log(
      `[${channel_number}] Entering restartRecording. isRecording: ${isRecording}`
    );
    if (!isRecording) {
      console.log(`[${channel_number}] Attempting to restart recording...`);
      isRecording = true;
      respawnCounter++;
      updateRecordingStatus(channel_number, {
        isRecording: true,
        startTime: new Date(),
        respawnCount: respawnCounter,
      });
      spawnFFmpegProcess();
    } else {
      console.log(
        `[${channel_number}] Not restarting as isRecording is already true.`
      );
    }
  };

  const updateUptime = (channel, startTime) => {
    if (startTime) {
      const now = new Date();
      const diff = now.getTime() - startTime.getTime();
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      const formatTwoDigits = (num) => num.toString().padStart(2, "0");

      const uptimeString = `${days > 0 ? days + "d " : ""}${formatTwoDigits(
        hours % 24
      )}:${formatTwoDigits(minutes % 60)}:${formatTwoDigits(seconds % 60)}`;
      updateRecordingStatus(channel, { uptime: uptimeString });
    } else {
      updateRecordingStatus(channel, { uptime: "N/A" });
    }
  };

  spawnFFmpegProcess();
  return {
    process: ffmpegProcess,
    getStatus: () => getRecordingStatus(channel_number),
  };
};

export default startRecording;
