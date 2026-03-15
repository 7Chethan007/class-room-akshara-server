const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function sanitizeSegment(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
}

function getArtifactsBaseDir() {
  return process.env.RECORDINGS_PATH || './recordings';
}

function getSessionDir({ teacherId, sessionId }) {
  const baseDir = getArtifactsBaseDir();
  return path.join(baseDir, sanitizeSegment(teacherId), sanitizeSegment(sessionId));
}

function ensureSessionDir({ teacherId, sessionId }) {
  const dir = getSessionDir({ teacherId, sessionId });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveRecordingFilename(mimeType) {
  if (mimeType && mimeType.includes('mp4')) return 'recording.mp4';
  if (mimeType && mimeType.includes('webm')) return 'recording.webm';
  return 'recording.bin';
}

function getRecordingPath({ teacherId, sessionId, mimeType }) {
  const dir = ensureSessionDir({ teacherId, sessionId });
  return path.join(dir, resolveRecordingFilename(mimeType));
}

function getTranscriptPath({ teacherId, sessionId }) {
  const dir = ensureSessionDir({ teacherId, sessionId });
  return path.join(dir, 'transcript.txt');
}

function getMP3Path({ teacherId, sessionId }) {
  const dir = ensureSessionDir({ teacherId, sessionId });
  return path.join(dir, 'recording.mp3');
}

function saveRecordingBuffer({ teacherId, sessionId, buffer, mimeType }) {
  const dir = ensureSessionDir({ teacherId, sessionId });
  const filename = resolveRecordingFilename(mimeType);
  const absolutePath = path.join(dir, filename);
  fs.writeFileSync(absolutePath, buffer);
  return absolutePath;
}

function appendTranscriptText({ teacherId, sessionId, text }) {
  const dir = ensureSessionDir({ teacherId, sessionId });
  const absolutePath = path.join(dir, 'transcript.txt');
  fs.appendFileSync(absolutePath, `${text}\n`, 'utf8');
  return absolutePath;
}

function saveAudioChunk({ teacherId, sessionId, audioBuffer, chunkIndex }) {
  const dir = ensureSessionDir({ teacherId, sessionId });
  const audioPath = path.join(dir, 'recording.wav');
  const metaPath = path.join(dir, '.audio-meta.json');
  
  // If audioBuffer is base64 string, convert to Buffer
  let buffer = audioBuffer;
  if (typeof audioBuffer === 'string') {
    buffer = Buffer.from(audioBuffer, 'base64');
  }
  
  // Track metadata
  let meta = { chunks: 0, totalAudioBytes: 0 };
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (e) {
      meta = { chunks: 0, totalAudioBytes: 0 };
    }
  }
  
  // First chunk - create WAV header
  if (!fs.existsSync(audioPath)) {
    const wavHeader = createWavHeader(0);
    fs.writeFileSync(audioPath, wavHeader);
    meta.chunks = 0;
    meta.totalAudioBytes = 0;
    console.log(`✅ WAV file created with header: ${audioPath}`);
  }
  
  // Check if incoming chunk has WAV header (starts with "RIFF")
  let audioData = buffer;
  if (buffer.length > 44 && 
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    // This is a WAV file - extract audio data only (skip 44-byte header)
    console.log(`[AUDIO-CHUNK] Detected WAV header in chunk, extracting audio data...`);
    audioData = buffer.slice(44);
  }
  
  // Append audio data only (no header)
  fs.appendFileSync(audioPath, audioData);
  
  // Update metadata
  meta.chunks += 1;
  meta.totalAudioBytes += audioData.length;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  
  return audioPath;
}

/**
 * Create proper WAV file header (44 bytes)
 * Format: 16-bit PCM, 16kHz sample rate, mono
 */
function createWavHeader(fileSize) {
  const buffer = Buffer.alloc(44);
  
  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize + 36, 4); // File size - 8
  buffer.write('WAVE', 8);
  
  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);        // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);         // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 22);         // NumChannels (1 = mono)
  buffer.writeUInt32LE(16000, 24);     // SampleRate
  buffer.writeUInt32LE(32000, 28);     // ByteRate (16000 * 2 * 1)
  buffer.writeUInt16LE(2, 32);         // BlockAlign (2 bytes per sample)
  buffer.writeUInt16LE(16, 34);        // BitsPerSample
  
  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(fileSize, 40);  // Subchunk2Size (audio data size)
  
  return buffer;
}

function convertWavToMP3({ teacherId, sessionId }) {
  return new Promise((resolve, reject) => {
    const dir = ensureSessionDir({ teacherId, sessionId });
    const wavPath = path.join(dir, 'recording.wav');
    const mp3Path = getMP3Path({ teacherId, sessionId });
    
    if (!fs.existsSync(wavPath)) {
      console.warn(`⚠️ WAV file not found: ${wavPath}`);
      resolve({ path: mp3Path, success: false });
      return;
    }
    
    console.log(`🔄 Converting WAV to MP3: ${wavPath} → ${mp3Path}`);
    
    // Try FFmpeg first
    const ffmpegProcess = spawn('ffmpeg', [
      '-i', wavPath,
      '-q:a', '5',  // Quality (0-9, lower is better)
      '-n',         // Don't overwrite
      mp3Path
    ], {
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let ffmpegError = '';
    
    ffmpegProcess.stderr.on('data', (data) => {
      ffmpegError += data.toString();
    });
    
    ffmpegProcess.on('close', (code) => {
      if (code === 0 && fs.existsSync(mp3Path)) {
        const stats = fs.statSync(mp3Path);
        console.log(`✅ MP3 created successfully: ${mp3Path} (${stats.size} bytes)`);
        resolve({ path: mp3Path, success: true, size: stats.size });
      } else {
        console.warn(`⚠️ FFmpeg conversion failed or not installed, falling back to WAV copy`);
        try {
          fs.copyFileSync(wavPath, mp3Path);
          const stats = fs.statSync(mp3Path);
          console.log(`✅ MP3 fallback created by copying WAV: ${mp3Path} (${stats.size} bytes)`);
          resolve({ path: mp3Path, success: true, size: stats.size, fallback: true });
        } catch (copyErr) {
          resolve({ path: mp3Path, success: false, error: copyErr.message });
        }
      }
    });
    
    ffmpegProcess.on('error', (err) => {
      console.warn(`⚠️ FFmpeg not available: ${err.message}`);
      resolve({ path: mp3Path, success: false });
    });
  });
}

function finalizeAudioRecording({ teacherId, sessionId }) {
  const dir = ensureSessionDir({ teacherId, sessionId });
  const audioPath = path.join(dir, 'recording.wav');
  const metaPath = path.join(dir, '.audio-meta.json');
  
  // Verify file exists and has data
  if (fs.existsSync(audioPath)) {
    const stats = fs.statSync(audioPath);
    const fileSize = stats.size;
    
    // Read metadata
    let meta = { chunks: 0, totalAudioBytes: 0 };
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {
        // Use file size to estimate audio bytes
        meta.totalAudioBytes = Math.max(0, fileSize - 44);
      }
    } else {
      meta.totalAudioBytes = Math.max(0, fileSize - 44);
    }
    
    // Update WAV header with correct file size
    const audioDataSize = meta.totalAudioBytes;
    
    // Read existing file
    const fileBuffer = fs.readFileSync(audioPath);
    
    // Update file size in RIFF header (bytes 4-7)
    // RIFF size = total file size - 8
    fileBuffer.writeUInt32LE(fileSize - 8, 4);
    
    // Update data chunk size (bytes 40-43)
    fileBuffer.writeUInt32LE(audioDataSize, 40);
    
    // Write back the corrected file
    fs.writeFileSync(audioPath, fileBuffer);
    
    console.log(`✅ Audio recording finalized: ${audioPath}`);
    console.log(`   Total file size: ${fileSize} bytes`);
    console.log(`   Audio data: ${audioDataSize} bytes`);
    console.log(`   Chunks received: ${meta.chunks}`);
    
    // Cleanup metadata file
    try {
      fs.unlinkSync(metaPath);
    } catch (e) {
      // ignore
    }
    
    // Attempt MP3 conversion
    convertWavToMP3({ teacherId, sessionId }).catch(err => {
      console.warn(`⚠️ MP3 conversion failed: ${err.message}`);
    });
    
    return { path: audioPath, size: fileSize, audioDataSize };
  }
  
  return { path: audioPath, size: 0, audioDataSize: 0 };
}

module.exports = {
  getSessionDir,
  ensureSessionDir,
  getRecordingPath,
  getTranscriptPath,
  getMP3Path,
  saveRecordingBuffer,
  appendTranscriptText,
  saveAudioChunk,
  convertWavToMP3,
  finalizeAudioRecording,
};
