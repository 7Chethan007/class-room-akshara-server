const express = require('express');
const router = express.Router();
const multer = require('multer');
const { auth, authorize } = require('../middleware/auth');
const {
  createSession,
  joinSession,
  endSession,
  getAllSessions,
  uploadRecording,
  appendTranscript,
  getSessionResources,
  getSessionRecording,
  getSessionTranscript,
  uploadRecordingFile,
  transcribeSession,
} = require('../controllers/sessionController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 * 500 },
});

/**
 * All session routes are protected by JWT middleware.
 * Role-based access via authorize().
 */

// POST /api/session/create — teacher only
router.post('/create', auth, authorize('teacher'), createSession);

// POST /api/session/join — student only
router.post('/join', auth, authorize('student'), joinSession);

// POST /api/session/end — teacher only
router.post('/end', auth, authorize('teacher'), endSession);

// GET /api/session/all — admin only
router.get('/all', auth, authorize('admin'), getAllSessions);

// POST /api/session/:sessionId/recording — teacher uploads recorded video
router.post('/:sessionId/recording', auth, authorize('teacher'), uploadRecording);

// POST /api/session/:sessionId/recording/file — teacher uploads recorded video file directly
router.post(
  '/:sessionId/recording/file',
  auth,
  authorize('teacher'),
  upload.single('recording'),
  uploadRecordingFile
);

// POST /api/session/:sessionId/transcript — teacher appends transcript text
router.post('/:sessionId/transcript', auth, authorize('teacher'), appendTranscript);

// GET /api/session/:sessionId/resources — teacher/students get saved recording/transcript metadata
router.get('/:sessionId/resources', auth, getSessionResources);

// GET /api/session/:sessionId/recording — download recording binary
router.get('/:sessionId/recording', auth, getSessionRecording);

// GET /api/session/:sessionId/transcript — fetch transcript text/segments
router.get('/:sessionId/transcript', auth, getSessionTranscript);

// POST /api/session/:sessionId/transcribe — teacher triggers Whisper transcription on uploaded recording
router.post('/:sessionId/transcribe', auth, authorize('teacher'), transcribeSession);

module.exports = router;
