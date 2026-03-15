const mongoose = require('mongoose');

/**
 * connectDB — connects to MongoDB using the URI from environment
 * Logs success or exits process on failure.
 */
async function connectDB() {
  try {
    // Connect to akshara database
    const mongoUri = process.env.MONGO_URI;
    // If URI already has path, replace it; otherwise append /akshara
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
    console.log(`✅ MongoDB connected to 'akshara' database: ${conn.connection.host}`);
  } catch (err) {
    console.warn(`⚠️ MongoDB connection failed: ${err.message}`);
    console.warn('   Server will run without database. Auth and session routes will fail.');
  }
}

module.exports = connectDB;
