import { promises as fs } from "fs";
import path from "path";
import bcrypt from "bcrypt";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PIN = "123456";
const configFilePath = path.join(__dirname, "config.json"); // Path to your config file
const segmentDuration = 900; // 15 minutes in seconds
const baseVideoDirectory = "/mnt/m2nvme";

async function readConfig() {
  try {
    const data = await fs.readFile(configFilePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading config file:", error);
    throw error;
  }
}

async function writeConfig(config) {
  try {
    await fs.writeFile(configFilePath, JSON.stringify(config, null, 2), "utf8");
    console.log("Config file updated successfully");
  } catch (error) {
    console.error("Error writing config file:", error);
    throw error;
  }
}

async function initializeConfig() {
  const config = await readConfig();
  if (!config.storedPinHash) {
    const defaultPin = DEFAULT_PIN;
    const saltRounds = 10;
    try {
      const hashedPassword = await bcrypt.hash(defaultPin, saltRounds);
      await writeConfig({ ...config, storedPinHash: hashedPassword });
      console.log("Config file initialized with a default hashed PIN.");
    } catch (error) {
      console.error("Error hashing default PIN:", error);
    }
  }
}

initializeConfig();

export async function getStoredPinHash() {
  const config = await readConfig();
  return config?.storedPinHash;
}

export async function updateStoredPinHash(newHashedPin) {
  const config = await readConfig();
  config.storedPinHash = newHashedPin;
  await writeConfig(config);
}

export async function getSchedule() {
  const config = await readConfig();
  return { startTime: config.startTime, stopTime: config.stopTime };
}

export async function updateSchedule(startTime, stopTime) {
  const config = await readConfig();
  config.startTime = {
    hour: parseInt(startTime.hour, 10),
    minute: parseInt(startTime.minute, 10),
  };
  config.stopTime = {
    hour: parseInt(stopTime.hour, 10),
    minute: parseInt(stopTime.minute, 10),
  };
  await writeConfig(config);
}

export async function getRecordingConfigurations() {
  const config = await readConfig();
  return config.recordingConfiguration;
}

export async function updateRecordingConfiguration(updatedChannelConfig) {
  const config = await readConfig();
  const index = config.recordingConfiguration.findIndex(
    (config) => config.channel === updatedChannelConfig.channel
  );

  if (index !== -1) {
    config.recordingConfiguration[index] = updatedChannelConfig;
    await writeConfig(config);
    return true;
  }
  return false; // Channel not found
}

export async function addRecordingConfiguration(newChannelConfig) {
  const config = await readConfig();
  config.recordingConfiguration.push(newChannelConfig);
  await writeConfig(config);
  return true;
}

export async function deleteRecordingConfiguration(channelToDelete) {
  const config = await readConfig();
  config.recordingConfiguration = config.recordingConfiguration.filter(
    (config) => config.channel !== channelToDelete
  );
  await writeConfig(config);
  return true;
}

export { segmentDuration, baseVideoDirectory };
export default {
  segmentDuration,
  baseVideoDirectory,
  getStoredPinHash,
  updateStoredPinHash,
  getSchedule,
  updateSchedule,
  getRecordingConfigurations,
  updateRecordingConfiguration,
  addRecordingConfiguration,
  deleteRecordingConfiguration,
};
