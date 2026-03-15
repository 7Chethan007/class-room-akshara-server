const mongoose = require('mongoose');

const transcriptionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    className: {
      type: String,
      trim: true,
      default: 'N/A',
    },
    subject: {
      type: String,
      trim: true,
      default: 'N/A',
    },
    text: {
      type: String,
      default: '', // Full concatenated transcript
    },
    segments: [
      {
        _id: false,
        timestamp: Number, // seconds from session start
        text: String,
        confidence: { type: Number, min: 0, max: 1, default: 0.9 },
        duration: Number, // duration of segment in ms
      },
    ],
    language: {
      type: String,
      default: 'en',
    },
    status: {
      type: String,
      enum: ['recording', 'processing', 'completed', 'error'],
      default: 'recording',
    },
    lastSegmentTime: Date, // last time segment was added
    errorMessage: String, // if status is 'error'
    isLive: {
      type: Boolean,
      default: true, // whether live transcription is active
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Index for fast queries
transcriptionSchema.index({ sessionId: 1, createdAt: -1 });
transcriptionSchema.index({ teacherId: 1, createdAt: -1 });

// Middleware to update text whenever segments change
transcriptionSchema.pre('save', function (next) {
  if (this.segments && this.segments.length > 0) {
    this.text = this.segments.map((s) => s.text).join(' ');
  }
  next();
});

// Add instance method to rebuild text from segments
transcriptionSchema.methods.rebuildText = function () {
  if (this.segments && this.segments.length > 0) {
    this.text = this.segments.map((s) => s.text).join(' ');
  }
  return this.text;
};

module.exports = mongoose.model('Transcription', transcriptionSchema);
