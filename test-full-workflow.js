#!/usr/bin/env node
/**
 * TEST WORKFLOW: Transcription Append/Pause-Resume
 * 
 * Usage: node test-full-workflow.js
 * 
 * This script helps test the pause/resume transcription functionality
 */

const mongoose = require('mongoose');
const Transcription = require('./models/Transcription');
const Session = require('./models/Session');
require('dotenv').config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function viewTranscriptionsForSession(sessionId, label = "") {
  const transcriptions = await Transcription.find({ sessionId })
    .sort({ createdAt: -1 });

  if (transcriptions.length === 0) {
    console.log(`  ❌ No transcriptions found${label}`);
    return;
  }

  console.log(`  \n📋 Found ${transcriptions.length} transcription(s)${label}:`);
  transcriptions.forEach((t, idx) => {
    console.log(`\n    [${idx + 1}] ID: ${t._id}`);
    console.log(`        Status: ${t.status} | Live: ${t.isLive}`);
    console.log(`        Segments: ${t.segments.length} | Text length: ${t.text.length} chars`);
    if (t.segments.length > 0) {
      console.log(`        Text preview: "${t.text.substring(0, 100)}${t.text.length > 100 ? '...' : ''}"`);
      t.segments.forEach((seg, i) => {
        if (i < 3) { // show first 3 segments
          console.log(`          └─ Seg ${i + 1}: "${seg.text.substring(0, 40)}..."`);
        }
      });
      if (t.segments.length > 3) console.log(`          └─ ... and ${t.segments.length - 3} more`);
    }
  });
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/akshara');
    console.log('✅ Connected to MongoDB\n');

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  TRANSCRIPTION PAUSE/RESUME TEST');
    console.log('═══════════════════════════════════════════════════════════════');

    // Get the most recent session
    const sessions = await Session.find().sort({ createdAt: -1 }).limit(1);
    
    if (sessions.length === 0) {
      console.log('\n❌ No sessions found in database');
      console.log('\n📌 NEXT STEPS:');
      console.log('   1. Start the server: npm run dev (from client folder)');
      console.log('   2. Start a classroom session');
      console.log('   3. Turn the mic ON');
      console.log('   4. Speak for a few seconds');
      console.log('   5. Turn the mic OFF');
      console.log('   6. Turn the mic ON again (this tests resume)');
      console.log('   7. Speak for a few more seconds');
      console.log('   8. Turn the mic OFF');
      console.log('   9. Run this script again to check results');
      await mongoose.connection.close();
      process.exit(0);
    }

    const sessionId = sessions[0]._id;
    console.log(`\n✅ Found session: ${sessionId}`);
    console.log(`   Subject: ${sessions[0].subject}`);
    console.log(`   Status: ${sessions[0].status}`);

    await viewTranscriptionsForSession(sessionId, " for this session");

    console.log('\n' + '═══════════════════════════════════════════════════════════════');
    console.log('  ANALYSIS:');
    console.log('═══════════════════════════════════════════════════════════════');

    const transcriptions = await Transcription.find({ sessionId })
      .sort({ createdAt: -1 });

    if (transcriptions.length === 0) {
      console.log('\n⚠️  No transcriptions yet. Start/stop recording to create one.');
    } else if (transcriptions.length === 1) {
      console.log('\n✅ Single transcription (expected for first recording)');
      console.log(`   Status: ${transcriptions[0].status}`);
      console.log(`   Segments: ${transcriptions[0].segments.length}`);
      
      if (transcriptions[0].segments.length === 0) {
        console.log('\n⚠️  Issue: No segments captured!');
        console.log('   💡 This could mean:');
        console.log('      - Audio chunks are not reaching the server');
        console.log('      - Whisper.cpp is not working');
        console.log('      - Audio format is invalid');
        console.log('\n   To debug:');
        console.log('      1. Check server logs for [AUDIO-CHUNK] messages');
        console.log('      2. Check for [TRANSCRIPTION] logs from Whisper');
        console.log('      3. Check if Whisper.cpp model is installed');
      } else {
        console.log('\n✅ Segments captured successfully!');
      }
    } else {
      console.log(`\n⚠️  Found ${transcriptions.length} transcription(s) for same session`);
      console.log('   Expected: 1 transcription with multiple segments if using pause/resume');
      
      const hasMultipleStatus = new Set(transcriptions.map(t => t.status)).size > 1;
      if (hasMultipleStatus) {
        console.log('\n❌ PROBLEM: Multiple transcriptions with different statuses!');
        console.log('   This means pause/resume is creating new transcriptions');
        console.log('   ✅ FIXED: This should now be resolved with the latest code');
        console.log('\n   To verify the fix:');
        console.log('      1. Restart the server');
        console.log('      2. Do another pause/resume test');
        console.log('      3. Run this script again');
      } else {
        console.log('\n✅ All transcriptions have same status: ' + transcriptions[0].status);
      }

      const totalSegments = transcriptions.reduce((sum, t) => sum + t.segments.length, 0);
      console.log(`\n   📊 Total segments across all transcriptions: ${totalSegments}`);
    }

    console.log('\n' + '═══════════════════════════════════════════════════════════════');
    console.log('  FULL TEXT (all segments combined):');
    console.log('═══════════════════════════════════════════════════════════════');

    const allSegments = [];
    for (const t of transcriptions) {
      allSegments.push(...t.segments);
    }
    allSegments.sort((a, b) => a.timestamp - b.timestamp);

    if (allSegments.length === 0) {
      console.log('\n(No text captured yet)');
    } else {
      const fullText = allSegments.map(s => s.text).join(' ');
      console.log(`\n"${fullText}"\n`);
      console.log(`Total: ${fullText.length} characters, ${allSegments.length} segments`);
    }

    await mongoose.connection.close();
    console.log('\n✅ Done');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
