import { startApiServer } from "./apiServer.js";
import process from "process";
import path from "path";
import { scheduleRecording, isTimeToRun } from "./scheduleRecording.js";
import * as dbFunctions from "./dbFunctions.js";
import { deleteDbEntryIfFileMissing } from "./storage-management.js";
import { fileURLToPath } from 'url';
import si from "systeminformation";

const db = dbFunctions.db;
const __filename = fileURLToPath(import.meta.url);
//======================================================
let spawnedProcesses = []; // Keep track of spawnedProcessesID to terminate on exit

console.log("db cleanup");
deleteDbEntryIfFileMissing(db);
// storageCleanup(db)

startApiServer(db, spawnedProcesses);

// Schedule the function for the next start time
scheduleRecording(db, spawnedProcesses);
setInterval(() => scheduleRecording(db, spawnedProcesses), 24 * 60 * 60 * 1000);
isTimeToRun(db, spawnedProcesses);

// Function to collect and store system metrics
async function collectAndStoreMetrics() {
  try {
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    const temp = await si.cpuTemperature();

    const cpuUsage = cpu.currentLoad;
    const ramUsage = (mem.active / mem.total) * 100;
    const cpuTemp = temp.main || 0; // Fallback to 0 if temp is not available

    dbFunctions.insertSystemMetrics(cpuUsage, ramUsage, cpuTemp);
  } catch (error) {
    console.error("Error collecting system metrics:", error);
  }
}

// Start collecting metrics every 10 seconds
setInterval(collectAndStoreMetrics, 10000);
collectAndStoreMetrics(); // Run immediately on start

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
