const fs = require('fs');
const path = require('path');

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

module.exports = {
  getSessionDir,
  ensureSessionDir,
  getRecordingPath,
  getTranscriptPath,
  saveRecordingBuffer,
  appendTranscriptText,
};
