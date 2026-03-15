const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Track running FFmpeg processes per session
const activeRecordings = {};

/**
 * startRecording — if an RTP port is provided, spawn FFmpeg to record.
 * If no port, create a placeholder file so downstream flow succeeds.
 */
function startRecording(sessionId, rtpPort) {
  const recordingsDir = process.env.RECORDINGS_PATH || './recordings';
  const outputPath = path.join(recordingsDir, `${sessionId}.mp4`);
  ensureDir(recordingsDir);

  // No port → placeholder
  if (!rtpPort) {
    touchFile(outputPath);
    console.log(`ℹ️ No RTP port provided. Placeholder recording created: ${outputPath}`);
    return outputPath;
  }

  const ffmpeg = spawn('ffmpeg', [
    '-i', `rtp://127.0.0.1:${rtpPort}`,
    '-c:v', 'copy',
    '-c:a', 'aac',
    outputPath,
  ]);

  ffmpeg.stderr.on('data', (data) => console.log(`📹 FFmpeg [${sessionId}]: ${data.toString().trim()}`));

  ffmpeg.on('error', (err) => {
    console.warn(`⚠️ FFmpeg spawn failed: ${err.message}. Creating placeholder file.`);
    touchFile(outputPath);
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
 * stopRecording — stop FFmpeg if running; attempt transcription; always
 * return file paths, creating placeholder files when needed.
 */
async function stopRecording(sessionId) {
  const recordingsDir = process.env.RECORDINGS_PATH || './recordings';
  const recordingPath = path.join(recordingsDir, `${sessionId}.mp4`);
  const transcriptPath = path.join(recordingsDir, `${sessionId}.txt`);
  ensureDir(recordingsDir);

  const ffmpeg = activeRecordings[sessionId];
  if (ffmpeg) {
    ffmpeg.kill('SIGINT');
    delete activeRecordings[sessionId];
    console.log(`⏹ Recording stopped for session: ${sessionId}`);
  }

  // Ensure recording file exists
  if (!fs.existsSync(recordingPath)) {
    touchFile(recordingPath);
  }

  try {
    await transcribe(sessionId, recordingsDir);
    console.log(`📝 Transcription complete for session: ${sessionId}`);
  } catch (err) {
    console.warn(`⚠️ Transcription failed: ${err.message}`);
    fs.writeFileSync(transcriptPath, `Transcription failed: ${err.message}`);
  }

  return { recordingPath, transcriptPath };
}

/**
 * transcribe — extract audio then run Whisper CLI.
 * If ffmpeg/whisper are unavailable, promise rejects.
 */
function transcribe(sessionId, recordingsDir) {
  return new Promise((resolve, reject) => {
    const mp4Path = path.join(recordingsDir, `${sessionId}.mp4`);
    const wavPath = path.join(recordingsDir, `${sessionId}.wav`);
    const transcriptPath = path.join(recordingsDir, `${sessionId}.txt`);

    const extract = spawn('ffmpeg', ['-i', mp4Path, '-q:a', '0', '-map', 'a', wavPath]);

    extract.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Audio extraction failed (code ${code})`));
      }

      const whisper = spawn('whisper', [wavPath, '--output_format', 'txt', '--output_dir', recordingsDir]);

      whisper.on('close', (wCode) => {
        if (wCode !== 0) {
          return reject(new Error(`Whisper failed (code ${wCode})`));
        }
        if (!fs.existsSync(transcriptPath)) {
          return reject(new Error('Whisper did not create transcript file'));
        }
        console.log(`✅ Transcript saved: ${transcriptPath}`);
        resolve();
      });

      whisper.on('error', (err) => reject(new Error(`Whisper not found: ${err.message}`)));
    });

    extract.on('error', (err) => reject(new Error(`FFmpeg not found: ${err.message}`)));
  });
}

// Helpers
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function touchFile(filePath) {
  ensureDir(path.dirname(filePath));
  fs.closeSync(fs.openSync(filePath, 'a'));
}

module.exports = { startRecording, stopRecording };
