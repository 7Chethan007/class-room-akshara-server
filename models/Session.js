const mongoose = require('mongoose');
const crypto = require('crypto');

// In-memory fallback storage for sessions when MongoDB is unavailable
const sessionsMemory = new Map();

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
  className: {
    type: String,
    required: [true, 'Class name is required'],
    trim: true,
    example: 'Class 1, Class 2, College A, etc.',
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
  recordingS3Key: {
    type: String,
  },
  transcriptS3Key: {
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

// Try to create the model
let SessionModel;
try {
  SessionModel = mongoose.model('Session', sessionSchema);
} catch (err) {
  // Model might already exist
  SessionModel = mongoose.model('Session');
}

// Proxy class that uses MongoDB or memory
class SessionWrapper {
  constructor(data) {
    Object.assign(this, data);
    this.sessionId = data.sessionId || crypto.randomBytes(6).toString('hex');
  }

  static isDBConnected() {
    return mongoose.connection.readyState === 1;
  }

  static async create(data) {
    try {
      if (this.isDBConnected()) {
        return await SessionModel.create(data);
      } else {
        const session = new SessionWrapper(data);
        sessionsMemory.set(session.sessionId, session);
        console.log(`💾 [Memory] Session stored: ${session.sessionId}`);
        return session;
      }
    } catch (err) {
      console.error('❌ Session creation failed:', err.message);
      // Fallback to memory on DB failure
      const session = new SessionWrapper(data);
      sessionsMemory.set(session.sessionId, session);
      return session;
    }
  }

  static async findOne(query) {
    try {
      if (this.isDBConnected()) {
        return await SessionModel.findOne(query);
      } else {
        return sessionsMemory.get(query.sessionId) || null;
      }
    } catch (err) {
      return sessionsMemory.get(query.sessionId) || null;
    }
  }

  static async find(query = {}) {
    try {
      if (this.isDBConnected()) {
        return await SessionModel.find(query);
      } else {
        return Array.from(sessionsMemory.values());
      }
    } catch (err) {
      return Array.from(sessionsMemory.values());
    }
  }

  async save() {
    try {
      if (SessionWrapper.isDBConnected()) {
        return await SessionModel.prototype.save.call(this);
      } else {
        sessionsMemory.set(this.sessionId, this);
        return this;
      }
    } catch (err) {
      sessionsMemory.set(this.sessionId, this);
      return this;
    }
  }
}

module.exports = SessionWrapper;
