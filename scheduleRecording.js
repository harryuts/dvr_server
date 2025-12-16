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
    setTimeout(() => {
      stopRecording = true;
      console.log(
        `Stop recording for channel ${channel_configuration.channel}`
      );
      console.log(`stop recording flag: ${stopRecording}`);
      delete recordingControls[channel_configuration.channel];
      // Check if process exists before trying to access stdin
      if (recordingControl.process) {
        try {
          recordingControl.process.stdin.write("q");
          recordingControl.process.stdin.end();
        } catch (e) {
          console.log("Error stopping recording: ", e);
        }
      }
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

export { getStopRecording, recordingControls };
