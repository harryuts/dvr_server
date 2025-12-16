import { format } from "date-fns";
import path from "path";
import fs from "fs";
import { spawn, exec } from "child_process";
import os from "os";
import storageManager from "./storage-management.js"; // Import the storage management module
import configManager from "./configManager.js";

const CAPTURE_SEGMENT_DURATION = 15;
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
    const formattedDateForFile = format(currentDate, "yyyyMMddHHmmss");
    const channelDirectoryPath = path.join(
      channelDirectoryBase,
      year,
      month,
      day
    );
    const segmentFileTemplate = path.join(
      channelDirectoryPath,
      `capture_${formattedDateForFile}_%06d.mp4`
    );

    if (!fs.existsSync(channelDirectoryPath)) {
      fs.mkdirSync(channelDirectoryPath, { recursive: true, mode: 0o755 }); // Ensure proper permissions
      console.log(`Directory created: ${channelDirectoryPath}`);
    } else {
      console.log(`Directory already exists: ${channelDirectoryPath}`);
    }

    console.log(`[${channel_number}] Spawning ffmpeg process...`);
    let isKilling = false;
    ffmpegProcess = spawn("ffmpeg", [
      "-rtsp_transport",
      "tcp",
      "-i",
      CAPTURE_SOURCE_URL,
      "-c:v",
      "copy",
      "-an",
      "-f",
      "segment",
      "-segment_time",
      CAPTURE_SEGMENT_DURATION.toString(),
      "-reset_timestamps",
      "1",
      "-y",
      segmentFileTemplate,
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
      if (stderrOutput.includes("Opening")) {
        const startTime = Date.now() - CAPTURE_SEGMENT_DURATION * 1000;
        const endTime = startTime + CAPTURE_SEGMENT_DURATION * 1000;
        const match =
          /Opening '(.*\/capture\/ch\d+\/(\d{4})\/(\d{2})\/(\d{2})\/(capture_\d+_\d+\.mp4))'/i.exec(
            stderrOutput
          );
        if (match && match[1]) {
          const currentFile = match[1];
          updateRecordingStatus(channel_number, {
            currentSegmentFile: currentFile,
          });
          if (!segmentFile) {
            segmentFile = currentFile;
          } else {
            db.run(
              "INSERT INTO video_segments (filename, channel_number, start_time, end_time, start_time_str, end_time_str) VALUES (?, ?, ?, ?, ?, ?)",
              [
                segmentFile,
                channel_number,
                startTime,
                endTime,
                new Date(parseInt(startTime)).toLocaleTimeString(),
                new Date(parseInt(endTime)).toLocaleTimeString(),
              ]
            );
            segmentFile = currentFile;
          }
        }
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
