const mongoose = require('mongoose');

/**
 * connectDB — connects to MongoDB using the URI from environment
 * If connection fails, the server continues without database.
 * Sessions are stored in memory and synced to S3.
 */
async function connectDB() {
  try {
    const mongoUri = process.env.MONGO_URI;
    
    if (!mongoUri) {
      console.warn('⚠️ MONGO_URI not set. Running without database.');
      console.warn('   Sessions will be stored in memory and synced to S3.');
      return false;
    }

    // Remove any existing database name from URI
    let uriWithDB = mongoUri;
    if (mongoUri.includes('mongodb')) {
      const baseUri = mongoUri.split('?')[0];
      const lastSlashIndex = baseUri.lastIndexOf('/');
      const baseUriPath = baseUri.substring(0, lastSlashIndex + 1);
      const queryParams = mongoUri.includes('?') ? '?' + mongoUri.split('?')[1] : '';
      uriWithDB = baseUriPath + 'akshara' + queryParams;
    }
    
    const conn = await mongoose.connect(uriWithDB, { 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
    });
    
    console.log(`✅ MongoDB connected to 'akshara' database: ${conn.connection.host}`);
    return true;
  } catch (err) {
    console.warn(`⚠️ MongoDB connection failed: ${err.message}`);
    console.warn('   Server will run without database.');
    console.warn('   Sessions will be stored in memory and synced to S3.');
    return false;
  }
}

module.exports = connectDB;
