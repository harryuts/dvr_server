import { promises as fs } from "fs";
import * as fsLegacy from "fs";
import path from "path";
import configManager from "./configManager.js";

const baseVideoDirectory = configManager.baseVideoDirectory;

export const getDiskUsagePercentage = async (directory) => {
  try {
    const stats = await fs.statfs(directory);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bfree * stats.bsize;
    const usedBytes = totalBytes - freeBytes;
    return (usedBytes / totalBytes) * 100;
  } catch (error) {
    console.error(`Error getting disk usage for ${directory}: ${error}`);
    return -1; // Indicate an error
  }
};

const deleteFilesAndDbEntries = async (db, fullFilePathList) => {
  if (!Array.isArray(fullFilePathList) || fullFilePathList.length === 0) {
    console.log("No file paths provided for deletion.");
    return;
  }

  for (const fullFilePath of fullFilePathList) {
    if (!fullFilePath) {
      console.log("Skipping empty file path in the list.");
      continue;
    }

    console.log(`Processing deletion for: ${fullFilePath}`);

    try {
      // Delete the file
      try {
        await fs.unlink(fullFilePath);
        console.log(`Deleted file: ${fullFilePath}`);
      } catch (unlinkError) {
        console.error(`Error deleting file ${fullFilePath}: ${unlinkError}`);
        // Intentionally continue to attempt to delete the database entry
      }

      // Delete the database entry
      await new Promise((resolve, reject) => {
        db.run(
          "DELETE FROM video_segments WHERE filename = ?",
          [fullFilePath], // Using fullFilePath directly in the query
          (err) => {
            if (err) {
              console.error(
                `Error deleting database entry for ${fullFilePath}: ${err}`
              );
              reject(err);
              return;
            }
            console.log(`Deleted database entry for: ${fullFilePath}`);
            resolve();
          }
        );
      });
    } catch (dbError) {
      console.error(
        `Error during database operation for ${fullFilePath}: ${dbError}`
      );
      // Continue to the next file in the list
    }
  }

  console.log("Finished processing deletion requests.");
};

const deleteFileAndDbEntry = async (db, fileInfo, channelNumber) => {
  if (!fileInfo) {
    console.log(`No files found to delete for channel ${channelNumber}.`);
    return;
  }
  try {
    try {
      await fs.unlink(fileInfo.name);
      console.log(`Deleted file: ${fileInfo.name}`);
    } catch (unlinkError) {
      console.error(`Error deleting file ${fileInfo.name}: ${unlinkError}`);
      // Intentionally continue to delete the database entry
    }

    await new Promise((resolve, reject) => {
      db.run(
        "DELETE FROM video_segments WHERE filename = ? AND channel_number = ?",
        [fileInfo.name, channelNumber],
        (err) => {
          if (err) {
            console.error(
              `Error deleting database entry for ${fileInfo.name}: ${err}`
            );
            reject(err);
            return;
          }
          console.log(`Deleted database entry for: ${fileInfo.name}`);
          resolve();
        }
      );
    });
  } catch (dbError) {
    // This catch block now primarily handles errors from the database deletion
    console.error(
      `Error deleting database entry for ${fileInfo.name}: ${dbError}`
    );
  }
};
const findOldestFileWithDateStructure = async (channelDirectoryBase) => {
  try {
    const yearDirs = await fs.readdir(channelDirectoryBase);
    let oldestFile = null;

    for (const yearDir of yearDirs) {
      const yearPath = path.join(channelDirectoryBase, yearDir);
      const yearStat = await fs.stat(yearPath);
      if (yearStat.isDirectory() && /^\d{4}$/.test(yearDir)) {
        const monthDirs = await fs.readdir(yearPath);
        for (const monthDir of monthDirs) {
          const monthPath = path.join(yearPath, monthDir);
          const monthStat = await fs.stat(monthPath);
          if (monthStat.isDirectory() && /^\d{2}$/.test(monthDir)) {
            const dayDirs = await fs.readdir(monthPath);
            for (const dayDir of dayDirs) {
              const dayPath = path.join(monthPath, dayDir);
              const dayStat = await fs.stat(dayPath);
              if (dayStat.isDirectory() && /^\d{2}$/.test(dayDir)) {
                const files = await fs.readdir(dayPath);
                const videoFiles = files.filter(
                  (file) => file.startsWith("capture_") && file.endsWith(".mp4")
                );
                for (const file of videoFiles) {
                  const filePath = path.join(dayPath, file);
                  const stat = await fs.stat(filePath);
                  if (!oldestFile || stat.mtimeMs < oldestFile.mtimeMs) {
                    oldestFile = {
                      name: filePath,
                      baseName: file,
                      mtimeMs: stat.mtimeMs,
                    };
                  }
                }
              }
            }
          }
        }
      }
    }
    return oldestFile;
  } catch (error) {
    console.error(
      `Error finding oldest file with date structure in ${channelDirectoryBase}: ${error}`
    );
    return null;
  }
};

export const deleteDbEntryIfFileMissing = async (db) => {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all(
        "SELECT filename, channel_number FROM video_segments",
        (err, rows) => {
          if (err) {
            console.error("Error fetching all video segment entries:", err);
            reject(err);
            return;
          }
          resolve(rows);
        }
      );
    });

    if (!rows || rows.length === 0) {
      console.log("No video segment entries found to check.");
      return;
    }

    for (const row of rows) {
      const fileName = row.filename; // Use the filename from the DB for logging

      try {
        await fs.access(fileName, fsLegacy.constants.F_OK);
        // File exists, do nothing
        // console.log(`File ${fileName} does exist`);
      } catch (error) {
        console.log(`File ${fileName} does not exist`);
        // File does not exist, delete the database entry
        console.log(`File not found: ${fileName}. Deleting database entry.`);
        await new Promise((resolve, reject) => {
          db.run(
            "DELETE FROM video_segments WHERE filename = ? AND channel_number = ?",
            [row.filename, row.channel_number],
            (err) => {
              if (err) {
                console.error(
                  `Error deleting database entry for missing file ${fileName}: ${err}`
                );
                reject(err);
                return;
              }
              console.log(
                `Deleted database entry for missing file: ${fileName}`
              );
              resolve();
            }
          );
        });
      }
    }

    console.log("File existence check and cleanup complete.");
  } catch (error) {
    console.error(
      "An error occurred during the file existence check and cleanup:",
      error
    );
  }
};

export const deleteOldestFileAndDbEntry = async (
  db,
  channelDirectoryBase,
  channelNumber
) => {
  const oldestFileInfo = await findOldestFileWithDateStructure(
    channelDirectoryBase
  );
  if (oldestFileInfo) {
    await deleteFileAndDbEntry(db, oldestFileInfo, channelNumber);
  }
};

export const storageCleanup = async (db) => {
  console.log("storage cleanup");
  const maxStoragePercent = await configManager.getMaxStoragePercent();

  while (
    (await getDiskUsagePercentage(baseVideoDirectory)) > maxStoragePercent
  ) {
    const oldestFileList = await findOldestFileDirectoryFullPaths(
      baseVideoDirectory + "/capture"
    );
    await deleteFilesAndDbEntries(db, oldestFileList);
  }
};

async function findOldestFileDirectoryFullPaths(rootPath) {
  let oldestFile = null;
  let oldestTime = Infinity;
  let oldestFileDirectory = null;

  async function traverseDirectory(currentPath) {
    try {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const itemPath = path.join(currentPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory()) {
          await traverseDirectory(itemPath);
        } else if (stats.isFile()) {
          const modifiedTimeMs = stats.mtimeMs;
          if (modifiedTimeMs < oldestTime) {
            oldestTime = modifiedTimeMs;
            oldestFile = itemPath;
            oldestFileDirectory = currentPath;
          }
        }
      }
    } catch (err) {
      console.error(`Error reading directory: ${currentPath}`, err);
      // Optionally re-throw or handle the error differently
    }
  }

  await traverseDirectory(rootPath);

  if (oldestFileDirectory) {
    try {
      const itemsInOldestDirectory = await fs.readdir(oldestFileDirectory);
      const fullPaths = itemsInOldestDirectory.map((item) =>
        path.join(oldestFileDirectory, item)
      );
      console.log(
        `The oldest file is in the directory: ${oldestFileDirectory}`
      );
      console.log("Full paths of files in that directory:");
      return fullPaths;
    } catch (err) {
      console.error(
        `Error reading directory of the oldest file: ${oldestFileDirectory}`,
        err
      );
      return null;
    }
  } else {
    return null;
  }
}

export default {
  getDiskUsagePercentage,
  deleteDbEntryIfFileMissing,
  deleteOldestFileAndDbEntry,
  storageCleanup,
};
