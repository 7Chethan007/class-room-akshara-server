const User = require('../models/User');
const Transcription = require('../models/Transcription');
const Session = require('../models/Session');
const { transcribeAudioChunk } = require('../utils/transcriptionService');
const { appendTranscriptText, saveAudioChunk, finalizeAudioRecording } = require('../utils/sessionArtifacts');
const fs = require('fs');
const path = require('path');
const {
  createRouter,
  createTransport,
  connectTransport,
  createProducer,
  createConsumer,
  listProducers,
  closeTransport,
  closeRouter,
  getRouterForSession,
} = require('../mediasoup/mediaHandler');

/**
 * initSocketHandler — attaches all Socket.io event listeners
 * Called once from server.js with the io instance.
 */
function initSocketHandler(io) {
  // In-memory live roster by session, used to keep all clients in sync.
  const roomParticipants = new Map();
  
  // In-memory active transcriptions by session
  // structure: { sessionId: { transcriptionId, segments: [], startTime } }
  const activeTranscriptions = new Map();

  function normalizeParticipant({ userId, role, name }) {
    return {
      userId: String(userId),
      role,
      name: name || 'Unknown',
    };
  }

  function upsertParticipant(sessionId, participant) {
    const key = String(sessionId);
    const list = roomParticipants.get(key) || [];
    const normalized = normalizeParticipant(participant);
    const idx = list.findIndex((p) => p.userId === normalized.userId);
    if (idx >= 0) {
      list[idx] = normalized;
    } else {
      list.push(normalized);
    }
    roomParticipants.set(key, list);
    return list;
  }

  function removeParticipantFromRoom(sessionId, userId) {
    const key = String(sessionId);
    const list = roomParticipants.get(key) || [];
    const next = list.filter((p) => p.userId !== String(userId));
    if (next.length) {
      roomParticipants.set(key, next);
      return next;
    }
    roomParticipants.delete(key);
    return [];
  }

  function emitRoomParticipants(sessionId) {
    const key = String(sessionId);
    const participants = roomParticipants.get(key) || [];
    io.to(key).emit('room-participants', { participants });
  }

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    socket.transportIds = [];

    /**
     * join-room — user joins a classroom session room
     */
    socket.on('join-room', async ({ sessionId, userId, role }) => {
      try {
        socket.join(sessionId);
        socket.sessionId = sessionId;
        socket.userId = userId;
        socket.role = role;

        const user = await User.findById(userId).select('name role');
        const name = user ? user.name : 'Unknown';

        // Ensure router exists for this session
        await createRouter(sessionId);

        upsertParticipant(sessionId, { userId, role, name });
        emitRoomParticipants(sessionId);
        socket.to(sessionId).emit('user-joined', { userId, role, name });

        // Send all existing producers so late-joiners can consume them
        const existingProducers = listProducers(sessionId);
        console.log(`📋 EXISTING PRODUCERS for ${sessionId}:`, existingProducers.map(p => `${p.kind}(${p.userId})`).join(', '));
        if (existingProducers.length) {
          socket.emit('existing-producers', {
            producers: existingProducers.map((p) => ({
              producerId: p.id,
              userId: p.userId,
              kind: p.kind,
            })),
          });
        }

        console.log(`📥 ${name} (${role}) joined room ${sessionId}`);
      } catch (err) {
        console.error('❌ join-room error:', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    /**
     * get-router-rtp-capabilities — Device.load support
     */
    socket.on('get-router-rtp-capabilities', async ({ sessionId }, callback) => {
      try {
        await createRouter(sessionId);
        const router = getRouterForSession(sessionId);
        callback(router.rtpCapabilities);
      } catch (err) {
        console.error('❌ get-router-rtp-capabilities error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * leave-room — user leaves the classroom
     */
    socket.on('leave-room', ({ sessionId, userId }) => {
      socket.leave(sessionId);
      removeParticipantFromRoom(sessionId, userId);
      emitRoomParticipants(sessionId);
      socket.to(sessionId).emit('user-left', { userId });
      console.log(`📤 User ${userId} left room ${sessionId}`);
    });

    /**
     * end-class — teacher ends the live class
     */
    socket.on('end-class', async ({ sessionId }) => {
      io.to(sessionId).emit('class-ended', {});
      
      // Finalize transcription if active
      const transData = activeTranscriptions.get(sessionId);
      if (transData) {
        try {
          await Transcription.findByIdAndUpdate(
            transData.transcriptionId,
            {
              status: 'completed',
              isLive: false,
            },
            { new: true }
          );
          console.log(`📝 Transcription auto-finalized on class end`);
        } catch (err) {
          console.error('⚠️ Error finalizing transcription:', err.message);
        }
        activeTranscriptions.delete(sessionId);
      }
      
      closeRouter(sessionId);
      console.log(`🛑 Class ended: ${sessionId}`);
    });

    // ─────────────────────────────────────────────
    //  MEDIASOUP SIGNALING EVENTS
    // ─────────────────────────────────────────────

    /**
     * create-transport — creates a WebRTC transport for the user
     */
    socket.on('create-transport', async ({ sessionId }, callback) => {
      try {
        if (!socket.sessionId) socket.sessionId = sessionId;
        await createRouter(sessionId);
        const transport = await createTransport(sessionId);
        socket.transportIds.push(transport.id);

        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err) {
        console.error('❌ create-transport error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * connect-transport — connects DTLS parameters for the transport
     */
    socket.on('connect-transport', async ({ transportId, dtlsParameters }, callback) => {
      try {
        await connectTransport(transportId, dtlsParameters);
        callback({ connected: true });
      } catch (err) {
        console.error('❌ connect-transport error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * produce — teacher/student starts producing media
     */
    socket.on('produce', async ({ transportId, kind, rtpParameters, appData }, callback) => {
      try {
        const sessionId = socket.sessionId;
        const producer = await createProducer(
          sessionId,
          transportId,
          socket.userId,
          kind,
          rtpParameters,
          appData
        );

        const source = appData?.source || kind;
        console.log(`🎬 PRODUCE: kind=${kind}, source=${source}, userId=${socket.userId}, sessionId=${sessionId}`);
        
        socket.to(sessionId).emit('new-producer', { producerId: producer.id, userId: socket.userId, kind });
        console.log(`📢 Broadcasted new-producer: ${producer.id} (${source}) to room ${sessionId}`);
        
        callback({ producerId: producer.id });
        console.log(`🎬 Producer created: ${kind} by ${socket.userId}`);
      } catch (err) {
        console.error('❌ produce error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * close-producer — teacher stops producing media (screen share, etc)
     */
    socket.on('close-producer', ({ producerId }) => {
      try {
        const sessionId = socket.sessionId;
        console.log(`🛑 Producer closed: ${producerId} by ${socket.userId}`);
        // Broadcast to all clients that this producer closed
        io.to(sessionId).emit('producer-closed', { producerId, userId: socket.userId });
      } catch (err) {
        console.error('❌ close-producer error:', err.message);
      }
    });

    /**
     * consume — student consumes a producer's media stream
     */
    socket.on('consume', async ({ producerId, transportId, rtpCapabilities }, callback) => {
      try {
        const sessionId = socket.sessionId;
        const consumer = await createConsumer(sessionId, transportId, producerId, rtpCapabilities);
        const producerMeta = listProducers(sessionId).find((p) => p.id === producerId) || {};

        console.log(`🍴 CONSUME: producerId=${producerId}, kind=${consumer.kind}, producerKind=${producerMeta.kind}, userId=${socket.userId}`);

        callback({
          producerId,
          consumerId: consumer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          producerUserId: producerMeta.userId,
          producerKind: producerMeta.kind,
        });
        console.log(`✅ Consumer created: ${consumer.id} for producer ${producerId} (${producerMeta.kind})`);
      } catch (err) {
        console.error('❌ consume error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * get-producers — returns active producers in the room
     */
    socket.on('get-producers', ({ sessionId }, callback) => {
      const producers = listProducers(sessionId);
      callback({ producers });
    });

    /**
     * resume-consumer — acknowledges consumer resume (noop placeholder)
     */
    socket.on('resume-consumer', ({ consumerId }, callback) => {
      callback?.({ resumed: true, consumerId });
    });

    /**
     * chat-message — relay chat to room
     */
    socket.on('chat-message', ({ sessionId, name, message }) => {
      io.to(sessionId).emit('chat-message', { name, message });
    });

    /**
     * toggle-transcript — placeholder hook
     */
    socket.on('toggle-transcript', ({ sessionId, enabled }) => {
      console.log(`📝 Transcript ${enabled ? 'on' : 'off'} for ${sessionId}`);
    });

    /**
     * toggle-record — placeholder hook
     */
    socket.on('toggle-record', ({ sessionId, enabled }) => {
      console.log(`⏺ Record ${enabled ? 'on' : 'off'} for ${sessionId}`);
    });

    /**
     * start-transcription — initialize transcription for session
     * FIXED: Reuse existing transcription if paused/resumed in same session
     */
    socket.on('start-transcription', async ({ sessionId, userId }, callback) => {
      try {
        console.log(`🎙️ START-TRANSCRIPTION for session ${sessionId} by teacher ${userId}`);

        // Fetch session to get className and subject
        const session = await Session.findOne({ sessionId });
        const className = session?.className || 'N/A';
        const subject = session?.subject || 'N/A';

        // Check if there's already an incomplete transcription for this session
        const existingTranscription = await Transcription.findOne({
          sessionId,
          status: { $in: ['recording', 'processing', 'completed'] }, // look for recent activity
        }).sort({ createdAt: -1 }); // most recent

        let transcription = existingTranscription;
        let isResuming = false;

        if (existingTranscription) {
          // Resuming: update existing transcription
          console.log(`♻️ RESUMING existing transcription: ${existingTranscription._id}`);
          transcription = await Transcription.findByIdAndUpdate(
            existingTranscription._id,
            {
              status: 'recording',
              isLive: true,
              lastSegmentTime: new Date(),
            },
            { new: true }
          );
          isResuming = true;
        } else {
          // New session: create fresh transcription
          transcription = await Transcription.create({
            sessionId,
            teacherId: userId,
            className,
            subject,
            status: 'recording',
            isLive: true,
          });
          console.log(`✨ NEW Transcription created: ${transcription._id} [${className} - ${subject}]`);
        }

        // Create debug header in the transcript file
        try {
          const debugHeader = `
═══════════════════════════════════════════════════════════════════════════════
🎤 TRANSCRIPTION SESSION DEBUG LOG
═══════════════════════════════════════════════════════════════════════════════
Session ID:     ${sessionId}
Teacher ID:     ${userId}
Class:          ${className}
Subject:        ${subject}
Started:        ${new Date().toISOString()}
Status:         ${isResuming ? 'RESUMED' : 'NEW'}
═══════════════════════════════════════════════════════════════════════════════

TRANSCRIPTION STREAM:
─────────────────────────────────────────────────────────────────────────────

`;
          appendTranscriptText({
            teacherId: userId,
            sessionId,
            text: debugHeader,
          });
          console.log(`📁 Created transcript file at: recordings/${userId}/${sessionId}/transcript.txt`);
        } catch (fileErr) {
          console.warn(`⚠️ Could not create transcript file: ${fileErr.message}`);
        }

        // Load segments into memory if they exist
        const segments = transcription.segments || [];
        activeTranscriptions.set(sessionId, {
          transcriptionId: transcription._id,
          teacherId: transcription.teacherId,
          sessionId: sessionId,
          segments: segments,
          startTime: Date.now(),
          chunkCount: 0,
        });

        console.log(`✅ Transcription started: ${transcription._id} (existing=${isResuming}, segments=${segments.length})`);
        console.log(`📁 Saving transcripts to: recordings/${transcription.teacherId}/${sessionId}/transcript.txt`);
        callback({
          transcriptionId: transcription._id,
          status: 'recording',
          isResuming,
          existingSegments: segments.length,
          className,
          subject,
        });
      } catch (err) {
        console.error('❌ start-transcription error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * audio-chunk — receive audio buffer and save to file
     * DO NOT transcribe individual chunks - accumulate them in recording.wav
     * We'll transcribe the complete file at end-transcription
     */
    socket.on('audio-chunk', async ({ sessionId, audioBuffer, timestamp }, callback) => {
      try {
        const bufferSize = audioBuffer?.length || 0;
        console.log(`[AUDIO-CHUNK] Received: sessionId=${sessionId}, size=${bufferSize}, timestamp=${timestamp}ms`);
        
        const transData = activeTranscriptions.get(sessionId);
        if (!transData) {
          console.warn('[AUDIO-CHUNK] ⚠️ No active transcription for session:', sessionId);
          return callback?.({ error: 'No active transcription', isRecording: false });
        }

        // Validate buffer
        if (!audioBuffer || (typeof audioBuffer !== 'string' && !Buffer.isBuffer(audioBuffer))) {
          console.warn('[AUDIO-CHUNK] ❌ Invalid audio buffer type:', typeof audioBuffer);
          return callback?.({ error: 'Invalid audio buffer' });
        }

        // Save audio chunk to file immediately
        try {
          transData.chunkCount = (transData.chunkCount || 0) + 1;
          saveAudioChunk({
            teacherId: transData.teacherId,
            sessionId: transData.sessionId,
            audioBuffer,
            chunkIndex: transData.chunkCount,
          });
          console.log(`[AUDIO-CHUNK] 🎵 Audio chunk #${transData.chunkCount} appended (${bufferSize} bytes)`);
        } catch (audioErr) {
          console.warn(`[AUDIO-CHUNK] ⚠️ Could not save audio chunk: ${audioErr.message}`);
        }

        // Track the chunk locally
        const segment = {
          timestamp: Math.floor(timestamp / 1000),
          chunkSize: bufferSize,
          received: new Date(),
        };

        if (!transData.segments) transData.segments = [];
        transData.segments.push(segment);

        callback?.({ status: 'saved', timestamp, chunkCount: transData.chunkCount });
      } catch (err) {
        console.error('❌ audio-chunk error:', err.message);
        callback?.({ error: err.message });
      }
    });

    /**
     * end-transcription — finalize and transcribe the complete recording
     */
    socket.on('end-transcription', async ({ sessionId, userId }, callback) => {
      try {
        console.log(`🛑 END-TRANSCRIPTION for session ${sessionId}`);

        const transData = activeTranscriptions.get(sessionId);
        if (!transData) {
          return callback?.({ error: 'No active transcription' });
        }

        console.log(`[END-TRANSCRIPTION] 📝 Transcribing complete recording with ${transData.chunkCount} audio chunks...`);

        const recordingDir = path.join(__dirname, '..', 'recordings', transData.teacherId.toString(), sessionId);
        const recordingPath = path.join(recordingDir, 'recording.wav');

        // Check if recording file exists
        if (!fs.existsSync(recordingPath)) {
          console.warn(`[END-TRANSCRIPTION] ⚠️ Recording file not found: ${recordingPath}`);
        } else {
          const fileStats = fs.statSync(recordingPath);
          console.log(`[END-TRANSCRIPTION] ✅ Recording file ready: ${fileStats.size} bytes`);

          // Now transcribe the COMPLETE recording file
          try {
            console.log(`[END-TRANSCRIPTION] 🔄 Calling Whisper to transcribe entire session...`);
            const { transcribeRecording } = require('../utils/transcriptionService');
            
            const transcriptionResult = await transcribeRecording(recordingPath);
            const fullText = transcriptionResult.text || '';
            const transcriptionSegments = transcriptionResult.segments || [];

            console.log(`[END-TRANSCRIPTION] ✅ Transcription complete: ${fullText.length} chars in ${transcriptionSegments.length} segments`);

            // Update MongoDB with transcription results
            const finalTranscription = await Transcription.findByIdAndUpdate(
              transData.transcriptionId,
              {
                status: 'completed',
                isLive: false,
                text: fullText,
                segments: transcriptionSegments,
              },
              { new: true }
            );

            // Save final transcription to text file
            try {
              const txtPath = path.join(recordingDir, 'transcript.txt');
              let transcriptContent = '';

              // Append transcription if file exists (keep debug header)
              if (fs.existsSync(txtPath)) {
                const existingContent = fs.readFileSync(txtPath, 'utf8');
                // Extract everything up to "TRANSCRIPTION STREAM"
                const headerMatch = existingContent.split('─────────────────────────────────────────────────────────────────────────────')[0];
                transcriptContent = headerMatch;
              }

              // Add transcription segments
              transcriptContent += `─────────────────────────────────────────────────────────────────────────────\n`;
              if (transcriptionSegments.length > 0) {
                for (let i = 0; i < transcriptionSegments.length; i++) {
                  const seg = transcriptionSegments[i];
                  const confidence = seg.confidence ? (seg.confidence * 100).toFixed(0) : '0';
                  const segText = String(seg.text || seg.id || '').trim();
                  if (segText) {
                    transcriptContent += `[${new Date().toISOString()}] [${i}s] [conf:${confidence}%] ${segText}\n`;
                  }
                }
              } else {
                transcriptContent += `(No text segments found - recording may have been silent)\n`;
              }

              transcriptContent += `─────────────────────────────────────────────────────────────────────────────\n`;
              transcriptContent += `Transcription completed: ${new Date().toISOString()}\n`;
              transcriptContent += `Total segments received: ${transcriptionSegments.length}\n`;
              transcriptContent += `Total characters: ${fullText.length}\n`;
              transcriptContent += `Audio chunks: ${transData.chunkCount}\n`;
              transcriptContent += `Recording file size: ${fileStats.size} bytes\n`;
              transcriptContent += `═══════════════════════════════════════════════════════════════════════════════\n`;

              fs.writeFileSync(txtPath, transcriptContent);
              console.log(`[END-TRANSCRIPTION] 📁 Transcript saved: ${txtPath}`);
            } catch (txtErr) {
              console.warn(`[END-TRANSCRIPTION] ⚠️ Could not write transcript: ${txtErr.message}`);
            }

            // Finalize audio recording
            try {
              const audioStats = finalizeAudioRecording({
                teacherId: transData.teacherId,
                sessionId: sessionId,
              });
              console.log(`[END-TRANSCRIPTION] 🎵 Audio recording finalized: ${audioStats.path} (${audioStats.size} bytes)`);
            } catch (audioErr) {
              console.warn(`[END-TRANSCRIPTION] ⚠️ Could not finalize audio: ${audioErr.message}`);
            }

            // Clean up in-memory
            activeTranscriptions.delete(sessionId);

            console.log(`✅ Session complete: ${transData.transcriptionId}`);
            console.log(`   📝 Transcribed: ${fullText.length} chars`);
            console.log(`   🎵 Audio: ${fileStats.size} bytes`);

            // ☁️ UPLOAD TO S3 (after transcription)
            const uploadFlag = (`${process.env.UPLOAD_TO_S3 || ''}`).trim().toLowerCase();
            if (uploadFlag === 'true') {
              try {
                console.log(`☁️ Starting S3 upload for session: ${sessionId}`);
                const { uploadSessionDirectory } = require('../utils/s3Upload');
                const s3Results = await uploadSessionDirectory({
                  teacherId: transData.teacherId,
                  sessionId: sessionId,
                });
                
                console.log(`☁️ S3 upload completed for ${sessionId}:`);
                s3Results.forEach((r) => {
                  if (r.success) {
                    console.log(`   ✅ Uploaded: ${r.key}`);
                  } else {
                    console.log(`   ❌ Failed: ${r.key || 'unknown'} - ${r.error || r.message}`);
                  }
                });
              } catch (s3Err) {
                console.warn(`⚠️ S3 upload failed for ${sessionId}: ${s3Err.message}`);
              }
            }

            callback({
              transcriptionId: finalTranscription._id,
              status: 'completed',
              segmentCount: transcriptionSegments.length,
              textLength: fullText.length,
            });

            // Emit to room
            io.to(sessionId).emit('transcription-completed', {
              transcriptionId: finalTranscription._id,
              segmentCount: transcriptionSegments.length,
              textLength: fullText.length,
            });

          } catch (transcribeErr) {
            console.error(`[END-TRANSCRIPTION] ❌ Transcription error: ${transcribeErr.message}`);
            
            // Mark as error but don't fail
            await Transcription.findByIdAndUpdate(
              transData.transcriptionId,
              {
                status: 'error',
                isLive: false,
              }
            );

            activeTranscriptions.delete(sessionId);
            callback({ error: `Transcription error: ${transcribeErr.message}` });
          }
        }
      } catch (err) {
        console.error('❌ end-transcription error:', err.message);
        callback?.({ error: err.message });
      }
    });

    /**
     * get-transcription — retrieve current transcription
     */
    socket.on('get-transcription', async ({ sessionId }, callback) => {
      try {
        const transcription = await Transcription.findOne({ sessionId }).select(
          'text segments status isLive'
        );

        if (!transcription) {
          return callback?.({
            text: '',
            segments: [],
            status: 'not-started',
          });
        }

        callback({
          text: transcription.text,
          segments: transcription.segments,
          status: transcription.status,
          isLive: transcription.isLive,
        });
      } catch (err) {
        console.error('❌ get-transcription error:', err.message);
        callback?.({ error: err.message, text: '', segments: [] });
      }
    });

    /**
     * disconnect — cleanup on socket disconnect
     */
    socket.on('disconnect', () => {
      if (socket.sessionId) {
        removeParticipantFromRoom(socket.sessionId, socket.userId);
        emitRoomParticipants(socket.sessionId);
        socket.to(socket.sessionId).emit('user-left', { userId: socket.userId });
      }
      socket.transportIds.forEach((id) => closeTransport(id));
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}

module.exports = { initSocketHandler };
