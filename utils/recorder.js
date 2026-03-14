const { spawn } = require('child_process');
const path = require('path');

// Track running FFmpeg processes per session
const activeRecordings = {};

/**
 * startRecording — starts FFmpeg to record the RTP stream for a session
 * Records to /recordings/{sessionId}.mp4
 */
function startRecording(sessionId, rtpPort) {
  const recordingsDir = process.env.RECORDINGS_PATH || './recordings';
  const outputPath = path.join(recordingsDir, `${sessionId}.mp4`);

  const ffmpeg = spawn('ffmpeg', [
    '-i', `rtp://127.0.0.1:${rtpPort}`,
    '-c:v', 'copy',
    '-c:a', 'aac',
    outputPath,
  ]);

  ffmpeg.stderr.on('data', (data) => {
    // FFmpeg logs to stderr by default
    console.log(`📹 FFmpeg [${sessionId}]: ${data.toString().trim()}`);
  });

  ffmpeg.on('close', (code) => {
    console.log(`📹 FFmpeg process exited with code ${code} for session ${sessionId}`);
    delete activeRecordings[sessionId];
  });

  activeRecordings[sessionId] = ffmpeg;
  console.log(`🔴 Recording started for session: ${sessionId}`);

  return outputPath;
}

/**
 * stopRecording — stops FFmpeg and triggers Whisper transcription
 * Returns paths to the recording and transcript files.
 */
async function stopRecording(sessionId) {
  const recordingsDir = process.env.RECORDINGS_PATH || './recordings';
  const recordingPath = path.join(recordingsDir, `${sessionId}.mp4`);
  const transcriptPath = path.join(recordingsDir, `${sessionId}.txt`);

  // Stop FFmpeg if running
  const ffmpeg = activeRecordings[sessionId];
  if (ffmpeg) {
    ffmpeg.kill('SIGINT'); // Graceful stop so FFmpeg finalizes the file
    delete activeRecordings[sessionId];
    console.log(`⏹ Recording stopped for session: ${sessionId}`);
  }

  // Run Whisper transcription (async)
  try {
    await transcribe(sessionId, recordingsDir);
    console.log(`📝 Transcription complete for session: ${sessionId}`);
  } catch (err) {
    console.warn(`⚠️ Transcription failed: ${err.message}`);
  }

  return { recordingPath, transcriptPath };
}

/**
 * transcribe — extracts audio and runs Whisper on it
 * Step 1: FFmpeg extracts audio from .mp4 → .wav
 * Step 2: Whisper converts .wav → .txt
 */
function transcribe(sessionId, recordingsDir) {
  return new Promise((resolve, reject) => {
    const mp4Path = path.join(recordingsDir, `${sessionId}.mp4`);
    const wavPath = path.join(recordingsDir, `${sessionId}.wav`);

    // Step 1: Extract audio
    const extract = spawn('ffmpeg', [
      '-i', mp4Path,
      '-q:a', '0',
      '-map', 'a',
      wavPath,
    ]);

    extract.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Audio extraction failed (code ${code})`));
      }

      // Step 2: Run Whisper
      const whisper = spawn('whisper', [
        wavPath,
        '--output_format', 'txt',
        '--output_dir', recordingsDir,
      ]);

      whisper.on('close', (wCode) => {
        if (wCode !== 0) {
          return reject(new Error(`Whisper failed (code ${wCode})`));
        }
        console.log(`✅ Transcript saved: ${sessionId}.txt`);
        resolve();
      });

      whisper.on('error', (err) => {
        reject(new Error(`Whisper not found: ${err.message}`));
      });
    });

    extract.on('error', (err) => {
      reject(new Error(`FFmpeg not found: ${err.message}`));
    });
  });
}

module.exports = { startRecording, stopRecording };
