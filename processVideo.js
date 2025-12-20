import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import configManager from "./configManager.js";
import { db } from "./dbFunctions.js";
import { getRecordingStatus } from "./recording.js";
//======================================================
const baseVideoDirectory = configManager.baseVideoDirectory;
const CAPTURE_SEGMENT_DURATION = configManager.segmentDuration;
//======================================================

/**
 * Trims a video file either from the start or the end based on the given mode.
 *
 * @param {string} inputFile - The path to the input video file.
 * @param {number|string} offset - The time offset in seconds to start the trim from (if mode is 'start_trim'),
 *                                 or the duration of the resulting video (if mode is 'end_trim').
 * @param {string} outputFile - The path where the output video will be saved.
 * @param {'start_trim' | 'end_trim'} mode - The mode of trimming. 'start_trim' trims from the start of the video,
 *                                           'end_trim' trims from the end of the video.
 * @returns {Promise<void>} A promise that resolves when the trimming is complete or rejects with an error message.
 */
function trimVideo(inputFile, offset, outputFile, mode) {
  return new Promise((resolve, reject) => {
    let cmd_option;

    if (mode === "start_trim") {
      cmd_option = [
        "-i",
        inputFile,
        "-ss",
        String(offset),
        "-c",
        "copy",
        "-y",
        outputFile,
      ];
    } else if (mode === "end_trim") {
      cmd_option = [
        "-i",
        inputFile,
        "-t",
        String(offset),
        "-c",
        "copy",
        "-y",
        outputFile,
      ];
    }

    const ffmpegTrimCmd = spawn("ffmpeg", cmd_option);

    ffmpegTrimCmd.on("close", (code) => {
      console.log(`[trimVideo] FFmpeg process for ${mode} exited with code ${code}`);
      if (code !== 0) {
        return reject(`Error trimming the video (exit code ${code}).`);
      }
      resolve();
    });
  });
}

/**
 * Extracts a partial segment from an in-progress recording file.
 *
 * @param {string} inputFile - Path to the in-progress segment file.
 * @param {number} segmentStartTime - Start time of the segment (epoch ms).
 * @param {number} requestedEndTime - End time requested by the client (epoch ms).
 * @param {string} outputFile - Path for the extracted partial file.
 * @returns {Promise<void>}
 */
function extractPartialSegment(inputFile, segmentStartTime, requestedEndTime, outputFile) {
  return new Promise((resolve, reject) => {
    const durationSeconds = Math.floor((requestedEndTime - segmentStartTime) / 1000);
    if (durationSeconds <= 0) {
      return reject("Invalid duration for partial segment extraction.");
    }

    console.log(`Extracting partial segment: ${durationSeconds}s from ${inputFile}`);

    const cmd_option = [
      "-i",
      inputFile,
      "-t",
      String(durationSeconds),
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "-y",
      outputFile,
    ];

    const ffmpegCmd = spawn("ffmpeg", cmd_option);

    ffmpegCmd.on("close", (code) => {
      console.log(`[extractPartialSegment] FFmpeg process exited with code ${code}`);
      if (code !== 0) {
        return reject(`Error extracting partial segment (exit code ${code}).`);
      }
      resolve();
    });
  });
}

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
  console.log(`[process_video] Start. Files: ${files.length}, Start: ${startTimeStr} (${startTime}), End: ${endTimeStr} (${endTime}), InProgress: ${inProgressSegment ? "Yes" : "No"}`);
  const trimmed_files = [];
  let fileList = files.map((f) => f.filename);
  console.log(`[process_video] Initial file list: ${JSON.stringify(fileList)}`);

  // Add in-progress segment if provided
  if (inProgressSegment) {
    fileList.push(inProgressSegment.filename);
    files.push(inProgressSegment);
  }

  // If startTime is within the first file, trim the beginning
  if (files.length > 0 && parseInt(startTime) > parseInt(files[0].start_time)) {
    const trim_length = Math.floor(
      (parseInt(startTime) - parseInt(files[0].start_time)) / 1000
    );
    if (trim_length > 0 && trim_length < CAPTURE_SEGMENT_DURATION - 1) {
      const trimmedFirstFile = path.join(
        baseVideoDirectory,
        "video_output",
        `trimmed_start_${Date.now()}.mp4`
      );
      console.log(`[process_video] Trimming start of ${fileList[0]} by ${trim_length}s to ${trimmedFirstFile}`);
      trimmed_files.push(trimmedFirstFile);
      try {
        await trimVideo(
          fileList[0],
          trim_length,
          trimmedFirstFile,
          "start_trim"
        );
        fileList[0] = trimmedFirstFile;
        console.log(`[process_video] Trim start success.`);
      } catch (error) {
        console.error("Error trimming start:", error);
      }
    } else {
      console.log(`[process_video] Skipping start trim (offset: ${trim_length}s)`);
    }
  }

  // If endTime is within the last file, trim the end
  if (files.length > 0 && parseInt(endTime) < parseInt(files[files.length - 1].end_time)) {
    let trim_length;
    if (files.length === 1 && parseInt(startTime) > parseInt(files[0].start_time)) {
      trim_length = Math.floor((parseInt(endTime) - parseInt(startTime)) / 1000);
    } else {
      trim_length = Math.floor(
        (parseInt(endTime) - parseInt(files[files.length - 1].start_time)) / 1000
      );
    }

    // Total duration of last file (metadata approx)
    const lastFileMetaDuration = (parseInt(files[files.length - 1].end_time) - parseInt(files[files.length - 1].start_time)) / 1000;

    if (trim_length > 0 && trim_length < lastFileMetaDuration - 1) {
      const trimmedLastFile = path.join(
        baseVideoDirectory,
        "video_output",
        `trimmed_end_${Date.now()}.mp4`
      );
      console.log(`[process_video] Trimming end of ${fileList[fileList.length - 1]} with duration ${trim_length}s to ${trimmedLastFile}`);
      trimmed_files.push(trimmedLastFile);
      try {
        await trimVideo(
          fileList[fileList.length - 1],
          trim_length,
          trimmedLastFile,
          "end_trim"
        );
        fileList[fileList.length - 1] = trimmedLastFile;
        console.log(`[process_video] Trim end success.`);
      } catch (error) {
        console.error("Error trimming end:", error);
      }
    } else {
      console.log(`[process_video] Skipping end trim (duration: ${trim_length}s / file: ${lastFileMetaDuration}s)`);
    }
  }

  // Concatenate the files
  let outputVideoFile = `output_${Date.now()}.mp4`;
  if (storeEvidence && orderId) {
    outputVideoFile = `cctv_${orderId}.mp4`;
  }
  const outputVideoPath = path.join(
    baseVideoDirectory,
    "video_output",
    outputVideoFile
  );
  // Filter out empty files before concatenation
  console.log("[process_video] Validating file sizes and metadata...");
  const validFiles = await Promise.all(fileList.map(async (file, index) => {
    try {
      const stats = await fs.promises.stat(file);
      const fileMeta = files[index];
      const startTimeStr = new Date(parseInt(fileMeta.start_time)).toLocaleTimeString();
      const endTimeStr = new Date(parseInt(fileMeta.end_time)).toLocaleTimeString();

      console.log(`[process_video] Segment ${index}: ${file} | Size: ${stats.size} bytes | Range: ${startTimeStr} - ${endTimeStr}`);

      if (stats.size > 100000) return file;
      console.warn(`[process_video] File ${file} is too small (${stats.size} bytes), excluding from list.`);
      return null;
    } catch (e) {
      console.warn(`[process_video] File ${file} error or not found, excluding from list.`);
      return null;
    }
  }));

  const filteredFileList = validFiles.filter(f => f !== null);
  console.log(`[process_video] Final file list for concatenation: ${JSON.stringify(filteredFileList)}`);

  if (filteredFileList.length === 0) {
    console.error(`[process_video] No valid files left to process.`);
    return res.status(404).send("No video found for the specified time range.");
  }

  const filelistPath = path.join(
    baseVideoDirectory,
    "video_output",
    `video_concat_list_${Date.now().toString()}.txt`
  );
  fs.writeFileSync(filelistPath, filteredFileList.map((f) => `file '${f}'`).join("\n"));

  const ffmpegCmd = spawn("ffmpeg", [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    filelistPath,
    "-y",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputVideoPath,
  ]);

  console.log(`[process_video] Executing FFmpeg concat command: ffmpeg -f concat -safe 0 -i ${filelistPath} ...`);

  ffmpegCmd.stdout.pipe(process.stdout);
  ffmpegCmd.stderr.pipe(process.stderr);

  ffmpegCmd.on("close", (code) => {
    console.log(`[process_video] FFmpeg process exited with code ${code}`);
    if (code !== 0) {
      return res.status(500).send("Error processing the video.");
    }
    if (storeEvidence) {
      const sourcePath = path.join(
        baseVideoDirectory,
        "video_output",
        outputVideoFile
      );
      const destinationPath = path.join(
        baseVideoDirectory,
        "evidence",
        outputVideoFile
      );
      fs.copyFile(sourcePath, destinationPath, (err) => {
        if (err) console.log("evidence file copy error");
        console.log("File was copied successfully");
      });
    }
    res.json({
      outputFile: outputVideoFile,
      from: new Date(parseInt(startTime)).toLocaleTimeString(),
      to: new Date(parseInt(endTime)).toLocaleTimeString(),
      fromEpoch: parseInt(startTime),
      toEpoch: parseInt(endTime),
    });
    trimmed_files.length > 0 &&
      trimmed_files.forEach((file) => {
        fs.unlink(file, (err) => {
          if (err) {
            console.error(`Error deleting file ${file}:`, err);
          }
        });
      });
  });
}

export async function getVideo(req, res) {
  const { startTime, endTime, channelNumber, storeEvidence, orderId } =
    req.query;

  let requestedStartTime = parseInt(startTime);
  let requestedEndTime = parseInt(endTime);

  // Adjust if start time is too close to current time (within 3 seconds)
  const now = Date.now();
  const bufferMs = 3000; // 3 seconds

  if (requestedStartTime > now - bufferMs) {
    const originalStartTime = requestedStartTime;
    requestedStartTime = now - bufferMs;
    console.log(`[getVideo] Adjusted start time from ${new Date(originalStartTime).toLocaleTimeString()} to ${new Date(requestedStartTime).toLocaleTimeString()} (too close to current time)`);
  }


  const startTimeStr = new Date(requestedStartTime).toLocaleTimeString();
  const endTimeStr = new Date(requestedEndTime).toLocaleTimeString();

  console.log(`[getVideo] Received request for Channel: ${channelNumber}, Start: ${startTimeStr} (${requestedStartTime}), End: ${endTimeStr} (${requestedEndTime})`);

  // Check if requested time falls into current recording segment
  const recordingStatus = getRecordingStatus(channelNumber);
  let inProgressSegment = null;

  if (
    recordingStatus.isRecording &&
    recordingStatus.currentSegmentFile &&
    recordingStatus.currentSegmentStartTime &&
    requestedEndTime > recordingStatus.currentSegmentStartTime
  ) {
    console.log(`Request includes in-progress segment for ${channelNumber}`);
    const partialOutputFile = path.join(
      baseVideoDirectory,
      "video_output",
      `partial_${Date.now()}.mp4`
    );
    try {
      await extractPartialSegment(
        recordingStatus.currentSegmentFile,
        recordingStatus.currentSegmentStartTime,
        requestedEndTime,
        partialOutputFile
      );
      inProgressSegment = {
        filename: partialOutputFile,
        start_time: recordingStatus.currentSegmentStartTime,
        end_time: requestedEndTime,
      };
    } catch (error) {
      console.error("Error extracting partial segment:", error);
    }
  }

  // Improved query to find overlapping segments:
  // start_time < requestedEndTime AND end_time > requestedStartTime
  const query = `SELECT filename, start_time, end_time FROM video_segments WHERE channel_number = ? AND start_time < ? AND end_time > ? ORDER BY start_time ASC`;
  db.all(
    query,
    [
      channelNumber,
      requestedEndTime,
      requestedStartTime,
    ],
    (err, rows) => {
      if (err) {
        console.error(`[getVideo] DB error: ${err.message}`);
        return res.status(404).send("Unable to query database.");
      }
      console.log(`[getVideo] DB found ${rows.length} segments in range.`);
      let files = rows;
      if (files.length === 0 && !inProgressSegment) {
        console.warn(`[getVideo] No video segments found in DB and no in-progress segment for Channel ${channelNumber}`);
        return res
          .status(404)
          .send("No video found for the specified time range.");
      }
      process_video(res, rows, requestedStartTime, requestedEndTime, storeEvidence, orderId, inProgressSegment);
    }
  );
}

export default { process_video, getVideo };
