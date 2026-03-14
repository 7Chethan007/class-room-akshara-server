const mongoose = require('mongoose');

/**
 * connectDB — connects to MongoDB using the URI from environment
 * Logs success or exits process on failure.
 */
async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.warn(`⚠️ MongoDB connection failed: ${err.message}`);
    console.warn('   Server will run without database. Auth and session routes will fail.');
  }
}

module.exports = connectDB;
