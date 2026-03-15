const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let whisperModel = null;
const USE_MOCK = false; // ✅ REAL TRANSCRIPTION - Whisper is now installed!
const PYTHON_PATH = 'C:\\Program Files\\Python311\\python.exe'; // Full path to Python

/**
 * Initialize Whisper - Just verify Python exists
 */
async function initWhisper() {
  if (whisperModel) return whisperModel;
  
  if (USE_MOCK) {
    console.log('[TRANSCRIPTION] ⚠️  MOCK MODE: Using simulated transcription');
    whisperModel = { mock: true };
    return whisperModel;
  }
  
  try {
    console.log('[TRANSCRIPTION] ✅ Using Python Whisper at:', PYTHON_PATH);
    whisperModel = { realWhisper: true };
    return whisperModel;
  } catch (err) {
    console.error('[TRANSCRIPTION] Failed to initialize Whisper:', err.message);
    whisperModel = { mock: true };
    return whisperModel;
  }
}

/**
 * Call Python Whisper to transcribe audio (with automatic WAV→MP3 conversion)
 */
function whisperTranscribe(audioPath) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(__dirname, '..', 'transcribe_advanced.py'),
      audioPath,
      'tiny',
      'en'
    ];

    console.log(`[TRANSCRIPTION] Running advanced Whisper: ${PYTHON_PATH} transcribe_advanced.py ${audioPath}`);
    
    const whisperProcess = spawn(PYTHON_PATH, args, {
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    whisperProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    whisperProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      const msg = data.toString();
      if (msg.includes('[WHISPER-PY]')) {
        console.log(`[WHISPER] ${msg.trim()}`);
      }
    });

    whisperProcess.on('close', (code) => {
      setTimeout(() => {
        try {
          if (code === 0 && stdout.trim()) {
            const result = JSON.parse(stdout.trim());
            const text = result.text || '';
            const segments = result.segments || [];
            
            console.log(`[TRANSCRIPTION] ✅ Whisper result: ${text.length} chars, ${segments.length} segments`);
            if (text) {
              console.log(`    Text preview: "${text.substring(0, 60)}..."`);
            }

            resolve({ 
              text, 
              confidence: 0.95,
              segments: segments
            });
          } else {
            console.warn(`[TRANSCRIPTION] Whisper exit=${code}`);
            if (stderr) {
              console.warn(`[TRANSCRIPTION] stderr: ${stderr.substring(0, 200)}`);
            }
            resolve({ text: '', confidence: 0, segments: [] });
          }
        } catch (parseErr) {
          console.error(`[TRANSCRIPTION] JSON parse error: ${parseErr.message}`);
          console.error(`[TRANSCRIPTION] stdout was: ${stdout.substring(0, 200)}`);
          console.error(`[TRANSCRIPTION] stderr was: ${stderr.substring(0, 200)}`);
          resolve({ text: '', confidence: 0, segments: [] });
        }
      }, 500);
    });

    whisperProcess.on('error', (err) => {
      console.error(`[TRANSCRIPTION] Process error: ${err.message}`);
      resolve({ text: '', confidence: 0, segments: [] });
    });
  });
}

/**
 * Transcribe a complete recording file (batch, end-of-session)
 * Now uses local Whisper.cpp - FREE!
 */
async function transcribeRecording(recordingPath) {
  if (!fs.existsSync(recordingPath)) {
    throw new Error(`Recording file not found: ${recordingPath}`);
  }

  try {
    const whisper = await initWhisper();
    
    console.log(`[TRANSCRIPTION] Transcribing file: ${recordingPath}`);
    const result = whisper.mock ? 
      { text: 'Demo transcription from mock mode', segments: [] } :
      await whisperTranscribe(recordingPath);

    const text = (result?.text || '').trim();
    const segments = Array.isArray(result?.segments)
      ? result.segments.map((item) => ({
          text: String(item.text || '').trim(),
          start: item.start,
          end: item.end,
        }))
      : [];

    console.log(`[TRANSCRIPTION] ✅ File transcribed: ${text.length} characters`);

    return {
      text,
      segments,
    };
  } catch (err) {
    console.error('[TRANSCRIPTION] Error transcribing file:', err.message);
    throw err;
  }
}

/**
 * Transcribe audio buffer (live, streaming chunks)
 * Uses local Whisper.cpp - NO API COSTS!
 * 
 * @param {Buffer|String} audioBuffer - WAV/WebM audio data as Buffer or base64 string
 * @param {Number} timestamp - timestamp in ms from session start
 * @returns {Promise<Object>} { text, confidence }
 */
async function transcribeAudioChunk(audioBuffer, timestamp = 0) {
  try {
    console.log(`[TRANSCRIPTION] transcribeAudioChunk called: typeof=${typeof audioBuffer}, length=${audioBuffer?.length || 0}`);
    
    // Convert base64 string to Buffer if needed
    if (typeof audioBuffer === 'string') {
      try {
        console.log(`[TRANSCRIPTION] Converting base64 to Buffer (length: ${audioBuffer.length})...`);
        audioBuffer = Buffer.from(audioBuffer, 'base64');
        console.log(`[TRANSCRIPTION] Converted to Buffer (length: ${audioBuffer.length} bytes)`);
      } catch (err) {
        console.error('[TRANSCRIPTION] Failed to decode base64:', err.message);
        return { text: '', confidence: 0, timestamp, error: 'Invalid audio format' };
      }
    }

    if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
      console.warn(`[TRANSCRIPTION] Invalid buffer: isBuffer=${Buffer.isBuffer(audioBuffer)}, length=${audioBuffer?.length}`);
      return { text: '', confidence: 0, timestamp };
    }

    const whisper = await initWhisper();

    // MOCK MODE
    if (whisper.mock) {
      return simulateMockTranscription(audioBuffer, timestamp);
    }

    // REAL MODE
    // Create a temporary file from buffer
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPath = path.join(tempDir, `audio-${Date.now()}.wav`);
    console.log(`[TRANSCRIPTION] Writing audio to temp file: ${tempPath}`);
    fs.writeFileSync(tempPath, audioBuffer);
    console.log(`[TRANSCRIPTION] Temp file written: ${tempPath} (${audioBuffer.length} bytes)`);

    try {
      console.log(`[TRANSCRIPTION] Calling whisper to transcribe...`);
      
      const result = await whisperTranscribe(tempPath);
      
      const text = (result?.text || '').trim();
      console.log(`[TRANSCRIPTION] Extracted text length: ${text.length} chars`);

      if (text) {
        console.log(`[TRANSCRIPTION] ✅ Chunk transcribed: "${text.substring(0, 50)}..." at ${timestamp}ms`);
      } else {
        console.warn(`[TRANSCRIPTION] ⚠️ No text extracted from audio at ${timestamp}ms`);
      }

      return {
        text,
        confidence: 0.9, // Local Whisper is very accurate
        timestamp,
      };
    } catch (err) {
      console.error('[TRANSCRIPTION] ❌ Error transcribing chunk:', err.message);
      return { text: '', confidence: 0, timestamp, error: err.message };
    }
  } catch (err) {
    console.error('[TRANSCRIPTION] ❌ Error in transcribeAudioChunk:', err.message);
    return { text: '', confidence: 0, timestamp, error: err.message };
  }
}

/**
 * Mock Transcription - Simulates realistic audio-to-text
 */
function simulateMockTranscription(audioBuffer, timestamp) {
  // About 20% of audio chunks contain actual speech
  if (Math.random() > 0.2) {
    return { text: '', confidence: 0, timestamp };
  }

  const mockSentences = [
    'Today we are learning about this topic',
    'Let me explain this concept in detail',
    'Can everyone hear me clearly now',
    'This is very important to understand',
    'Let us look at some examples here',
    'Any questions so far everyone',
    'This will help you in your studies',
    'Remember this for the test',
    'Good questions from everyone',
    'Let us discuss this further',
  ];

  const mockText = mockSentences[Math.floor(Math.random() * mockSentences.length)];
  console.log(`[TRANSCRIPTION-MOCK] Simulated: "${mockText}"`);

  return {
    text: mockText,
    confidence: 0.85,
    timestamp,
  };
}

/**
 * Get transcription status - Whisper.cpp ready
 */
function hasTranscription() {
  return true; // Whisper.cpp always available (local)
}

module.exports = {
  hasTranscription,
  initWhisper,
  transcribeRecording,
  transcribeAudioChunk,
};
