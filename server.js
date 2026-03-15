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

const allowedOrigins = (process.env.CLIENT_URLS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isPrivateNetworkOrigin(origin) {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin) {
  return !origin || allowedOrigins.includes(origin) || isPrivateNetworkOrigin(origin);
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

// ─── Middleware ───
app.use(cors(corsOptions));
app.use(express.json({ limit: process.env.JSON_LIMIT || '100mb' }));

// ─── Routes ───
app.use('/api/auth', authRoutes);
app.use('/api/session', sessionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ClassRoom Live API is running' });
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'API working' });
});

// ─── Socket.io ───
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by Socket CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
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
