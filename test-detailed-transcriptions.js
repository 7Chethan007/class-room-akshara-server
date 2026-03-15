const mongoose = require('mongoose');
const Transcription = require('./models/Transcription');
require('dotenv').config();

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/akshara');
    console.log('✅ Connected to MongoDB\n');

    // Get the MOST RECENT transcriptions
    const recent = await Transcription.find()
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    console.log('═'.repeat(80));
    console.log('  MOST RECENT TRANSCRIPTIONS');
    console.log('═'.repeat(80));

    if (recent.length === 0) {
      console.log('No transcriptions found');
      await mongoose.connection.close();
      return;
    }

    recent.forEach((t, i) => {
      const time = new Date(t.createdAt);
      const updatedTime = new Date(t.updatedAt);
      console.log(`\n[${i+1}] ID: ${t._id}`);
      console.log(`    Session ID: ${t.sessionId}`);
      console.log(`    Status: ${t.status} | Live: ${t.isLive}`);
      console.log(`    Created: ${time.toLocaleString()}`);
      console.log(`    Updated: ${updatedTime.toLocaleString()}`);
      console.log(`    Segments: ${t.segments?.length || 0} | Text: ${t.text?.length || 0} chars`);
      
      if (t.segments && t.segments.length > 0) {
        console.log(`    📝 Text Preview: "${t.text.substring(0, 100)}${t.text.length > 100 ? '...' : ''}"`);
        t.segments.slice(0, 2).forEach((s, si) => {
          console.log(`       [Seg ${si+1}] @${s.timestamp}s: "${s.text.substring(0, 50)}${s.text.length > 50 ? '...' : ''}"`);
        });
        if (t.segments.length > 2) {
          console.log(`       ... and ${t.segments.length - 2} more segments`);
        }
      }
    });

    console.log('\n' + '═'.repeat(80));
    console.log('  KEY FINDINGS:');
    console.log('═'.repeat(80));

    // Find sessions with multiple transcriptions
    const sessionStats = await Transcription.aggregate([
      {
        $group: {
          _id: '$sessionId',
          count: { $sum: 1 },
          totalSegments: { $sum: { $size: '$segments' } },
          avgSegments: { $avg: { $size: '$segments' } },
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    console.log('\nTop sessions by transcription count:');
    sessionStats.forEach(s => {
      console.log(`  • Session ${s._id}: ${s.count} transcriptions, ${s.totalSegments} total segments (avg: ${s.avgSegments.toFixed(1)})`);
    });

    console.log('\n' + '═'.repeat(80));
    console.log('✅ SUMMARY:');
    console.log('═'.repeat(80));

    const totalTrans = await Transcription.countDocuments();
    const totalSegments = await Transcription.aggregate([
      { $group: { _id: null, total: { $sum: { $size: '$segments' } } } }
    ]);

    console.log(`Total transcriptions: ${totalTrans}`);
    console.log(`Total segments: ${totalSegments[0]?.total || 0}`);
    console.log(`Avg segments per transcription: ${totalSegments[0] ? (totalSegments[0].total / totalTrans).toFixed(2) : 0}`);

    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
