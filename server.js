require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/session');
const { initSocketHandler } = require('./socket/socketHandler');
const { initWorker } = require('./mediasoup/mediaHandler');
const fs = require('fs');

// ─── Init Express ───
const app = express();
const server = http.createServer(app);

// ─── Middleware ───
app.use(cors());
app.use(express.json());

// ─── Routes ───
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ClassRoom Live API is running' });
});

// ─── Socket.io ───
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});
initSocketHandler(io);

// ─── Ensure recordings directory exists ───
const recordingsDir = process.env.RECORDINGS_PATH || './recordings';
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
  console.log(`📁 Created recordings directory: ${recordingsDir}`);
}

// ─── Startup ───
const PORT = process.env.PORT || 5001;

async function start() {
  // Connect to MongoDB
  await connectDB();

  // Init mediasoup worker (non-blocking — server works without it)
  try {
    await initWorker();
  } catch (err) {
    console.warn(`⚠️ Mediasoup not available: ${err.message}`);
    console.warn('   Server will run without media routing.');
  }

  // Start listening
  server.listen(PORT, () => {
    console.log(`\n🚀 ClassRoom Live server running on port ${PORT}`);
    console.log(`   API:    http://localhost:${PORT}/api`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} is already in use.`);
      console.error('   Kill the other process or change PORT in .env\n');
    } else {
      console.error('❌ Server error:', err.message);
    }
    process.exit(1);
  });
}

start();
