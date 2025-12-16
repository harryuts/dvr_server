import fs from "fs";
import { spawn } from "child_process";
import path from "path";
import configManager from "./configManager.js";
import { db } from "./dbFunctions.js";
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
    // Initialize the command option array.
    let cmd_option;

    // Determine the command options based on the mode.
    if (mode === "start_trim") {
      // Options for trimming from the start of the video.
      cmd_option = [
        "-i",
        inputFile, // Input file flag and path
        "-ss",
        String(offset), // Start time offset for trimming
        "-c",
        "copy", // Codec option to copy the stream without re-encoding
        "-y", // Overwrite output files without asking
        outputFile, // Output file path
      ];
    } else if (mode === "end_trim") {
      // Options for trimming to get a video with the duration specified by the offset.
      cmd_option = [
        "-i",
        inputFile, // Input file flag and path
        "-t",
        String(offset), // Duration of the resulting video after trimming
        "-c",
        "copy", // Codec option to copy the stream without re-encoding
        "-y", // Overwrite output files without asking
        outputFile, // Output file path
      ];
    }

    // Spawn the FFmpeg process with the specified options.
    const ffmpegTrimCmd = spawn("ffmpeg", cmd_option);

    // Pipe FFmpeg's stdout and stderr to the process's respective streams.
    //ffmpegTrimCmd.stdout.pipe(process.stdout);
    //ffmpegTrimCmd.stderr.pipe(process.stderr);

    // Handle the close event of the FFmpeg process.
    ffmpegTrimCmd.on("close", (code) => {
      if (code !== 0) {
        // FFmpeg process closed with an error code, reject the promise.
        return reject("Error trimming the video.");
      }
      // Trimming was successful, resolve the promise.
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
  orderId
) {
  const trimmed_files = [];
  let fileList = files.map((f) => f.filename);
  // If startTime is within the first file, trim the beginning
  if (parseInt(startTime) > parseInt(files[0].start_time)) {
    const trimmedFirstFile = path.join(
      baseVideoDirectory,
      "video_output",
      `trimmed_start_${Date.now()}.mp4`
    );
    const trim_length = parseInt(
      (parseInt(startTime) - parseInt(files[0].start_time)) / 1000
    );
    console.log(`trim length: ${trim_length}`);
    console.log(parseInt(startTime));
    console.log(files[0].start_time);
    console.log(files[0]);
    if (trim_length < CAPTURE_SEGMENT_DURATION - 5) {
      trimmed_files.push(trimmedFirstFile);
      try {
        // console.log(`triming the start ${trim_length}`);
        await trimVideo(
          fileList[0],
          trim_length,
          trimmedFirstFile,
          "start_trim"
        );
        fileList[0] = trimmedFirstFile; // Replace original file with trimmed one in the list
      } catch (error) {
        //return res.status(500).send('Error processing the video.');
      }
    }
  }

  // If endTime is within the last file, trim the end
  if (parseInt(endTime) < parseInt(files[files.length - 1].end_time)) {
    let trim_length;
    if (files.length === 1) {
      trim_length = parseInt((parseInt(endTime) - parseInt(startTime)) / 1000);
    } else {
      trim_length = parseInt(
        (parseInt(endTime) - files[files.length - 1].start_time) / 1000
      );
    }
    if (trim_length > 1) {
      // console.log(`triming the end ${trim_length}`);
      const trimmedLastFile = path.join(
        baseVideoDirectory,
        "video_output",
        `trimmed_end_${Date.now()}.mp4`
      );
      trimmed_files.push(trimmedLastFile);
      try {
        await trimVideo(
          fileList[fileList.length - 1],
          trim_length,
          trimmedLastFile,
          "end_trim"
        );
        fileList[fileList.length - 1] = trimmedLastFile; // Replace original file with trimmed one in the list
      } catch (error) {
        //return res.status(500).send('Error processing the video.');
      }
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
  const filelistPath = path.join(
    baseVideoDirectory,
    "video_output",
    `video_concat_list_${Date.now().toString()}.txt`
  );
  fs.writeFileSync(filelistPath, fileList.map((f) => `file '${f}'`).join("\n"));

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

  ffmpegCmd.stdout.pipe(process.stdout);
  ffmpegCmd.stderr.pipe(process.stderr);

  ffmpegCmd.on("close", (code) => {
    if (code !== 0) {
      return res.status(500).send("Error processing the video.");
    }
    if (storeEvidence) {
      // copy the output file to evidence storage
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
    });
    trimmed_files.length > 0 &&
      trimmed_files.forEach((file) => {
        fs.unlink(file, (err) => {
          if (err) {
            console.error(`Error deleting file ${file}:`, err);
          } else {
            //console.log(`Successfully deleted ${file}`);
          }
        });
      });
  });
}

export async function getVideo(req, res) {
  const { startTime, endTime, channelNumber, storeEvidence, orderId } =
    req.query;

  const query = `SELECT filename, start_time, end_time FROM video_segments WHERE channel_number = ? AND start_time >= ? AND end_time <= ? ORDER BY start_time ASC`;
  let files;
  db.all(
    query,
    [
      channelNumber,
      parseInt(startTime) - CAPTURE_SEGMENT_DURATION * 1000,
      parseInt(endTime) + CAPTURE_SEGMENT_DURATION * 1000,
    ],
    (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(404).send("Unable to query database.");
      }
      files = rows;
      // console.log(files);
      if (files.length === 0) {
        return res
          .status(404)
          .send("No video found for the specified time range.");
      }
      process_video(res, files, startTime, endTime, storeEvidence, orderId);
    }
  );
}

export default { process_video, getVideo };
