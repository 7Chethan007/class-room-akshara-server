#!/usr/bin/env node
/**
 * DEBUG: Test if Whisper.cpp can be initialized and transcribe
 */

const { transcribeAudioChunk, initWhisper, hasTranscription } = require('./utils/transcriptionService');

async function test() {
  try {
    console.log('🔍 Testing Whisper.cpp setup...');
    console.log('═'.repeat(60));

    // 1. Check if transcription is available
    console.log('\n1️⃣  hasTranscription check:');
    const available = hasTranscription();
    console.log(`   Result: ${available ? '✅ Available' : '❌ Not available'}`);

    // 2. Try to initialize Whisper
    console.log('\n2️⃣  Initializing Whisper.cpp model...');
    const whisper = await initWhisper();
    console.log(`   ✅ Model initialized:`, whisper?.constructor?.name || 'Unknown');

    // 3. Test with a simple WAV buffer (1 second of silent audio)
    console.log('\n3️⃣  Testing transcription with test audio...');
    
    // Create a simple WAV file header + silence (44100 Hz, 16-bit, mono)
    // This is minimal but valid WAV format
    const testAudioBuffer = Buffer.from([
      // WAV header
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0xF0, 0x00, 0x00, // File size
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6D, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // Chunk size
      0x01, 0x00,             // PCM format
      0x01, 0x00,             // Mono
      0x44, 0xAC, 0x00, 0x00, // 44100 Hz sample rate
      0x88, 0x58, 0x01, 0x00, // Byte rate
      0x02, 0x00,             // Block align
      0x10, 0x00,             // Bits per sample
      0x64, 0x61, 0x74, 0x61, // "data"
      0x00, 0xF0, 0x00, 0x00, // Data chunk size
      // ... followed by silence bytes (zeros)
      ...Buffer.alloc(61440, 0)
    ]);

    console.log(`   Audio buffer size: ${testAudioBuffer.length} bytes`);
    
    const result = await transcribeAudioChunk(testAudioBuffer, 0);
    console.log(`   ✅ Transcription result:`, {
      text_length: result.text?.length,
      text_preview: result.text ? `"${result.text.substring(0, 50)}"` : '(empty)',
      confidence: result.confidence,
      error: result.error || 'none'
    });

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Whisper.cpp appears to be working correctly');
    console.log('\n💡 If transcriptions are still empty in sessions:');
    console.log('   - Check that audio chunks have actual audio content');
    console.log('   - Verify microphone is working on client');
    console.log('   - Check browser console for audio encoding issues');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error('Stack:', err.stack?.split('\n').slice(0, 5).join('\n'));
  }
}

test();
