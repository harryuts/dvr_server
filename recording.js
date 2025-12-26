import { format } from "date-fns";
import path from "path";
import fs from "fs";
import { spawn, exec } from "child_process";
import os from "os";
import storageManager from "./storage-management.js"; // Import the storage management module
import configManager, { liveCaptureFrameRate } from "./configManager.js";

const CAPTURE_SEGMENT_DURATION = configManager.segmentDuration;
// Access baseVideoDirectory dynamically from configManager
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

const channelLogs = {};
const terminationLogs = {};
const MAX_LOG_LINES = 100;
const MAX_TERMINATION_LOGS = 50;

export const getChannelLogs = (channel_number) => {
  return channelLogs[channel_number] || [];
};

export const getTerminationLogs = (channel_number) => {
  return terminationLogs[channel_number] || [];
};

const addLog = (channel_number, message) => {
  if (!channelLogs[channel_number]) {
    channelLogs[channel_number] = [];
  }
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;

  channelLogs[channel_number].push(logLine);
  if (channelLogs[channel_number].length > MAX_LOG_LINES) {
    channelLogs[channel_number].shift();
  }
};

const addTerminationLog = (channel_number, event) => {
  if (!terminationLogs[channel_number]) {
    terminationLogs[channel_number] = [];
  }
  terminationLogs[channel_number].unshift(event); // Add to beginning (newest first)
  if (terminationLogs[channel_number].length > MAX_TERMINATION_LOGS) {
    terminationLogs[channel_number].pop();
  }
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
  CAPTURE_SOURCE_URL,
  options = {}
) => {
  let segmentFile;
  let isRecording = true;
  let manualStop = false;
  let ffmpegProcess = null;
  let inactivityTimeout;
  const INACTIVITY_THRESHOLD = 90 * 1000;
  const KILL_TIMEOUT = 3000;
  let recordingStartTime;
  let respawnCounter = 0;
  const isDahua = options.isDahua || false;

  console.log(`Start recording for channel ${channel_number} (Dahua: ${isDahua})`);
  updateRecordingStatus(channel_number, {
    isRecording: true,
    startTime: new Date(),
    pid: null,
    uptime: "0s",
    respawnCount: respawnCounter,
    currentSegmentFile: null,
  });

  const channelDirectoryBase = path.join(
    configManager.baseVideoDirectory,
    `capture/${channel_number}`
  );

  const checkStorageAndCleanup = async () => {
    const usagePercentage = await storageManager.getDiskUsagePercentage(
      configManager.baseVideoDirectory
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

  // Robust kill function similar to Shinobi's escalation strategy
  const killRobustly = async (pid) => {
    try {
      console.log(`[${channel_number}] Attempting graceful kill (SIGTERM) for PID: ${pid}`);
      process.kill(pid, 'SIGTERM');

      // Wait for process to exit
      let checkCount = 0;
      while (checkCount < 10) { // Wait up to 5 seconds (10 * 500ms)
        try {
          process.kill(pid, 0); // Check if process exists
          await new Promise(r => setTimeout(r, 500));
          checkCount++;
        } catch (e) {
          console.log(`[${channel_number}] Process ${pid} has exited.`);
          return; // Process is gone
        }
      }

      console.log(`[${channel_number}] Process ${pid} did not exit. Escalating to SIGKILL.`);
      process.kill(pid, 'SIGKILL');

      // Final verification
      try {
        // Give it a moment to die
        await new Promise(r => setTimeout(r, 1000));
        process.kill(pid, 0);
        console.error(`[${channel_number}] CRITICAL: Process ${pid} STILL exists after SIGKILL.`);
      } catch (e) {
        console.log(`[${channel_number}] Process ${pid} successfully killed with SIGKILL.`);
      }

    } catch (e) {
      if (e.code === 'ESRCH') {
        console.log(`[${channel_number}] Process ${pid} already dead.`);
      } else {
        console.error(`[${channel_number}] Error killing process ${pid}:`, e);
      }
    }
  };

  const startFileWatcher = (dir) => {
    // Clear existing watcher if any
    if (recordingStatus[channel_number]?.fileWatcher) {
      recordingStatus[channel_number].fileWatcher.close();
    }

    let lastChangeTime = Date.now();

    // Watch for changes in the directory
    const watcher = fs.watch(dir, (eventType, filename) => {
      if (filename && (filename.endsWith('.mp4') || filename.endsWith('.jpg'))) {
        lastChangeTime = Date.now();
        resetInactivityTimer(); // Reset the backup timer as well
      }
    });

    // Periodic check for zombie detection based on file changes
    const zombieCheckInterval = setInterval(async () => {
      if (!isRecording) {
        clearInterval(zombieCheckInterval);
        watcher.close();
        return;
      }

      let timeSinceLastChange = Date.now() - lastChangeTime;
      // Shinobi uses a cutoff factor, we'll use 1.5x segment duration or a minimum of 30s
      const threshold = Math.max(CAPTURE_SEGMENT_DURATION * 1000 * 1.5, 30000);

      if (timeSinceLastChange > threshold) {
        // Fallback: fs.watch can be unreliable on some mounts. Check the actual file mtime.
        const currentFile = recordingStatus[channel_number]?.currentSegmentFile;
        if (currentFile) {
          try {
            const stats = await fs.promises.stat(currentFile);
            const timeSinceFileMod = Date.now() - stats.mtimeMs;
            if (timeSinceFileMod < threshold) {
              // File was actually modified recently, update lastChangeTime
              lastChangeTime = stats.mtimeMs;
              timeSinceLastChange = Date.now() - lastChangeTime;
              console.log(`[${channel_number}] recovered from false zombie detection via fs.stat`);
            }
          } catch (e) {
            // File not found or error, likely genuine zombie or starting up
          }
        }
      }

      if (timeSinceLastChange > threshold) {
        console.warn(`[${channel_number}] ZOMBIE DETECTED! No file changes for ${(timeSinceLastChange / 1000).toFixed(1)}s. Restarting...`);
        clearInterval(zombieCheckInterval);
        watcher.close();

        if (ffmpegProcess) {
          isRecording = false; // Prevent auto-restart loop from exit handler for a moment
          await killRobustly(ffmpegProcess.pid);
          setTimeout(restartRecording, 1000);
        }
      }
    }, 10000); // Check every 10 seconds

    recordingStatus[channel_number].fileWatcher = watcher;
    recordingStatus[channel_number].zombieCheckInterval = zombieCheckInterval;
  };

  const resetInactivityTimer = () => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(async () => {
      console.log(`[${channel_number}] Inactivity detected (no stdout/stderr). Restarting...`);
      isRecording = false; // Prevent auto-restart loop from exit handler for a moment
      updateRecordingStatus(channel_number, { isRecording: false });
      if (ffmpegProcess) {
        await killRobustly(ffmpegProcess.pid);
        setTimeout(restartRecording, 1000);
      }
    }, INACTIVITY_THRESHOLD);
  };

  const spawnFFmpegProcess = async () => {
    // ... (date setup) ... 
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

    if (isDahua) {
      console.log(`[${channel_number}] Dahua channel detected. Skipping FFmpeg process spawn as recording is disabled and live capture is on-demand.`);
      // Create a dummy process object to satisfy the contract
      const dummyProcess = {
        pid: -1,
        stdout: { on: () => { } },
        stderr: { on: () => { } },
        on: () => { },
        killed: false,
        stdin: { write: () => { }, end: () => { } }
      };
      ffmpegProcess = dummyProcess;
      updateRecordingStatus(channel_number, {
        isRecording: false, // Not actually recording
        startTime: new Date(),
        pid: -1,
        uptime: "N/A (Dahua)",
        respawnCount: 0,
      });
      return;
    }

    // Use strftime pattern for segment filenames (Shinobi-style)
    const segmentFileTemplate = path.join(
      channelDirectoryPath,
      `%Y-%m-%dT%H-%M-%S.mp4`
    );

    if (!fs.existsSync(channelDirectoryPath)) {
      fs.mkdirSync(channelDirectoryPath, { recursive: true, mode: 0o755 });
      console.log(`[${channel_number}] Directory created: ${channelDirectoryPath}`);
    }

    // Start monitoring the capture directory for activity
    startFileWatcher(channelDirectoryBase);

    console.log(`[${channel_number}] Spawning ffmpeg process...`);
    let isKilling = false;
    const liveJpegPath = path.join(channelDirectoryBase, "live.jpg");
    let currentSegmentStartTime = null;

    // Build FFmpeg Arguments
    let args = [
      "-y",
      "-fflags", "+genpts+discardcorrupt",
      "-rtsp_transport", "tcp",
      "-stimeout", "5000000", // 5 seconds timeout for socket
      "-i", CAPTURE_SOURCE_URL,
    ];

    console.log(`[${channel_number}] Spawning FFmpeg with args:`, args.join(" "));

    if (!isDahua) {
      // Standard Recording Args
      args.push(
        "-map", "0:v",
        "-c:v", "copy",
        "-an",
        "-f", "segment",
        "-segment_time", CAPTURE_SEGMENT_DURATION.toString(),
        "-segment_atclocktime", "1",
        "-strftime", "1",
        "-reset_timestamps", "1",
        "-segment_format_options", "movflags=+frag_keyframe+empty_moov",
        "-y", segmentFileTemplate
      );
    }

    // Live JPEG output removed to prevent high CPU usage (switched to On-Demand strategy)
    ffmpegProcess = spawn("ffmpeg", args);
    spawnedProcesses.push(ffmpegProcess);

    // Register with central FFmpeg Registry
    // Dynamic import to avoid circular dependencies if any (though registry is standalone)
    import("./ffmpegRegistry.js").then(({ registerFFmpegProcess }) => {
      registerFFmpegProcess(ffmpegProcess.pid, 'schedule_recording', `ffmpeg ${args.join(' ')}`, ffmpegProcess);
    }).catch(err => console.error("Failed to register ffmpeg process:", err));

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
      // Optional: Add stdout to logs if verbose logging is desired (ffmpeg usually outputs stats to stderr)
    });

    ffmpegProcess.stderr.on("data", (data) => {
      resetInactivityTimer();
      const stderrOutput = data.toString();
      updateUptime(channel_number, recordingStartTime);
      addLog(channel_number, stderrOutput.trim()); // Capture stderr to live logs

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
            await killRobustly(ffmpegProcess.pid);
            setTimeout(restartRecording, 5000);
          })();
        } else {
          setTimeout(restartRecording, 5000);
        }
      }
    });

    ffmpegProcess.on("exit", (code, signal) => {
      clearTimeout(inactivityTimeout);

      // Unregister from central registry
      import("./ffmpegRegistry.js").then(({ unregisterFFmpegProcess }) => {
        unregisterFFmpegProcess(ffmpegProcess.pid);
      }).catch(err => console.error("Failed to unregister ffmpeg process:", err));

      console.log(
        `[${channel_number}] ffmpeg exited with code ${code} and signal ${signal}`
      );

      addTerminationLog(channel_number, {
        timestamp: new Date().toISOString(),
        code: code,
        signal: signal,
        uptime: recordingStatus[channel_number]?.uptime || "N/A",
        reason: code === 0 ? "Graceful Exit" : (code === 255 ? "Connection/Protocol Error" : "Unexpected/Crash")
      });

      // Finalize the last video segment if it exists
      if (segmentFile && currentSegmentStartTime) {
        const endTime = Date.now();
        console.log(`[${channel_number}] Process exit. Finalizing record for last segment: ${segmentFile}`);
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
              console.error(`[${channel_number}] DB Insert Error (Final): ${err.message}`);
            } else {
              console.log(`[${channel_number}] DB Insert Success (Final) for segment: ${path.basename(segmentFile)}`);
            }
          }
        );
      }

      if (manualStop) {
        console.log(`[${channel_number}] Recording stopped manually.`);
        spawnedProcesses = spawnedProcesses.filter(
          (child) => child.pid !== ffmpegProcess.pid
        );

        // Prevent overwriting status if a new process has already started
        const currentStatus = recordingStatus[channel_number];
        if (currentStatus && currentStatus.pid === ffmpegProcess.pid) {
          updateRecordingStatus(channel_number, {
            pid: null,
            currentSegmentFile: null,
            isRecording: false
          });
        }

        ffmpegProcess = null;
        return;
      }

      spawnedProcesses = spawnedProcesses.filter(
        (child) => child.pid !== ffmpegProcess.pid
      );

      // Only update status if this process is the current one
      const currentStatus = recordingStatus[channel_number];
      if (currentStatus && currentStatus.pid === ffmpegProcess.pid) {
        updateRecordingStatus(channel_number, {
          pid: null,
          currentSegmentFile: null,
        });
      }

      if (manualStop) {
        console.log(`[${channel_number}] Recording stopped manually.`);
        ffmpegProcess = null;

        if (currentStatus && currentStatus.pid === 0) { // PID might be already null if filtered above? No, passed PID.
          // Actually, we captured ffmpegProcess variable in closure.
          // But `currentStatus.pid` is from the global object.
        }

        if (currentStatus && currentStatus.pid === (spawnedProcesses.find(p => p === ffmpegProcess)?.pid || ffmpegProcess.pid)) {
          updateRecordingStatus(channel_number, {
            pid: null,
            currentSegmentFile: null,
            isRecording: false
          });
        }
        // Simplified: just check if the global PID matches what we think we are.
        // But wait, the previous `updateRecordingStatus` call above might have just set it to null if we matched.
        // Let's refine the logic.

        return;
      }
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

      if (manualStop) return;

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
    if (manualStop) {
      console.log(`[${channel_number}] Not restarting because manual stop is requested.`);
      return;
    }
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
    stop: async () => {
      console.log(`[${channel_number}] Manual stop requested.`);
      manualStop = true;
      isRecording = false;
      if (ffmpegProcess) {
        try {
          ffmpegProcess.stdin.write("q");
          ffmpegProcess.stdin.end();
        } catch (e) {
          console.log(`[${channel_number}] JSON write error (process might be dead):`, e);
        }
        // Forcing kill if not dead quickly? The exit handler handles cleanup.
        // If we really want to ensure it dies:
        if (ffmpegProcess && !ffmpegProcess.killed) {
          // killFFmpeg is available in closure
          // usage: killFFmpeg(pid)
          // Maybe wait a bit then kill if not dead?
          // The stdin 'q' should trigger exit handler.
        }
      }
    }
  };
};

export default startRecording;
