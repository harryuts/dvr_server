import { startApiServer } from "./apiServer.js";
import process from "process";
import path from "path";
import { scheduleRecording, isTimeToRun } from "./scheduleRecording.js";
import { db } from "./dbFunctions.js";
import { deleteDbEntryIfFileMissing } from "./storage-management.js";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
//======================================================
let spawnedProcesses = []; // Keep track of spawnedProcessesID to terminate on exit

const channelDirectoryBase = path.join("/mnt/m2nvme", `capture/ch1`);

console.log("db cleanup");
deleteDbEntryIfFileMissing(db, channelDirectoryBase);
// storageCleanup(db)

startApiServer(db, spawnedProcesses);

// Schedule the function for the next start time
scheduleRecording(db, spawnedProcesses);
setInterval(() => scheduleRecording(db, spawnedProcesses), 24 * 60 * 60 * 1000);
isTimeToRun(db, spawnedProcesses);

function cleanupOnExit(childProcesses) {
  childProcesses.forEach((child) => {
    if (!child.killed) {
      console.log(`Killing child process with PID: ${child.pid}`);
      process.kill(-child.pid); // Using negative PID to kill the process group
    }
  });
}

// This will handle normal exit
process.on("exit", () => cleanupOnExit(spawnedProcesses));

// This will handle `Ctrl+C`
process.on("SIGINT", () => {
  cleanupOnExit(spawnedProcesses);
  process.exit(1);
});

// This will handle `kill pid` (for example if the process is killed by system service)
process.on("SIGTERM", () => {
  cleanupOnExit(spawnedProcesses);
  process.exit(1);
});
