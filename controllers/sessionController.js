const Session = require('../models/Session');
const { startRecording, stopRecording } = require('../utils/recorder');
const fs = require('fs');
const {
  saveRecordingBuffer,
  appendTranscriptText,
  getRecordingPath,
  getTranscriptPath,
} = require('../utils/sessionArtifacts');
const { hasOpenAi, transcribeRecording } = require('../utils/transcriptionService');
const { uploadSessionDirectory } = require('../utils/s3Upload');

function isSessionParticipant(session, userId) {
  if (session.teacher.toString() === userId.toString()) {
    return true;
  }
  return session.students.some((id) => id.toString() === userId.toString());
}

/**
 * createSession — teacher creates a new live class session
 * Generates unique sessionId automatically via the model default.
 */
async function createSession(req, res) {
  try {
    const { subject, className } = req.body;

    if (!subject) {
      return res.status(400).json({ success: false, message: 'Subject is required' });
    }

    const session = await Session.create({
      subject,
      className: className || 'ClassRoom Live',
      teacher: req.user._id,
      status: 'live',
      startTime: new Date(),
    });

    // Start a placeholder recording so files exist even without RTP hookup
    try {
      startRecording(session.sessionId);
    } catch (recErr) {
      console.warn(`⚠️ Recording start failed: ${recErr.message}`);
    }

    console.log(`🎓 Session created: ${session.sessionId} — ${className} [${subject}]`);

    res.status(201).json({
      success: true,
      data: { 
        sessionId: session.sessionId, 
        subject: session.subject,
        className: session.className,
        status: session.status 
      },
    });
  } catch (err) {
    console.error('❌ Create session error:', err.message);
    
    // Check if it's a database connection error
    if (err.message.includes('buffering timed out') || err.name === 'MongooseError') {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection failed. Please ensure MongoDB is running.',
        details: 'MongoDB is not connected. Start MongoDB and try again.'
      });
    }
    
    res.status(500).json({ success: false, message: 'Server error: ' + err.message });
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
        className: session.className,
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

    // ☁️ UPLOAD TO S3 IMMEDIATELY (before DB save, so it works even if DB is down)
    let s3UploadResults = [];
    const uploadFlag = (`${process.env.UPLOAD_TO_S3 || ''}`).trim().toLowerCase();
    if (uploadFlag === 'true') {
      try {
        console.log(`☁️ Starting S3 upload for session: ${session.sessionId}`);
        s3UploadResults = await uploadSessionDirectory({
          teacherId: session.teacher,
          sessionId: session.sessionId,
        });
        console.log(`☁️ S3 upload completed for ${session.sessionId}:`);
        s3UploadResults.forEach((r) => {
          if (r.success) {
            console.log(`   ✅ Uploaded: ${r.key}`);
          } else {
            console.log(`   ❌ Failed: ${r.key || 'unknown'} - ${r.error || r.message}`);
          }
        });

        // Store S3 keys in session
        const rec = s3UploadResults.find((r) => r.key && r.key.endsWith('recording.mp3')) ||
                    s3UploadResults.find((r) => r.key && r.key.endsWith('recording.wav'));
        const trn = s3UploadResults.find((r) => r.key && r.key.endsWith('transcript.txt'));
        if (rec?.success) session.recordingS3Key = rec.key;
        if (trn?.success) session.transcriptS3Key = trn.key;
      } catch (err) {
        console.warn(`⚠️ S3 upload failed for ${session.sessionId}: ${err.message}`);
      }
    } else {
      console.log(`☁️ S3 upload skipped (UPLOAD_TO_S3=${process.env.UPLOAD_TO_S3 || 'unset'})`);
    }

    // Try to save to database (best effort - don't fail if DB is down)
    try {
      await session.save();
      console.log(`💾 Session saved to database: ${sessionId}`);
    } catch (dbErr) {
      console.warn(`⚠️ Could not save session to database: ${dbErr.message}`);
      console.log(`   (But S3 upload was successful - files are safe in cloud)`);
    }

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

/**
 * uploadRecording — stores session recording in MongoDB
 */
async function uploadRecording(req, res) {
  try {
    const { sessionId } = req.params;
    const { dataBase64, mimeType = 'video/webm', durationMs } = req.body;

    if (!dataBase64) {
      return res.status(400).json({ success: false, message: 'dataBase64 is required' });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (session.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only session teacher can upload recording' });
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    const recordingPath = saveRecordingBuffer({
      teacherId: session.teacher,
      sessionId,
      buffer,
      mimeType,
    });

    session.recording = {
      data: buffer,
      mimeType,
      size: buffer.length,
      durationMs: Number(durationMs) || undefined,
      uploadedAt: new Date(),
    };
    session.recordingPath = recordingPath;

    await session.save();

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        size: buffer.length,
        mimeType,
      },
    });
  } catch (err) {
    console.error('❌ Upload recording error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * uploadRecordingFile — stores uploaded recording file from multipart/form-data
 */
async function uploadRecordingFile(req, res) {
  try {
    const { sessionId } = req.params;
    const durationMs = Number(req.body?.durationMs) || undefined;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'recording file is required' });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (session.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only session teacher can upload recording' });
    }

    const mimeType = file.mimetype || 'video/webm';
    const recordingPath = saveRecordingBuffer({
      teacherId: session.teacher,
      sessionId,
      buffer: file.buffer,
      mimeType,
    });

    session.recording = {
      data: file.buffer,
      mimeType,
      size: file.size,
      durationMs,
      uploadedAt: new Date(),
    };
    session.recordingPath = recordingPath;
    await session.save();

    return res.status(200).json({
      success: true,
      data: {
        sessionId,
        size: file.size,
        mimeType,
      },
    });
  } catch (err) {
    console.error('❌ Upload recording file error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * appendTranscript — appends live transcript segments and keeps merged text
 */
async function appendTranscript(req, res) {
  try {
    const { sessionId } = req.params;
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Transcript text is required' });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (session.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only session teacher can append transcript' });
    }

    if (!session.transcript) {
      session.transcript = { text: '', segments: [], updatedAt: new Date() };
    }

    const transcriptPath = appendTranscriptText({
      teacherId: session.teacher,
      sessionId,
      text: text.trim(),
    });

    session.transcript.segments.push({
      text: text.trim(),
      at: new Date(),
      by: req.user._id,
    });
    session.transcript.text = `${session.transcript.text || ''}${text.trim()}\n`;
    session.transcript.updatedAt = new Date();
    session.transcriptPath = transcriptPath;

    await session.save();

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        transcriptLength: session.transcript.text.length,
        segments: session.transcript.segments.length,
      },
    });
  } catch (err) {
    console.error('❌ Append transcript error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * getSessionResources — returns recording/transcript availability metadata
 */
async function getSessionResources(req, res) {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId }).select(
      'sessionId subject teacher students status recording transcript updatedAt'
    );

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (!isSessionParticipant(session, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized for this session' });
    }

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        subject: session.subject,
        status: session.status,
        hasRecording: Boolean(session.recording?.data?.length),
        recordingSize: session.recording?.size || 0,
        recordingMimeType: session.recording?.mimeType || null,
        transcriptText: session.transcript?.text || '',
        transcriptSegments: session.transcript?.segments?.length || 0,
      },
    });
  } catch (err) {
    console.error('❌ Get resources error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * getSessionRecording — streams stored recording binary from MongoDB
 */
async function getSessionRecording(req, res) {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId }).select('teacher students recording recordingPath');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (!isSessionParticipant(session, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized for this session' });
    }

    if (!session.recording?.data && (!session.recordingPath || !fs.existsSync(session.recordingPath))) {
      return res.status(404).json({ success: false, message: 'Recording not available' });
    }

    if (session.recording?.data) {
      res.setHeader('Content-Type', session.recording.mimeType || 'video/webm');
      res.setHeader('Content-Length', session.recording.size || session.recording.data.length);
      res.setHeader('Content-Disposition', `inline; filename="${sessionId}.webm"`);
      return res.status(200).send(session.recording.data);
    }

    return res.status(200).sendFile(session.recordingPath);
  } catch (err) {
    console.error('❌ Get recording error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * getSessionTranscript — returns transcript payload from MongoDB
 */
async function getSessionTranscript(req, res) {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId }).select('teacher students transcript');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (!isSessionParticipant(session, req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized for this session' });
    }

    res.status(200).json({
      success: true,
      data: {
        text: session.transcript?.text || '',
        segments: session.transcript?.segments || [],
      },
    });
  } catch (err) {
    console.error('❌ Get transcript error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * transcribeSession — runs Whisper on session recording and persists transcript
 */
async function transcribeSession(req, res) {
  try {
    const { sessionId } = req.params;
    const session = await Session.findOne({ sessionId }).select('teacher recording recordingPath transcript');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    if (session.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only session teacher can transcribe session' });
    }

    if (!session.recordingPath && !session.recording?.data) {
      return res.status(400).json({ success: false, message: 'Recording is required before transcription' });
    }

    if (!hasOpenAi()) {
      return res.status(400).json({ success: false, message: 'OPENAI_API_KEY is not configured' });
    }

    let recordingPath = session.recordingPath;
    if (!recordingPath && session.recording?.data) {
      recordingPath = getRecordingPath({
        teacherId: session.teacher,
        sessionId,
        mimeType: session.recording.mimeType || 'video/webm',
      });
      fs.writeFileSync(recordingPath, session.recording.data);
      session.recordingPath = recordingPath;
    }

    const transcriptResult = await transcribeRecording(recordingPath);
    const transcriptText = transcriptResult.text || '';

    if (!session.transcript) {
      session.transcript = { text: '', segments: [], updatedAt: new Date() };
    }

    if (transcriptText) {
      session.transcript.text = transcriptText;
      session.transcript.segments = transcriptResult.segments.map((segment) => ({
        text: segment.text,
        at: new Date(),
        by: req.user._id,
      }));
      session.transcript.updatedAt = new Date();

      const transcriptPath = getTranscriptPath({ teacherId: session.teacher, sessionId });
      fs.writeFileSync(transcriptPath, `${transcriptText}\n`, 'utf8');
      session.transcriptPath = transcriptPath;
    }

    await session.save();

    return res.status(200).json({
      success: true,
      data: {
        sessionId,
        text: transcriptText,
        segments: session.transcript.segments.length,
      },
    });
  } catch (err) {
    console.error('❌ Transcribe session error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
}

module.exports = {
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
};
