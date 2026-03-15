/**
 * test-akshara-db.js — Verify 'akshara' database and display organized transcriptions
 * Shows: className, subject, transcription ID, sessions, segments, etc.
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Session = require('./models/Session');
const Transcription = require('./models/Transcription');

async function testAksharaDatabase() {
  try {
    console.log('\n✅ Connecting to MongoDB akshara database...\n');

    // Connect to akshara database
    const mongoUri = process.env.MONGO_URI;
    let uriWithDB = mongoUri;
    
    if (mongoUri.includes('mongodb')) {
      // Remove any existing database name from URI
      const baseUri = mongoUri.split('?')[0];
      const lastSlashIndex = baseUri.lastIndexOf('/');
      const baseUriPath = baseUri.substring(0, lastSlashIndex + 1);
      const queryParams = mongoUri.includes('?') ? '?' + mongoUri.split('?')[1] : '';
      
      uriWithDB = baseUriPath + 'akshara' + queryParams;
    }

    const conn = await mongoose.connect(uriWithDB);
    console.log(`✅ Connected to database: ${conn.connection.name}`);
    console.log(`✅ Host: ${conn.connection.host}\n`);

    // Verify database name
    const adminDb = mongoose.connection.db;
    const databaseName = mongoose.connection.name;
    console.log(`📊 Current Database Name: "${databaseName}"\n`);

    // Fetch all sessions with class info
    const sessions = await Session.find().lean();
    console.log(`📚 Total Sessions: ${sessions.length}\n`);

    // Group transcriptions by className
    const transcriptions = await Transcription.find()
      .populate('sessionId', 'sessionId subject className')
      .lean();

    console.log(`📝 Total Transcriptions: ${transcriptions.length}\n`);

    // Organize by className
    const byClassName = {};
    transcriptions.forEach((trans) => {
      const className = trans.className || 'Unknown Class';
      if (!byClassName[className]) {
        byClassName[className] = [];
      }
      byClassName[className].push(trans);
    });

    // Display organized results
    console.log('═'.repeat(100));
    console.log('  AKSHARA DATABASE ORGANIZATION - Transcriptions by Class');
    console.log('═'.repeat(100) + '\n');

    let totalSegments = 0;

    for (const [className, transList] of Object.entries(byClassName)) {
      const classSegments = transList.reduce((sum, t) => sum + (t.segments?.length || 0), 0);
      totalSegments += classSegments;

      console.log(`\n📚 CLASS: ${className}`);
      console.log('─'.repeat(100));

      // Group by subject within class
      const bySubject = {};
      transList.forEach((trans) => {
        const subject = trans.subject || 'No Subject';
        if (!bySubject[subject]) {
          bySubject[subject] = [];
        }
        bySubject[subject].push(trans);
      });

      for (const [subject, subjectTrans] of Object.entries(bySubject)) {
        console.log(`  📖 Subject: ${subject}`);
        console.log(`     Transcriptions in this subject: ${subjectTrans.length}`);

        subjectTrans.forEach((trans, idx) => {
          const segments = trans.segments?.length || 0;
          const textPreview = trans.text ? trans.text.substring(0, 50) + '...' : '[No text]';
          console.log(`     [${idx + 1}] ID: ${trans._id}`);
          console.log(`         Status: ${trans.status} | Segments: ${segments} | Text: ${textPreview}`);
          console.log(`         Created: ${new Date(trans.createdAt).toLocaleString()}`);
        });
      }

      console.log(`\n     ✅ Total segments in "${className}": ${classSegments}`);
    }

    // Summary statistics
    console.log('\n' + '═'.repeat(100));
    console.log('  SUMMARY STATISTICS');
    console.log('═'.repeat(100));
    console.log(`✅ Database Name: akshara`);
    console.log(`✅ Total Classes: ${Object.keys(byClassName).length}`);
    console.log(`✅ Total Sessions: ${sessions.length}`);
    console.log(`✅ Total Transcriptions: ${transcriptions.length}`);
    console.log(`✅ Total Segments Captured: ${totalSegments}`);
    console.log(`✅ Classes: ${Object.keys(byClassName).join(', ')}\n`);

    // Show database collections
    console.log('DATABASE COLLECTIONS:');
    const collections = await adminDb.listCollections().toArray();
    collections.forEach((col) => {
      console.log(`  • ${col.name}`);
    });

    console.log('\n✅ Database structure verified successfully!\n');

    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed.\n');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

// Run test
testAksharaDatabase();
