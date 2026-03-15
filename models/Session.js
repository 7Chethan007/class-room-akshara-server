const mongoose = require('mongoose');
const crypto = require('crypto');

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    unique: true,
    default: () => crypto.randomBytes(6).toString('hex'),
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  students: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended'],
    default: 'scheduled',
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  recordingPath: {
    type: String,
  },
  transcriptPath: {
    type: String,
  },
  recording: {
    data: Buffer,
    mimeType: String,
    size: Number,
    durationMs: Number,
    uploadedAt: Date,
  },
  transcript: {
    text: {
      type: String,
      default: '',
    },
    segments: [
      {
        text: String,
        at: {
          type: Date,
          default: Date.now,
        },
        by: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
      },
    ],
    updatedAt: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Session', sessionSchema);
