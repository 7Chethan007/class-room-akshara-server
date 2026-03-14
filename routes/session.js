const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middleware/auth');
const {
  createSession,
  joinSession,
  endSession,
  getAllSessions,
} = require('../controllers/sessionController');

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

module.exports = router;
