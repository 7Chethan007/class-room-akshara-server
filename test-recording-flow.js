/**
 * TEST SCRIPT: Complete recording flow with audio chunks
 * Tests: Session creation → Audio chunks → File storage → Transcription
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

let testUserId = null;
let testSessionId = null;
let authToken = null;

// Helper: Make HTTP request
function makeRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${endpoint}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers.Authorization = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Generate test audio buffer (WAV silence)
function generateTestAudioBuffer() {
  const sampleRate = 16000;
  const duration = 0.5; // 500ms
  const numSamples = sampleRate * duration;
  
  // Create WAV header + audio data
  const header = Buffer.alloc(44);
  const audioData = Buffer.alloc(numSamples * 2); // 16-bit

  // WAV header
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x52494646, true); // "RIFF"
  view.setUint32(4, 36 + audioData.length, true); // file size
  view.setUint32(8, 0x57415645, true); // "WAVE"
  view.setUint32(12, 0x666d7420, true); // "fmt "
  view.setUint32(16, 16, true); // subchunk1 size
  view.setUint16(20, 1, true); // PCM audio
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  view.setUint32(36, 0x64617461, true); // "data"
  view.setUint32(40, audioData.length, true); // audio data size

  // Just return silence for testing
  return Buffer.concat([header, audioData]);
}

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  TEST: Complete Recording & Audio Storage Flow');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Register/Login test user
    console.log('📝 Step 1: Register test user...');
    const registerRes = await makeRequest('POST', '/auth/register', {
      name: 'Test Teacher',
      email: `teacher-${Date.now()}@test.com`,
      password: 'testpass123',
      role: 'teacher',
    });

    if (!registerRes.data?.data?.user?._id) {
      console.error('❌ Registration failed:', registerRes.data);
      return;
    }

    testUserId = registerRes.data.data.user._id;
    authToken = registerRes.data.data.token;
    console.log(`✅ User registered: ${testUserId}`);

    // Step 2: Create session
    console.log('\n📝 Step 2: Create classroom session...');
    const sessionRes = await makeRequest(
      'POST',
      '/sessions/create',
      {
        subject: 'Mathematics',
        className: 'Test Class - Audio Recording',
      },
      authToken
    );

    if (!sessionRes.data?.data?.sessionId) {
      console.error('❌ Session creation failed:', sessionRes.data);
      return;
    }

    testSessionId = sessionRes.data.data.sessionId;
    console.log(`✅ Session created: ${testSessionId}`);
    console.log(`   Subject: ${sessionRes.data.data.subject}`);
    console.log(`   Class: ${sessionRes.data.data.className}`);

    // Step 3: Connect Socket.io and start transcription
    console.log('\n📝 Step 3: Connect Socket.io...');
    const socket = io(BASE_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      console.log(`✅ Socket connected: ${socket.id}`);
    });

    socket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err.message);
    });

    // Wait for connection
    await new Promise((resolve) => {
      socket.once('connect', resolve);
    });

    // Step 4: Join room
    console.log('\n📝 Step 4: Join classroom room...');
    socket.emit('join-room', {
      sessionId: testSessionId,
      userId: testUserId,
      role: 'teacher',
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log('✅ Joined room');

    // Step 5: Start transcription
    console.log('\n📝 Step 5: Start transcription...');
    socket.emit('start-transcription', { sessionId: testSessionId, userId: testUserId }, (response) => {
      console.log('✅ Transcription started:', response);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 6: Send audio chunks
    console.log('\n📝 Step 6: Send audio chunks (simulating recording)...');
    const audioBuffer = generateTestAudioBuffer();
    const base64Audio = audioBuffer.toString('base64');

    for (let i = 0; i < 3; i++) {
      console.log(`   📤 Sending chunk ${i + 1}/3...`);
      socket.emit(
        'audio-chunk',
        {
          sessionId: testSessionId,
          audioBuffer: base64Audio,
          timestamp: i * 500,
        },
        (response) => {
          console.log(`   ↳ Response:`, response);
        }
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log('✅ Audio chunks sent');

    // Step 7: End transcription
    console.log('\n📝 Step 7: End transcription...');
    socket.emit('end-transcription', { sessionId: testSessionId, userId: testUserId }, (response) => {
      console.log('✅ Transcription ended:', response);
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 8: End session
    console.log('\n📝 Step 8: End classroom session...');
    const endRes = await makeRequest(
      'POST',
      '/sessions/end',
      { sessionId: testSessionId },
      authToken
    );

    if (endRes.data?.success) {
      console.log('✅ Session ended successfully');
    } else {
      console.log('⚠️ Session end response:', endRes.data);
    }

    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Step 9: Check files
    console.log('\n📝 Step 9: Check recordings folder...');
    const recordingsPath = path.join(__dirname, 'recordings', testUserId, testSessionId);
    
    if (fs.existsSync(recordingsPath)) {
      console.log(`✅ Recordings directory exists: ${recordingsPath}`);
      const files = fs.readdirSync(recordingsPath);
      console.log(`   📁 Files found: ${files.join(', ')}`);

      // Check file sizes
      for (const file of files) {
        const filePath = path.join(recordingsPath, file);
        const stats = fs.statSync(filePath);
        console.log(`   📄 ${file}: ${stats.size} bytes`);

        // Show first 300 chars of transcript
        if (file === 'transcript.txt') {
          const content = fs.readFileSync(filePath, 'utf8');
          console.log(`\n   📝 Transcript preview:\n${content.substring(0, 300)}...\n`);
        }

        // Show audio file info
        if (file === 'recording.wav') {
          console.log(`   🎵 Audio file size: ${(stats.size / 1024).toFixed(2)} KB`);
        }
      }
    } else {
      console.log(`❌ Recordings directory NOT found: ${recordingsPath}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Test error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Give servers time to start, then run test
setTimeout(runTest, 3000);
