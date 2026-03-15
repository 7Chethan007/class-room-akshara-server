const mongoose = require('mongoose');
const Transcription = require('./models/Transcription');
const Session = require('./models/Session');
const User = require('./models/User');
require('dotenv').config();

async function retrieveTranscriptions() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/akshara');
    console.log('✅ Connected to MongoDB');

    // Get all transcriptions
    const transcriptions = await Transcription.find()
      .populate('sessionId', 'sessionId subject')
      .populate('teacherId', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    console.log('\n📋 RECENT TRANSCRIPTIONS:');
    console.log('═'.repeat(80));

    if (transcriptions.length === 0) {
      console.log('No transcriptions found in database');
      return;
    }

    transcriptions.forEach((trans, idx) => {
      console.log(`\n[${idx + 1}] Transcription ID: ${trans._id}`);
      console.log(`    Session ID: ${trans.sessionId?.sessionId || 'N/A'}`);
      console.log(`    Subject: ${trans.sessionId?.subject || 'N/A'}`);
      console.log(`    Teacher: ${trans.teacherId?.name || 'N/A'}`);
      console.log(`    Status: ${trans.status}`);
      console.log(`    Live: ${trans.isLive}`);
      console.log(`    Segments Count: ${trans.segments.length}`);
      console.log(`    Total Text Length: ${trans.text.length} chars`);
      console.log(`    Created: ${new Date(trans.createdAt).toLocaleString()}`);
      console.log(`    Updated: ${new Date(trans.updatedAt).toLocaleString()}`);

      if (trans.segments.length > 0) {
        console.log(`\n    📝 TEXT (first 300 chars):`);
        console.log(`    "${trans.text.substring(0, 300)}${trans.text.length > 300 ? '...' : ''}"`);

        console.log(`\n    🔹 SEGMENTS (${trans.segments.length} total):`);
        trans.segments.forEach((seg, i) => {
          console.log(`       [${i + 1}] @ ${seg.timestamp}s | "${seg.text.substring(0, 50)}${seg.text.length > 50 ? '...' : ''}" (confidence: ${seg.confidence})`);
        });
      }
    });

    console.log('\n' + '═'.repeat(80));

    // Also show by SessionId to check for duplicates
    console.log('\n📊 TRANSCRIPTIONS BY SESSION:');
    const bySession = await Transcription.aggregate([
      {
        $group: {
          _id: '$sessionId',
          count: { $sum: 1 },
          transcriptionIds: { $push: '$_id' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    bySession.forEach((group, idx) => {
      console.log(
        `\n[${idx + 1}] Session ${group._id}: ${group.count} transcription(s)`
      );
      console.log(`    IDs: ${group.transcriptionIds.join(', ')}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Done');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

retrieveTranscriptions();
