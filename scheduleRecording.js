import path from "path";
import startRecording, { getRecordingStatus } from "./recording.js";
import fs from "fs";
import configManager from "./configManager.js";
import { storageCleanup } from "./storage-management.js";
//======================================================

let stopRecording = true; // set global flag to know if we are withing recording windows or not
const getStopRecording = () => stopRecording;
const recordingControls = {};
let timeUntilStopRecording; // time until recording stop (in seconds)
let timeUntilStartRecording; // time until recording start (in seconds)

// Function to calculate the milliseconds until a specific hour and minute
const msUntilTime = (hour, minute) => {
  const now = new Date();
  let targetTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    minute,
    0
  );

  // If the target time for today has already passed, schedule for the next day
  if (now.getTime() > targetTime.getTime()) {
    targetTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      hour,
      minute,
      0
    );
  }

  return targetTime.getTime() - now.getTime();
};

// Check if current time is between start and stop times
export const isTimeToRun = async (db, spawnedProcesses) => {
  const { startTime, stopTime } = await configManager.getSchedule();
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    startTime.hour,
    startTime.minute,
    0
  );
  const stop = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    stopTime.hour,
    stopTime.minute,
    0
  );
  if (now >= start && now < stop) {
    // Check if we should run the function right now
    console.log("Current time is within the schedule, running recording now!");
    recordingScheduleStart(
      db,
      spawnedProcesses,
      msUntilTime(stopTime.hour, stopTime.minute)
    );
  } else {
    console.log("cleaning up storage...");
    storageCleanup(db);
  }
};

const recordingScheduleStart = async (db, spawnedProcesses, stopTime) => {
  const recordingConfiguration =
    await configManager.getRecordingConfigurations();
  stopRecording = false;
  recordingConfiguration.forEach((channel_configuration) => {
    // Start recording for each channel
    console.log(
      `Recording schedule start for channel: ${channel_configuration.channel}`
    );
    const recordingControl = startRecording(
      db,
      spawnedProcesses,
      channel_configuration.channel,
      channel_configuration.recordUrl
    );
    recordingControls[channel_configuration.channel] = recordingControl;

    // Schedule the function to stop
    setTimeout(async () => {
      stopRecording = true;
      console.log(
        `Stop recording for channel ${channel_configuration.channel}`
      );
      console.log(`stop recording flag: ${stopRecording}`);

      const control = recordingControls[channel_configuration.channel];
      if (control && control.stop) {
        await control.stop();
      } else if (control && control.process) {
        // Fallback legacy stop
        try {
          control.process.stdin.write("q");
          control.process.stdin.end();
        } catch (e) {
          console.log("Error stopping recording: ", e);
        }
      }

      delete recordingControls[channel_configuration.channel];
      console.log("cleaning up storage...");
      storageCleanup(db);
    }, stopTime);
  });

  // Function to log the recording status for all channels
  const logRecordingStatus = () => {
    console.log("\n--- Recording Status ---");
    for (const channel in recordingControls) {
      if (recordingControls.hasOwnProperty(channel)) {
        const status = recordingControls[channel].getStatus();
        console.log(`Channel ${channel}:`, {
          pid: status.pid,
          isRecording: status.isRecording,
          startTime: status.startTime,
          uptime: status.uptime,
          respawnCount: status.respawnCount,
          currentSegmentFile: status.currentSegmentFile,
        });
      }
    }
  };

  // Log the recording status every 15 seconds
  // setInterval(logRecordingStatus, 15000);
};

// Function to handle the scheduling of the start and stop actions
export const scheduleRecording = async (db, spawnedProcesses) => {
  const { startTime, stopTime } = await configManager.getSchedule();
  console.log(
    `Schedule the recording task running in ${Math.floor(
      msUntilTime(startTime.hour, startTime.minute) / 3600000
    )} hours!`
  );
  setTimeout(() => {
    /* // remove the database and files
        console.log("Removing existing database entries")
        db.run(`DELETE FROM video_segments`, function (err) {
            if (err) {
                return console.error(err.message);
            }
            console.log(`Rows deleted ${this.changes}`);
        }); */
    console.log("Removing all videos temp files");
    const removeDirectoryPath = ["/mnt/m2nvme/video_output"];
    removeDirectoryPath.forEach((directoryPath) => {
      fs.readdir(directoryPath, (err, files) => {
        if (err) {
          console.error(`Error reading directory: ${err}`);
          return;
        }

        files.forEach((file) => {
          const fullPath = path.join(directoryPath, file);
          fs.rm(fullPath, { recursive: true, force: true }, (err) => {
            if (err) {
              console.error(`Error deleting ${fullPath}: ${err}`);
            } else {
              console.log(`${fullPath} has been removed`);
            }
          });
        });
      });
    });
    setTimeout(() => {
      recordingScheduleStart(
        db,
        spawnedProcesses,
        msUntilTime(stopTime.hour, stopTime.minute)
      );
    }, 10000);
  }, msUntilTime(startTime.hour, startTime.minute));
};

// Function to restart all active recordings (used when live capture config changes)
export const restartAllRecordings = async () => {
  console.log("Restarting all recordings to apply new configuration...");

  // Get all active recording channels
  const activeChannels = Object.keys(recordingControls);

  if (activeChannels.length === 0) {
    console.log("No active recordings to restart.");
    return;
  }

  // Stop all recordings
  for (const channel of activeChannels) {
    const recordingControl = recordingControls[channel];
    if (recordingControl && recordingControl.process) {
      try {
        console.log(`Stopping recording for channel ${channel}...`);
        recordingControl.process.stdin.write("q");
        recordingControl.process.stdin.end();
      } catch (e) {
        console.log(`Error stopping recording for channel ${channel}:`, e);
      }
    }
  }

  // Wait a bit for processes to terminate
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Clear recording controls
  for (const channel of activeChannels) {
    delete recordingControls[channel];
  }

  console.log("All recordings stopped. They will restart automatically.");
};

// Function to start recording for a single channel (used when adding new channels)
export const startRecordingForChannel = async (db, spawnedProcesses, channelConfig) => {
  if (stopRecording) {
    console.log(`[${channelConfig.channel}] Not in recording window, channel will start at next scheduled time`);
    return { success: false, reason: 'outside_recording_window' };
  }

  console.log(`[${channelConfig.channel}] Starting recording for new channel...`);

  try {
    // Start recording
    const recordingControl = startRecording(
      db,
      spawnedProcesses,
      channelConfig.channel,
      channelConfig.recordUrl
    );
    recordingControls[channelConfig.channel] = recordingControl;

    // Set up stop timeout for this channel (matching the global stop time)
    // Calculate remaining time from now until the scheduled stop
    const { stopTime } = await configManager.getSchedule();
    const remainingTime = msUntilTime(stopTime.hour, stopTime.minute);

    console.log(`[${channelConfig.channel}] Recording will stop in ${Math.floor(remainingTime / 60000)} minutes`);

    setTimeout(async () => {
      stopRecording = true;
      console.log(`Stop recording for channel ${channelConfig.channel}`);

      const control = recordingControls[channelConfig.channel];
      if (control && control.stop) {
        await control.stop();
      } else if (control && control.process) {
        try {
          control.process.stdin.write("q");
          control.process.stdin.end();
        } catch (e) {
          console.log(`Error stopping recording for ${channelConfig.channel}:`, e);
        }
      }
      delete recordingControls[channelConfig.channel];
    }, remainingTime);

    return { success: true };
  } catch (error) {
    console.error(`[${channelConfig.channel}] Error starting recording:`, error);
    return { success: false, reason: 'error', error: error.message };
  }
};

export const stopRecordingForChannel = async (channel) => {
  console.log(`[${channel}] Stopping recording for channel...`);
  const recordingControl = recordingControls[channel];
  if (recordingControl) {
    // Use the new stop method if available, fallback to old way just in case
    if (recordingControl.stop) {
      await recordingControl.stop();
    } else if (recordingControl.process) {
      try {
        recordingControl.process.stdin.write("q");
        recordingControl.process.stdin.end();
      } catch (e) {
        console.log(`Error stopping recording for ${channel}:`, e);
      }
    }
    delete recordingControls[channel];
    return true;
  } else {
    console.log(`[${channel}] No active recording found to stop.`);
    return false;
  }
};

export { getStopRecording, recordingControls };
