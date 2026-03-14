const Session = require('../models/Session');
const { stopRecording } = require('../utils/recorder');

/**
 * createSession — teacher creates a new live class session
 * Generates unique sessionId automatically via the model default.
 */
async function createSession(req, res) {
  try {
    const { subject } = req.body;

    if (!subject) {
      return res.status(400).json({ success: false, message: 'Subject is required' });
    }

    const session = await Session.create({
      subject,
      teacher: req.user._id,
      status: 'live',
      startTime: new Date(),
    });

    console.log(`🎓 Session created: ${session.sessionId} — ${subject}`);

    res.status(201).json({
      success: true,
      data: { sessionId: session.sessionId, subject: session.subject, status: session.status },
    });
  } catch (err) {
    console.error('❌ Create session error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * joinSession — student joins an existing live session
 * Adds the student to the session's students array.
 */
async function joinSession(req, res) {
  try {
    const { sessionId } = req.body;

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (session.status !== 'live') {
      return res.status(400).json({ success: false, message: 'Session is not live' });
    }

    // Avoid duplicate joins (ObjectId comparison)
    const alreadyJoined = session.students.some(
      (id) => id.toString() === req.user._id.toString()
    );
    if (!alreadyJoined) {
      session.students.push(req.user._id);
      await session.save();
    }

    console.log(`📥 Student ${req.user.name} joined session ${sessionId}`);

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        subject: session.subject,
        status: session.status,
        studentCount: session.students.length,
      },
    });
  } catch (err) {
    console.error('❌ Join session error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * endSession — teacher ends the class session
 * Sets status to 'ended', triggers recording finalization + transcription.
 */
async function endSession(req, res) {
  try {
    const { sessionId } = req.body;

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (session.status === 'ended') {
      return res.status(400).json({ success: false, message: 'Session already ended' });
    }

    session.status = 'ended';
    session.endTime = new Date();

    // Trigger recording finalization + transcription (async, non-blocking)
    try {
      const { recordingPath, transcriptPath } = await stopRecording(sessionId);
      session.recordingPath = recordingPath;
      session.transcriptPath = transcriptPath;
    } catch (recErr) {
      console.warn(`⚠️ Recording/transcription not available: ${recErr.message}`);
      // Don't fail the whole endpoint — recording is optional
    }

    await session.save();

    console.log(`🛑 Session ended: ${sessionId}`);

    res.status(200).json({
      success: true,
      data: { sessionId, status: 'ended', endTime: session.endTime },
    });
  } catch (err) {
    console.error('❌ End session error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * getAllSessions — admin retrieves all sessions
 */
async function getAllSessions(req, res) {
  try {
    const sessions = await Session.find()
      .populate('teacher', 'name email')
      .populate('students', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: sessions });
  } catch (err) {
    console.error('❌ Get sessions error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { createSession, joinSession, endSession, getAllSessions };
