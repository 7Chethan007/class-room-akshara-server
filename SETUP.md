# Akshara Backend - Setup & Deployment Guide

## Overview
This is the backend API server for **Akshara ClassRoom Live**, a real-time video classroom platform. The backend handles real-time sessions, video routing via Mediasoup, transcription services, and cloud storage integration with AWS S3.

**Technology Stack:**
- Node.js with Express.js
- Mediasoup 3.19.18 (WebRTC media server)
- MongoDB (optional - can run without it)
- Socket.IO (Real-time communication)
- AWS S3 (Cloud storage)
- OpenAI Whisper (Transcription)

---

## Prerequisites

Before starting, ensure you have:
- Node.js 20+ installed
- npm or yarn package manager
- Git for version control
- (Optional) MongoDB 4.4+ for persistent data storage
- AWS S3 bucket configured with credentials
- (Optional) Python 3.9+ with Whisper for transcription

---

## Getting Started Locally

### 1. Install Dependencies
```bash
cd server
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the `server` directory:

```env
# Server Configuration
PORT=5001
JWT_SECRET=your-secret-key-here

# Database (Optional - server works without MongoDB)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/

# AWS S3 Configuration (Required for file uploads)
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=ap-south-1
AWS_BUCKET=my-classroom-live-dev
UPLOAD_TO_S3=true

# Transcription (Optional)
OPENAI_API_KEY=your-openai-api-key
OPENAI_WHISPER_MODEL=whisper-1
OPENAI_WHISPER_LANGUAGE=en

# Client URLs (CORS)
CLIENT_URLS=http://localhost:5173,http://127.0.0.1:5173

# Mediasoup
MEDIASOUP_ANNOUNCED_IP=your-public-ip

# Recording
RECORDINGS_PATH=./recordings
```

### 3. Run Development Server
```bash
npm run dev
```

The API will be available at `http://localhost:5001/api`

---

## Available Scripts

### Development
```bash
npm run dev          # Start with nodemon (auto-restart on file changes)
npm start            # Start production server
```

### Testing
```bash
npm test             # Run all tests (if configured)
```

---

## Project Structure

```
server/
├── config/
│   ├── db.js              # MongoDB connection setup
│   └── s3.js              # AWS S3 client configuration
├── controllers/
│   ├── sessionController.js   # Classroom session logic
│   ├── authController.js      # User authentication
│   └── ...
├── middleware/
│   └── auth.js            # JWT authentication middleware
├── models/
│   ├── Session.js         # Session schema
│   ├── User.js            # User schema
│   ├── Transcription.js   # Transcription storage
│   └── ...
├── routes/
│   ├── session.js         # Session API endpoints
│   ├── auth.js            # Authentication endpoints
│   └── ...
├── socket/
│   └── socketHandler.js   # WebSocket/Socket.IO event handling
├── mediasoup/
│   └── mediaHandler.js    # WebRTC media routing
├── utils/
│   ├── recorder.js        # Audio/video recording utilities
│   ├── s3Upload.js        # AWS S3 file upload
│   ├── transcriptionService.js  # Whisper integration
│   ├── sessionArtifacts.js      # Recording/transcript storage
│   └── ...
├── scripts/
│   └── ffmpeg-install-note.md  # FFmpeg setup guide
├── recordings/            # Local recording storage
├── .env                   # Environment variables (local only)
├── server.js              # Main entry point
├── package.json           # Dependencies and metadata
└── README.md              # Main documentation

```

---

## Key Features

### 1. Real-Time Video Streaming (Mediasoup)
- Handles WebRTC connections from multiple clients
- Manages video/audio encoding and routing
- Creates SFU (Selective Forwarding Unit) topology
- Automatically manages bandwidth and quality

### 2. Session Management
- Create, join, and end classroom sessions
- Track active participants
- Store session metadata
- Support scheduled vs. live sessions

### 3. Recording & Playback
- Records all session audio/video
- Stores recordings in AWS S3
- Supports download and streaming playback
- Automatic file compression and optimization

### 4. Live Transcription
- Real-time speech-to-text via OpenAI Whisper
- Segments transcription for easy navigation
- Store transcripts for later review
- Search and filter transcriptions

### 5. Authentication & Authorization
- JWT-based authentication
- Role-based access control (Teacher, Student, Admin)
- Secure API endpoints with token validation

### 6. AWS S3 Integration
- Upload recordings and transcripts to cloud
- Reduce server storage requirements
- Enable global content delivery
- Automatic cleanup of local files after upload

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Sessions
- `POST /api/session/create` - Create new session (Teacher only)
- `POST /api/session/join` - Join existing session (Student only)
- `POST /api/session/end` - End session (Teacher only)
- `GET /api/session/all` - Get all sessions (Admin only)
- `GET /api/session/:sessionId/recording` - Download recording
- `GET /api/session/:sessionId/transcript` - Get transcription

### WebSocket Events (Socket.IO)
- `session:start` - Session started
- `session:end` - Session ended
- `participant:join` - New participant joined
- `participant:leave` - Participant left
- `transcription:update` - New transcription segment

---

## Database (Optional)

### Using MongoDB
If you want persistent data storage:

1. **Install MongoDB locally** or use MongoDB Atlas (cloud):
   ```bash
   # Local MongoDB
   mongod --dbpath /path/to/db
   ```

2. **Update `.env` with connection string:**
   ```env
   MONGO_URI=mongodb://localhost:27017/
   ```

3. **Restart server** - automatic connection on startup

### Running Without MongoDB (In-Memory)
- Sessions stored in server memory
- Data lost on server restart
- Perfect for development and testing
- No database setup required

**Note:** Server logs will show:
```
⚠️ MONGO_URI not set. Running without database.
   Sessions will be stored in memory and synced to S3.
```

---

## AWS S3 Configuration

### Setup Steps

1. **Create AWS Account** and S3 bucket
2. **Generate AWS credentials:**
   - AWS Access Key ID
   - AWS Secret Access Key

3. **Update `config/s3.js`** with your bucket details

4. **Add to `.env`:**
   ```env
   AWS_ACCESS_KEY_ID=AKIXXXXXXXXXXXXXXXX
   AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxx
   AWS_REGION=ap-south-1
   AWS_BUCKET=my-classroom-live-dev
   UPLOAD_TO_S3=true
   ```

5. **Verify upload works:**
   - Start server: `npm run dev`
   - Create a session and record
   - Check S3 bucket for uploaded files

---

## Building and Deployment

### Docker Deployment (Recommended)

**Build Docker Image:**
```bash
docker build -t akshara-backend:latest .
```

**Run Container:**
```bash
docker run -d \
  --name akshara-backend \
  -p 5001:5001 \
  -e PORT=5001 \
  -e MONGO_URI=mongodb://host.docker.internal:27017/ \
  -e AWS_ACCESS_KEY_ID=your-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret \
  akshara-backend:latest
```

### Manual Deployment

1. **Install Node.js and npm** on server

2. **Clone repository:**
   ```bash
   git clone https://github.com/7Chethan007/class-room-akshara-server.git
   cd class-room-akshara-server
   ```

3. **Install dependencies:**
   ```bash
   npm install --production
   ```

4. **Create `.env` file** with production values

5. **Start with PM2** (recommended for production):
   ```bash
   npm install -g pm2
   pm2 start server.js --name "akshara-backend"
   pm2 save
   pm2 startup
   ```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot create worker" | Ensure Mediasoup dependencies installed; may need Linux |
| "MongoDB connection failed" | Check connection string in `.env` or run without DB |
| "S3 upload failed" | Verify AWS credentials and bucket permissions |
| "Port 5001 already in use" | Change PORT in `.env` or kill process using port |
| "Transcription not working" | Install Whisper: `pip install openai-whisper` |
| "Memory leak on long recordings" | This is normal; server cleans up after session ends |

---

## Performance Tips

1. **Use MongoDB** for production systems
2. **Enable S3 uploads** to avoid disk space issues
3. **Monitor server resources** - video streaming is CPU intensive
4. **Use reverse proxy** (Nginx) in production
5. **Enable SSL/TLS** for secure connections

---

## Logging

Server logs are printed to console with prefixes:

- `🎓` - Session events
- `✅` - Successful operations
- `❌` - Errors
- `⚠️` - Warnings
- `📝` - Transcription events
- `☁️` - S3 operations
- `📡` - Mediasoup events

For production, pipe logs to a file:
```bash
npm start > server.log 2>&1 &
```

---

## Dependencies Overview

| Package | Version | Purpose |
|---------|---------|---------|
| express | 4.18.2 | Web framework |
| socket.io | Latest | Real-time communication |
| mediasoup | 3.19.18 | WebRTC media server |
| mongoose | Latest | MongoDB ODM (optional) |
| @aws-sdk/client-s3 | 3.1009.0 | AWS S3 client |
| jsonwebtoken | 9.0.3 | JWT authentication |

---

## Contributing

When making changes:
1. Create feature branch: `git checkout -b feature/your-feature`
2. Test locally: `npm run dev`
3. Commit with clear message: `git commit -m "feat: describe change"`
4. Push: `git push origin feature/your-feature`
5. Create Pull Request

---

## Known Limitations

1. **In-Memory Sessions**: Server restart loses all session data
2. **Single Server**: WebRTC connections limited to one server instance
3. **Transcription**: Requires additional setup, may cause delay
4. **Storage**: S3 upload needed for large recordings (local disk limited)

---

## Support & Contact

For issues:
1. Check troubleshooting section above
2. Review server logs for error details
3. Check GitHub issues for similar problems
4. Contact development team for urgent issues

---

## License

This project is part of Akshara ClassRoom Live. All rights reserved.

**Last Updated:** March 2026  
**Version:** 1.0.0 (Submission Ready)  
**Status:** Stable on `submitting-version` branch
