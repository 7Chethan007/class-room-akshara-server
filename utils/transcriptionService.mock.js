/**
 * Temporary Mock Transcription Service
 * While Whisper CLI setup is completed
 * 
 * Replace with real Whisper once installed
 */

const fs = require('fs');
const path = require('path');

let whisperModel = null;

async function initWhisper() {
  if (whisperModel) return whisperModel;
  console.log('[TRANSCRIPTION] ⚠️  Using MOCK transcription (Whisper not set up)');
  console.log('[TRANSCRIPTION] 📝 To enable real transcription:');
  console.log('[TRANSCRIPTION]    1. Install Python 3.9+');
  console.log('[TRANSCRIPTION]    2. Run: pip install openai-whisper');
  console.log('[TRANSCRIPTION]    3. Restart server');
  return { mock: true };
}

async function transcribeRecording(recordingPath) {
  if (!fs.existsSync(recordingPath)) {
    throw new Error(`Recording file not found: ${recordingPath}`);
  }

  try {
    // Mock: return simulated transcription
    console.log(`[TRANSCRIPTION] 🎭 Mock transcription: ${recordingPath}`);
    return {
      text: '[MOCK] This is a simulated transcription. Real Whisper not installed.',
      segments: [
        { text: '[MOCK] Segment 1', start: 0, end: 2 },
        { text: '[MOCK] Segment 2', start: 2, end: 4 },
      ],
    };
  } catch (err) {
    console.error('[TRANSCRIPTION] Error transcribing file:', err.message);
    throw err;
  }
}

async function transcribeAudioChunk(audioBuffer, timestamp = 0) {
  try {
    // Mock: return simulated transcription for small audio chunks
    // Real implementation would wait for substantial audio
    if (!audioBuffer || audioBuffer.length === 0) {
      return { text: '', confidence: 0, timestamp };
    }

    // Mock: Simulate 10% chance of having speech in a chunk
    const hasLikelySpeech = Math.random() < 0.1;
    
    if (hasLikelySpeech) {
      const sampleTexts = [
        'Hello everyone',
        'Good morning',
        'Today we will discuss',
        'The chapter is about',
        'Let me explain this',
      ];
      const mockText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
      console.log(`[TRANSCRIPTION] 🎭 Mock transcribed: "${mockText}"`);
      return {
        text: mockText,
        confidence: 0.9,
        timestamp,
      };
    }

    return { text: '', confidence: 0, timestamp };
  } catch (err) {
    console.error('[TRANSCRIPTION] ❌ Error transcribing chunk:', err.message);
    return { text: '', confidence: 0, timestamp, error: err.message };
  }
}

function hasTranscription() {
  return true; // Mock is always available
}

module.exports = {
  hasTranscription,
  initWhisper,
  transcribeRecording,
  transcribeAudioChunk,
};
